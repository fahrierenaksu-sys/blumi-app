import type { ChatMessage } from "@blumi/contracts"
import type { ChatService } from "./chatService"
import type { NotificationService } from "../notifications/notificationService"
import type { ConnectionManager } from "../realtime/connectionManager"
import type { SafetyService } from "../safety/safetyService"
import { PublicRequestError } from "../errors/publicRequestError"
import type { ChatDeliveryJob, ChatThreadMembers, TestPersona } from "./chatRepository"
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
  let recoveryInFlight = 0
  const measure = options.measure ?? createChatLatencyDiagnostics({
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    enabled: process.env.BLUMI_CHAT_LATENCY_DIAGNOSTICS === "1"
  })

  const dispatchPostPersistEffects = async (
    message: ChatMessage,
    thread: ChatThreadMembers,
    recipientUserIds: string[],
    leased?: { job: { leaseToken: string; attempt: number }; leaseUntil: number; recipientPersonas: TestPersona[] }
  ): Promise<void> => {
    try {
      if (leased) await dispatchLeased(message, thread, leased.job, leased.leaseUntil)
      else await dispatchClaimedInChain(new Date(), message.messageId, thread)
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
    // earlier message is never overtaken by the next one (live order).
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
      const dispatches = jobs.map((job) => dispatchJob(job, claimAt)
        .catch((error) => options.reportError?.(error))
        .finally(() => { recoveryInFlight -= 1 }))
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0 || !(await settleWithin(Promise.all(dispatches), remainingMs))) return
    }
  }

  /**
   * Claims and dispatches one message from inside its thread's dispatch
   * chain (the inline path already holds the chain, so it must not queue
   * behind itself).
   */
  async function dispatchClaimedInChain(now: Date, messageId: string, thread: ChatThreadMembers): Promise<void> {
    const jobs = await chatService.repository.claimDeliveries({ now, limit: 50, leaseMs: DELIVERY_LEASE_MS, messageId })
    for (const job of jobs) await dispatchJob(job, now, thread)
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
    leaseUntil: number
  ): Promise<void> {
    const now = new Date()
    if (leaseUntil - now.getTime() < DELIVERY_LEASE_MS - leaseRenewAfterMs) {
      const renewed = await chatService.repository.renewDeliveryLease(
        message.messageId, lease.leaseToken, new Date(now.getTime() + DELIVERY_LEASE_MS))
      if (!renewed) return
    }
    await dispatchJob({ message, leaseToken: lease.leaseToken, attempt: lease.attempt }, now, thread)
  }

  async function dispatchJob(job: ChatDeliveryJob, now: Date, knownThread?: ChatThreadMembers): Promise<void> {
    const { message, leaseToken } = job
    try {
      const thread = knownThread?.threadId === message.threadId
        ? knownThread
        : await chatService.repository.findThread(message.threadId)
      if (!thread || !thread.participantUserIds.includes(message.senderUserId)) {
        await chatService.repository.completeDelivery(message.messageId, leaseToken, now)
        return
      }
      const recipients = thread.participantUserIds.filter((id) => id !== message.senderUserId)
      const blocked = await Promise.all(recipients.map((id) => safetyService.hasBlockBetween(message.senderUserId, id)))
      if (!blocked.some(Boolean)) {
        await measure("fanout", () => connectionManager.sendToUsersDurably(thread.participantUserIds, { type: "chat.message_received", payload: message }))
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
      const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(job.attempt - 1, 6))
      await chatService.repository.retryDelivery(message.messageId, leaseToken, new Date(now.getTime() + backoffMs))
    }
  }
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
