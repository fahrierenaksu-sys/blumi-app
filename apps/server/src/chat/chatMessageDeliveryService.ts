import type { ChatMessage } from "@blumi/contracts"
import type { ChatService } from "./chatService"
import type { NotificationService } from "../notifications/notificationService"
import type { ConnectionManager } from "../realtime/connectionManager"
import type { SafetyService } from "../safety/safetyService"
import { PublicRequestError } from "../errors/publicRequestError"
import type { ChatDeliveryJob, ChatThreadMembers, TestPersona } from "./chatRepository"
import { classifyDatabaseError } from "../operations/databaseErrorStatus"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import { createChatLatencyDiagnostics, type ChatPhaseMeasure } from "./chatLatencyDiagnostics"

export class ChatDeliveryBlockedError extends PublicRequestError {}

export interface ChatMessageDeliveryService {
  dispatchDue(now?: Date): Promise<void>
  sendMessage(input: {
    senderUserId: string
    senderDisplayName?: string
    threadId: string
    body: string
    clientMessageId?: string
  }): Promise<{ message: ChatMessage; created: boolean }>
}

export function createChatMessageDeliveryService(options: {
  chatService: ChatService
  safetyService: SafetyService
  connectionManager: ConnectionManager
  notificationService: NotificationService
  reportError?: (error: unknown) => void
  /** A job given up after MAX_CHAT_DELIVERY_ATTEMPTS; never carries IDs or bodies. */
  reportDeadLetter?: (event: ChatDeliveryDeadLetter) => void
  measure?: ChatPhaseMeasure
  /** A send-leased dispatch that waited longer than this renews its lease first (tests shorten it). */
  leaseRenewAfterMs?: number
  /** The longest a recovery tick waits for its dispatches before it returns (tests shorten it). */
  recoveryTickWaitMs?: number
}): ChatMessageDeliveryService {
  const {
    chatService,
    safetyService,
    connectionManager,
    notificationService
  } = options
  const leaseRenewAfterMs = options.leaseRenewAfterMs ?? LEASE_RENEW_AFTER_MS
  const recoveryTickWaitMs = options.recoveryTickWaitMs ?? RECOVERY_TICK_WAIT_MS
  const reportDeadLetter = options.reportDeadLetter ?? logChatDeliveryDeadLetter
  let recoveryInFlight = 0
  const measure = options.measure ?? createChatLatencyDiagnostics({
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    enabled: process.env.BLUMI_CHAT_LATENCY_DIAGNOSTICS === "1"
  })

  /**
   * Live fan-out outcomes of messages this service persisted, until their
   * outbox dispatch reads them (by message ID).
   */
  const liveFanouts = new Map<string, Promise<LiveFanoutOutcome>>()

  /**
   * Sends a just-persisted message to the participants' sockets at once,
   * outside the thread's outbox chain (2026-10-02). That chain also waits on
   * push enqueue and outbox completion, several database round trips per
   * message, so when both partners sent at the same moment the second
   * message reached the other phone only after the first one's push work.
   * Live order is still kept: a message's sockets are written only after the
   * thread's previous live fan-out, while its own block check already runs.
   * The outbox dispatch reuses the outcome instead of repeating the block
   * check and the fan-out; the recovery worker (after a restart) fans out
   * itself.
   */
  const startLiveFanout = (message: ChatMessage, thread: ChatThreadMembers): void => {
    const recipients = thread.participantUserIds.filter((id) => id !== message.senderUserId)
    // Started now, in parallel with any earlier message's fan-out.
    const blockCheck = Promise.all(recipients.map((id) => safetyService.hasBlockBetween(message.senderUserId, id)))
    // Settled through the chain below; never an unhandled rejection meanwhile.
    blockCheck.catch(() => undefined)
    const outcome = enqueueLiveFanout(chatService, thread.threadId, async (): Promise<LiveFanoutOutcome> => {
      try {
        // Kept after the send statement's own check: it guards a block that
        // lands while the message is being persisted.
        if ((await blockCheck).some(Boolean)) return { kind: "blocked" }
        await measure("fanout", () => connectionManager.sendToUsersDurably(
          thread.participantUserIds,
          { type: "chat.message_received", payload: message }
        ))
        return { kind: "delivered" }
      } catch (error) {
        return { kind: "failed", error }
      }
    })
    liveFanouts.set(message.messageId, outcome)
  }

  const dispatchPostPersistEffects = async (
    message: ChatMessage,
    thread: ChatThreadMembers,
    recipientUserIds: string[],
    leased?: { job: { leaseToken: string; attempt: number }; leaseUntil: number; recipientPersonas: TestPersona[] }
  ): Promise<void> => {
    const live = liveFanouts.get(message.messageId)
    liveFanouts.delete(message.messageId)
    try {
      if (leased) await dispatchLeased(message, thread, leased.job, leased.leaseUntil, live)
      else await dispatchClaimedInChain(new Date(), message.messageId, thread, live)
    } catch (error) {
      options.reportError?.(error)
    }

    for (const recipientUserId of recipientUserIds) {
      try {
        const persona = leased
          ? leased.recipientPersonas.find((candidate) => candidate.userId === recipientUserId) ?? null
          : await chatService.repository.findTestPersona(recipientUserId)
        if (!persona?.replies.length) continue
        const replyIndex = stableReplyIndex(message.messageId, persona.replies.length)
        const reply = await chatService.sendMessageInThread(
          thread,
          persona.userId,
          persona.replies[replyIndex]!,
          `test-persona-reply-${message.messageId}`
        )
        try { await dispatchClaimedInChain(new Date(), reply.message.messageId, thread) }
        catch (error) { options.reportError?.(error) }
      } catch (error) {
        options.reportError?.(error)
      }
    }
  }

  return {
    async dispatchDue(now = new Date()) { await dispatchDue(now) },
    async sendMessage(input) {
      // One statement checks, persists and leases the outbox job (2026-10-01:
      // was thread, participants, two block reads, the insert and a claim).
      const startedAt = new Date()
      const checked = await measure("persist", () => chatService.sendMessageChecked({
        userId: input.senderUserId,
        threadId: input.threadId,
        body: input.body,
        clientMessageId: input.clientMessageId,
        leaseMs: DELIVERY_LEASE_MS,
        now: startedAt
      }))
      if (checked.kind === "stepwise") return sendMessageStepwise(input)
      // Same message as a thread the sender is not in: a block hides the
      // thread from both users and must not be revealed by the answer.
      if (checked.kind === "blocked") throw new ChatDeliveryBlockedError("That conversation is not available.")
      if (checked.kind === "answered") return { message: checked.message, created: false }
      const { message, members } = checked
      const recipientUserIds = members.participantUserIds.filter((userId) => userId !== input.senderUserId)
      // A retry is delivered by its outbox job only, so it never fans out twice.
      if (checked.created) startLiveFanout(message, members)
      // The persisted message plus durable outbox row is the send ACK; the
      // dispatch below is serialized per thread, as in the stepwise path.
      void enqueueThreadDispatch(chatService, members.threadId, () => dispatchPostPersistEffects(
        message,
        members,
        recipientUserIds,
        checked.job
          ? { job: checked.job, leaseUntil: startedAt.getTime() + DELIVERY_LEASE_MS, recipientPersonas: checked.recipientPersonas ?? [] }
          : undefined
      )).catch((error) => options.reportError?.(error))
      return { message, created: checked.created }
    }
  }

  /**
   * The send as separate reads and a write: for input the one-statement path
   * refuses (its errors keep their precedence behind the conversation and
   * block checks) and for a concurrent first send of the same client message ID.
   */
  async function sendMessageStepwise(input: Parameters<ChatMessageDeliveryService["sendMessage"]>[0]) {
    const thread = await chatService.repository.findThread(input.threadId)
    if (!thread || !thread.participantUserIds.includes(input.senderUserId)) {
      throw new PublicRequestError("That conversation is not available.")
    }

    const recipientUserIds = thread.participantUserIds.filter(
      (userId) => userId !== input.senderUserId
    )
    const blocked = await Promise.all(
      recipientUserIds.map((userId) =>
        safetyService.hasBlockBetween(input.senderUserId, userId)
      )
    )
    if (blocked.some(Boolean)) {
      const committedRetry = input.clientMessageId
        ? await chatService.findIdempotentMessage(
          input.senderUserId,
          input.threadId,
          input.body,
          input.clientMessageId
        )
        : null
      if (committedRetry) return { message: committedRetry, created: false }
      // Same message as a thread the sender is not in: a block hides the
      // thread from both users and must not be revealed by the answer.
      throw new ChatDeliveryBlockedError("That conversation is not available.")
    }

    // The thread read above is reused for persistence and the inline
    // dispatch (participants never change after creation), so a send reads
    // it once instead of three times. The block check at dispatch stays: it
    // guards a block that lands while the message is being persisted.
    const delivery = await measure("persist", () => chatService.sendMessageInThread(
      thread,
      input.senderUserId,
      input.body,
      input.clientMessageId
    ))
    // The persisted message plus durable outbox row is the send ACK. Push/realtime
    // fanout and synthetic test-persona replies must not delay that confirmation.
    // The periodic worker recovers the outbox if this process exits mid-dispatch.
    // Serialized per thread, in persist order, so a slower dispatch of an
    // earlier message is never overtaken by the next one (live order). The
    // live fan-out goes ahead of that chain (see startLiveFanout).
    if (delivery.created) startLiveFanout(delivery.message, thread)
    void enqueueThreadDispatch(chatService, thread.threadId, () => dispatchPostPersistEffects(
      delivery.message,
      thread,
      recipientUserIds
    )).catch((error) => options.reportError?.(error))
    return delivery
  }

  /**
   * Recovers due outbox jobs. A claim takes only each thread's oldest
   * undelivered job, so the jobs of one round belong to different threads and
   * run in parallel, and a thread's later messages wait until its earlier one
   * is delivered (also while that one is in retry backoff). When a round
   * settles, the tick claims again, so a thread's backlog drains in order
   * within one tick. A tick lasts at most `recoveryTickWaitMs`, so one slow
   * thread cannot stall recovery of the others: a dispatch still running
   * keeps its lease and is not claimed again until the lease runs out.
   * Recovered jobs never join the inline dispatch chains; the claim order
   * already keeps a thread's order.
   */
  async function dispatchDue(now: Date): Promise<void> {
    const tickStartedAt = Date.now()
    const deadline = tickStartedAt + recoveryTickWaitMs
    for (;;) {
      const limit = Math.min(RECOVERY_BATCH_SIZE, MAX_RECOVERY_IN_FLIGHT - recoveryInFlight)
      if (limit <= 0) return
      // `now` may be a test clock; later rounds advance it by the time spent.
      const claimAt = new Date(now.getTime() + (Date.now() - tickStartedAt))
      const jobs = await chatService.repository.claimDeliveries({ now: claimAt, limit, leaseMs: DELIVERY_LEASE_MS })
      if (jobs.length === 0) return
      recoveryInFlight += jobs.length
      const dispatches = jobs.map((job) => trackRecoveryDispatch(chatService, dispatchJob(job, claimAt)
        .catch((error) => options.reportError?.(error))
        .finally(() => { recoveryInFlight -= 1 })))
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0 || !(await settleWithin(Promise.all(dispatches), remainingMs))) return
    }
  }

  /**
   * Claims and dispatches one message from inside its thread's dispatch
   * chain (the inline path already holds the chain, so it must not queue
   * behind itself).
   */
  async function dispatchClaimedInChain(
    now: Date,
    messageId: string,
    thread: ChatThreadMembers,
    live?: Promise<LiveFanoutOutcome>
  ): Promise<void> {
    const jobs = await chatService.repository.claimDeliveries({ now, limit: 50, leaseMs: DELIVERY_LEASE_MS, messageId })
    for (const job of jobs) await dispatchJob(job, now, thread, job.message.messageId === messageId ? live : undefined)
  }

  /**
   * Dispatches a job the send statement leased to this process. A dispatch
   * that waited (a saturated pool or slower dispatches ahead on its thread)
   * first renews the lease, so it always starts with at least two thirds of
   * a lease, close to the full lease a claim gives; a lost lease means the
   * outbox worker took the job over and delivers it instead.
   */
  async function dispatchLeased(
    message: ChatMessage,
    thread: ChatThreadMembers,
    lease: { leaseToken: string; attempt: number },
    leaseUntil: number,
    live?: Promise<LiveFanoutOutcome>
  ): Promise<void> {
    const now = new Date()
    if (leaseUntil - now.getTime() < DELIVERY_LEASE_MS - leaseRenewAfterMs) {
      const renewed = await chatService.repository.renewDeliveryLease(
        message.messageId, lease.leaseToken, new Date(now.getTime() + DELIVERY_LEASE_MS))
      if (!renewed) return
    }
    await dispatchJob({ message, leaseToken: lease.leaseToken, attempt: lease.attempt }, now, thread, live)
  }

  async function deadLetter(job: ChatDeliveryJob, now: Date, reason: ChatDeliveryDeadLetter["reason"], errorKind: string) {
    await chatService.repository.deadLetterDelivery(job.message.messageId, job.leaseToken, now)
    try {
      reportDeadLetter({ reason, attempts: job.attempt, errorKind, count: 1 })
    } catch { /* Diagnostics must not change delivery state. */ }
  }

  async function dispatchJob(
    job: ChatDeliveryJob,
    now: Date,
    knownThread?: ChatThreadMembers,
    live?: Promise<LiveFanoutOutcome>
  ): Promise<void> {
    const { message, leaseToken } = job
    // Claimed again after its lease ran out every time (a dispatch that
    // never finishes, or a crash loop): stop holding the thread back.
    if (job.attempt > MAX_CHAT_DELIVERY_ATTEMPTS) {
      await deadLetter(job, now, "lease_exhausted", "LeaseExpired")
      return
    }
    try {
      const thread = knownThread?.threadId === message.threadId
        ? knownThread
        : await chatService.repository.findThread(message.threadId)
      if (!thread || !thread.participantUserIds.includes(message.senderUserId)) {
        await chatService.repository.completeDelivery(message.messageId, leaseToken, now)
        return
      }
      const recipients = thread.participantUserIds.filter((id) => id !== message.senderUserId)
      const liveOutcome = live ? await live : undefined
      // A failed live fan-out fails this attempt: the job is retried with backoff.
      if (liveOutcome?.kind === "failed") throw liveOutcome.error
      const allowed = liveOutcome
        ? liveOutcome.kind === "delivered"
        : !(await Promise.all(recipients.map((id) => safetyService.hasBlockBetween(message.senderUserId, id)))).some(Boolean)
      if (allowed) {
        if (!liveOutcome) {
          await measure("fanout", () => connectionManager.sendToUsersDurably(thread.participantUserIds, { type: "chat.message_received", payload: message }))
        }
        await Promise.all(recipients.map(async (userId) => {
          await measure("push_enqueue", () => notificationService.sendPushToUser(userId, {
            title: "Blumi", body: "You have a new message.",
            data: { type: "chat.message", threadId: message.threadId, messageId: message.messageId }
          }))
        }))
      }
      await chatService.repository.completeDelivery(message.messageId, leaseToken, now)
    } catch (error) {
      options.reportError?.(error)
      // A transient infrastructure failure (2026-10-02: a pooler refusal
      // during a deploy, a busy pool) is retried without counting, so a
      // five-minute outage no longer dead-letters every message in it. Past
      // TRANSIENT_RETRY_HORIZON_MS it counts again, so nothing retries forever.
      const ageMs = now.getTime() - Date.parse(message.sentAt)
      const transient = classifyDatabaseError(error)?.statusCode === 503 &&
        Number.isFinite(ageMs) && ageMs < TRANSIENT_RETRY_HORIZON_MS
      if (transient) {
        const backoffMs = Math.min(60_000, Math.max(1_000, Math.floor(ageMs / 4)))
        await chatService.repository.retryDelivery(message.messageId, leaseToken, new Date(now.getTime() + backoffMs), { refundAttempt: true })
        return
      }
      // A message that keeps failing would hold every later message of its
      // thread back forever (a thread delivers in order): give up on it.
      if (job.attempt >= MAX_CHAT_DELIVERY_ATTEMPTS) {
        await deadLetter(job, now, "attempts_exhausted", safeOperationalErrorKind(error))
        return
      }
      const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(job.attempt - 1, 6))
      await chatService.repository.retryDelivery(message.messageId, leaseToken, new Date(now.getTime() + backoffMs))
    }
  }
}

/**
 * Attempts before a chat delivery is dead-lettered. With the 1 s doubling
 * backoff capped at 60 s, ten attempts span about five minutes.
 */
export const MAX_CHAT_DELIVERY_ATTEMPTS = 10

/**
 * How long transient failures (classifyDatabaseError: 503) are retried
 * without counting toward MAX_CHAT_DELIVERY_ATTEMPTS, measured from the
 * message's sentAt. A later push is worth little, and a thread must not wait
 * behind one message forever.
 */
export const TRANSIENT_RETRY_HORIZON_MS = 60 * 60 * 1000

export interface ChatDeliveryDeadLetter {
  reason: "attempts_exhausted" | "lease_exhausted"
  attempts: number
  /** safeOperationalErrorKind: a class name, never a message. */
  errorKind: string
  count: 1
}

/** One structured line, no message, thread or user IDs and no body. */
function logChatDeliveryDeadLetter(event: ChatDeliveryDeadLetter): void {
  console.error(JSON.stringify({ metric: "chat_delivery_dead_letter", ...event }))
}

/** How long a claimed or send-leased outbox job belongs to its dispatcher. */
const DELIVERY_LEASE_MS = 30_000
/** A send-leased dispatch that waited longer than this renews its lease first. */
const LEASE_RENEW_AFTER_MS = 10_000
/** Jobs one recovery tick claims (at most one per thread). */
const RECOVERY_BATCH_SIZE = 50
/** Recovered dispatches that may still run after their tick returned. */
const MAX_RECOVERY_IN_FLIGHT = 200
/** How long one recovery tick may claim and wait for its dispatches. */
const RECOVERY_TICK_WAIT_MS = 2_000

/** True when `work` settles within `ms`, false when the time runs out first. */
function settleWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // Not unref'd: a tick waiting on a dispatch must keep the process alive.
    const timer = setTimeout(() => resolve(false), ms)
    const settled = () => {
      clearTimeout(timer)
      resolve(true)
    }
    void work.then(settled, settled)
  })
}

/**
 * Inline post-persist dispatch chains, per chat service (the HTTP route and
 * the realtime router each build their own delivery service over the same
 * chat service) and per thread. The outbox worker stays independent: a claim
 * takes only a thread's oldest undelivered job and a send behind an
 * undelivered message is not leased, so neither path overtakes the other; a
 * job whose lease the worker took is skipped by the inline dispatch (fenced
 * lease).
 */
const threadDispatchChains = new WeakMap<ChatService, Map<string, Promise<void>>>()

/** Recovered dispatches still running after their tick returned, per chat service. */
const recoveryDispatches = new WeakMap<ChatService, Set<Promise<unknown>>>()

function trackRecoveryDispatch<T>(chatService: ChatService, dispatch: Promise<T>): Promise<T> {
  let running = recoveryDispatches.get(chatService)
  if (!running) {
    running = new Set()
    recoveryDispatches.set(chatService, running)
  }
  const set = running
  set.add(dispatch)
  void dispatch.finally(() => set.delete(dispatch)).catch(() => undefined)
  return dispatch
}

/**
 * Waits, up to `timeoutMs`, for every post-persist dispatch of this chat
 * service: the inline per-thread chains (live fan-out, push enqueue, outbox
 * completion) and recovered jobs. Shutdown runs it before the pool closes
 * (2026-10-02): a dispatch cut off by a closed pool kept its job leased for
 * DELIVERY_LEASE_MS, so the next instance pushed it 30 s late. Work queued
 * while it waits is waited for too. Never throws.
 */
export async function drainChatDispatches(chatService: ChatService, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const pending = [
      ...(threadDispatchChains.get(chatService)?.values() ?? []),
      ...(liveFanoutChains.get(chatService)?.values() ?? []),
      ...(recoveryDispatches.get(chatService) ?? [])
    ].map((work) => work.catch(() => undefined))
    if (pending.length === 0) return
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0 || !(await settleWithin(Promise.all(pending), remainingMs))) return
  }
}

/** What a live fan-out did; the outbox dispatch of the same message reuses it. */
type LiveFanoutOutcome = { kind: "delivered" } | { kind: "blocked" } | { kind: "failed"; error: unknown }

/**
 * Live fan-out order per chat service and thread (shared by the HTTP route
 * and the realtime router, like the dispatch chains). Each link waits only on
 * the previous message's socket writes, never on push or outbox work.
 */
const liveFanoutChains = new WeakMap<ChatService, Map<string, Promise<unknown>>>()

function enqueueLiveFanout<T>(chatService: ChatService, threadId: string, fanout: () => Promise<T>): Promise<T> {
  let chains = liveFanoutChains.get(chatService)
  if (!chains) {
    chains = new Map()
    liveFanoutChains.set(chatService, chains)
  }
  const threadChains = chains
  const current = (threadChains.get(threadId) ?? Promise.resolve()).then(fanout)
  const tail = current.catch(() => undefined)
  threadChains.set(threadId, tail)
  void tail.then(() => {
    if (threadChains.get(threadId) === tail) threadChains.delete(threadId)
  })
  return current
}

function enqueueThreadDispatch(chatService: ChatService, threadId: string, dispatch: () => Promise<void>): Promise<void> {
  let chains = threadDispatchChains.get(chatService)
  if (!chains) {
    chains = new Map()
    threadDispatchChains.set(chatService, chains)
  }
  const threadChains = chains
  const current = (threadChains.get(threadId) ?? Promise.resolve()).then(dispatch)
  const tail = current.catch(() => undefined)
  threadChains.set(threadId, tail)
  void tail.then(() => {
    if (threadChains.get(threadId) === tail) threadChains.delete(threadId)
  })
  return current
}

function stableReplyIndex(messageId: string, count: number): number {
  let hash = 0
  for (const character of messageId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return hash % count
}
