import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { setTimeout as delay } from "node:timers/promises"
import { toOutgoingPushNotification } from "../notifications/pushMessagePolicy"
import {
  percentile,
  userIdsIn,
  type EventOf,
  type Received,
  type SimSocket,
  type SimUser,
  type SocialLoopHarness
} from "./socialLoopHarness"

/**
 * The person-to-person scenarios of the social loop, written once and run by
 * socialLoop.e2e.test.ts (in memory, with latency budgets) and by
 * socialLoop.postgres.test.ts (PostgreSQL through the isolated gate).
 * Every scenario asserts what each person sees, in which order, and that
 * nothing else reaches them.
 */

export interface ScenarioContext {
  harness: SocialLoopHarness
  /**
   * Upper bound for one realtime event to reach the other phone, measured
   * from the start of the causing request. Undefined: measured and reported only.
   */
  eventBudgetMs?: number
  report(line: string): void
}

/** Walk targets on the shared mini-room floor (MINI_ROOM_FLOOR). */
const WALK_Y = 0.7
const walkX = (step: number) => Number((0.38 + step * 0.025).toFixed(3))

export function assertWithinBudget(context: ScenarioContext, label: string, elapsedMs: number): void {
  if (context.eventBudgetMs === undefined) return
  assert.ok(elapsedMs < context.eventBudgetMs,
    `${label} took ${elapsedMs.toFixed(1)} ms (budget ${context.eventBudgetMs} ms)`)
}

function formatMs(values: readonly number[]): string {
  return `p50 ${percentile(values, 0.5).toFixed(1)} ms, p95 ${percentile(values, 0.95).toFixed(1)} ms, ` +
    `max ${Math.max(...values).toFixed(1)} ms (n=${values.length})`
}

async function discoverAll(user: SimUser): Promise<string[]> {
  const seen: string[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const response = await user.http("GET", `/v1/discover?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    seen.push(...(response.body.profiles as Array<{ userId: string }>).map((profile) => profile.userId))
    cursor = response.body.page.nextCursor ?? undefined
    if (!cursor) break
  }
  return seen
}

async function threadIdsOf(user: SimUser): Promise<string[]> {
  const listed = await user.http("GET", "/v1/threads")
  assert.equal(listed.status, 200)
  return (listed.body.threads as Array<{ threadId: string }>).map((thread) => thread.threadId)
}

export async function connectedMatchedPair(context: ScenarioContext, names: [string, string] = ["Ada", "Bora"]) {
  const { harness } = context
  const ada = await harness.signUp(names[0])
  const bora = await harness.signUp(names[1], { gender: "man" })
  const [sa, sb] = await Promise.all([ada.connect(), bora.connect()])
  const { matchId, threadId } = await harness.matchPair(ada, bora)
  await Promise.all([
    sa.waitFor("chat.thread_created", (event) => event.payload.threadId === threadId),
    sb.waitFor("chat.thread_created", (event) => event.payload.threadId === threadId)
  ])
  return { ada, bora, sa, sb, matchId, threadId }
}

/** Both phones in the shared room scene, each seeing both avatars present. */
export async function enterRoomTogether(sa: SimSocket, sb: SimSocket, miniRoomId: string) {
  const [markA, markB] = [sa.mark(), sb.mark()]
  sa.send("mini_room.scene_enter", { miniRoomId })
  sb.send("mini_room.scene_enter", { miniRoomId })
  const bothPresent = (event: EventOf<"mini_room.motion_snapshot">) =>
    event.payload.miniRoomId === miniRoomId && event.payload.avatars.every((avatar) => avatar.present)
  await Promise.all([
    sa.waitFor("mini_room.motion_snapshot", bothPresent, { since: markA }),
    sb.waitFor("mini_room.motion_snapshot", bothPresent, { since: markB })
  ])
}

function movesOf(socket: SimSocket, userId: string, since = 0): Array<Received<EventOf<"mini_room.avatar_moved">>> {
  return socket.received("mini_room.avatar_moved", since).filter((entry) => entry.event.payload.avatar.userId === userId)
}

function eventsNaming(socket: SimSocket, userId: string, since: number) {
  return socket.events.slice(since).filter((entry) => userIdsIn(entry.event).has(userId))
}

// Scenario 1 ------------------------------------------------------------------

export async function mutualLikeOpensOneThread(context: ScenarioContext): Promise<void> {
  const { harness } = context
  const ada = await harness.signUp("Ada")
  const bora = await harness.signUp("Bora", { gender: "man" })
  const [sa, sb] = await Promise.all([ada.connect(), bora.connect()])

  assert.ok((await discoverAll(ada)).includes(bora.userId), "Ada's Discover shows Bora")
  assert.ok((await discoverAll(bora)).includes(ada.userId), "Bora's Discover shows Ada")

  const like = await ada.http("POST", `/v1/discover/${bora.userId}/like`, {})
  assert.equal(like.status, 200)
  assert.equal(like.body.matched, false)
  await Promise.all([sa.barrier(), sb.barrier()])
  assert.deepEqual([...sa.received("chat.thread_created"), ...sb.received("chat.thread_created")], [],
    "a one-sided like opens nothing and tells nobody")

  const [markA, markB] = [sa.mark(), sb.mark()]
  const likeBack = await bora.http("POST", `/v1/discover/${ada.userId}/like`, {})
  assert.equal(likeBack.status, 200)
  assert.equal(likeBack.body.matched, true)
  const matchId = likeBack.body.match.matchId as string
  const threadId = `thread_match_${matchId}`
  const sameThread = (event: EventOf<"chat.thread_created">) => event.payload.threadId === threadId
  const [seenByAda, seenByBora] = await Promise.all([
    sa.waitFor("chat.thread_created", sameThread, { since: markA }),
    sb.waitFor("chat.thread_created", sameThread, { since: markB })
  ])
  assertWithinBudget(context, "match -> Ada's chat.thread_created", seenByAda.at - likeBack.startedAt)
  assertWithinBudget(context, "match -> Bora's chat.thread_created", seenByBora.at - likeBack.startedAt)
  context.report(`match announcement: Ada ${(seenByAda.at - likeBack.startedAt).toFixed(1)} ms, ` +
    `Bora ${(seenByBora.at - likeBack.startedAt).toFixed(1)} ms after the matching like was sent`)
  for (const seen of [seenByAda, seenByBora]) {
    assert.deepEqual(seen.event.payload.participantUserIds, [ada.userId, bora.userId].sort())
    assert.deepEqual(seen.event.payload.participants.map((participant) => participant.displayName).sort(), ["Ada", "Bora"])
  }

  await Promise.all([sa.barrier(), sb.barrier()])
  assert.equal(sa.received("chat.thread_created", markA).length, 1, "Ada is told once")
  assert.equal(sb.received("chat.thread_created", markB).length, 1, "Bora is told once")
  assert.equal((await harness.services.matchService.repository.listMatchesForUser(ada.userId)).length, 1)
  assert.deepEqual(await threadIdsOf(ada), [threadId])
  assert.deepEqual(await threadIdsOf(bora), [threadId])
  assert.ok(!(await discoverAll(ada)).includes(bora.userId), "a match leaves Discover")
  assert.ok(!(await discoverAll(bora)).includes(ada.userId), "a match leaves Discover")
  await Promise.all([sa.close(), sb.close()])
}

// Scenario 2 ------------------------------------------------------------------

type SentMessage = { messageId: string; body: string; startedAt: number }

async function sendOverHttp(user: SimUser, threadId: string, body: string, clientMessageId: string): Promise<SentMessage> {
  const response = await user.http("POST", `/v1/threads/${threadId}/messages`, { body, clientMessageId })
  // 201 is the "sent" tick: the message and its delivery outbox row are committed.
  assert.equal(response.status, 201, JSON.stringify(response.body))
  assert.equal(response.body.message.senderUserId, user.userId)
  return { messageId: response.body.message.messageId as string, body, startedAt: response.startedAt }
}

function readReceiptsFor(socket: SimSocket, threadId: string, since: number) {
  return socket.received("chat.receipt_updated", since)
    .filter((entry) => entry.event.payload.threadId === threadId && entry.event.payload.readUpTo)
}

async function setReadReceipts(user: SimUser, enabled: boolean): Promise<void> {
  const saved = await user.http("PUT", "/v1/chat-preferences", { readReceiptsEnabled: enabled })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.deepEqual(saved.body, { preferences: { readReceiptsEnabled: enabled }, available: true })
}

async function partnerReceiptsSeenBy(user: SimUser, threadId: string) {
  const listed = await user.http("GET", `/v1/threads/${threadId}/messages`)
  assert.equal(listed.status, 200)
  return listed.body.partnerReceipts as { deliveredUpTo?: { messageId?: string }; readUpTo?: { messageId?: string } } | undefined
}

export async function chatBurstDeliversOnceInOrderWithReceipts(context: ScenarioContext): Promise<void> {
  const { ada, bora, sa, sb, threadId } = await connectedMatchedPair(context)
  const [markA, markB] = [sa.mark(), sb.mark()]

  // Twenty sends back to back, each started as soon as the previous one was acknowledged.
  const sent: SentMessage[] = []
  for (let index = 1; index <= 20; index += 1) {
    sent.push(await sendOverHttp(ada, threadId, `burst ${index}`, `e2e-burst-${String(index).padStart(4, "0")}`))
  }
  const fromAda = (event: EventOf<"chat.message_received">) =>
    event.payload.threadId === threadId && event.payload.senderUserId === ada.userId
  const boraGot = await sb.waitForCount("chat.message_received", 20, fromAda, { since: markB })
  const adaEcho = await sa.waitForCount("chat.message_received", 20, fromAda, { since: markA })
  await Promise.all([sa.barrier(), sb.barrier()])
  const ids = (entries: Array<Received<EventOf<"chat.message_received">>>) => entries.map((entry) => entry.event.payload.messageId)
  assert.deepEqual(ids(sb.received("chat.message_received", markB)), sent.map((message) => message.messageId),
    "Bora receives every message exactly once, in send order")
  assert.deepEqual(ids(sa.received("chat.message_received", markA)), sent.map((message) => message.messageId),
    "Ada's own phone gets each message once (the send echo)")
  assert.equal(adaEcho.length, 20)
  assert.deepEqual(boraGot.map((entry) => entry.event.payload.body), sent.map((message) => message.body))
  const latencies = boraGot.map((entry, index) => entry.at - sent[index]!.startedAt)
  for (const [index, latency] of latencies.entries()) assertWithinBudget(context, `message ${index + 1} -> Bora`, latency)
  context.report(`HTTP send -> partner socket (20 sequential): ${formatMs(latencies)}`)

  // A concurrent burst (independent requests): each message arrives once, and
  // ordering by (sentAt, messageId), as the app's chat store does, yields the
  // server's stored order. Live arrival order itself is not guaranteed for
  // concurrent requests (commits and dispatches race on PostgreSQL).
  const burstMark = sb.mark()
  const concurrent = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    sendOverHttp(ada, threadId, `parallel ${index}`, `e2e-parallel-${String(index).padStart(4, "0")}`)))
  await sb.waitForCount("chat.message_received", 10, fromAda, { since: burstMark })
  const history = await bora.http("GET", `/v1/threads/${threadId}/messages?limit=50`)
  assert.equal(history.status, 200)
  const storedOrder = (history.body.messages as Array<{ messageId: string }>).map((message) => message.messageId)
  const concurrentIds = new Set(concurrent.map((message) => message.messageId))
  const arrived = sb.received("chat.message_received", burstMark).map((entry) => entry.event.payload)
  assert.equal(new Set(arrived.map((message) => message.messageId)).size, arrived.length, "no duplicates")
  const appOrder = [...arrived].sort((left, right) =>
    Date.parse(left.sentAt) - Date.parse(right.sentAt) || left.messageId.localeCompare(right.messageId))
  assert.deepEqual(appOrder.map((message) => message.messageId), storedOrder.filter((id) => concurrentIds.has(id)),
    "the app's (sentAt, messageId) order of concurrent sends equals the stored order")
  const inArrivalOrder = arrived.every((message, index) => message.messageId === appOrder[index]!.messageId)
  context.report(`10 concurrent sends: live arrival ${inArrivalOrder ? "matched" : "differed from"} the stored order`)
  assert.deepEqual(storedOrder.filter((id) => !concurrentIds.has(id)), sent.map((message) => message.messageId))

  // Delivered (two ticks): the history read above already acknowledged
  // delivery; an explicit ack from Bora's phone is cumulative and idempotent.
  const last = concurrent.reduce((latest, message) =>
    storedOrder.indexOf(message.messageId) > storedOrder.indexOf(latest.messageId) ? message : latest)
  const deliveredMark = sa.mark()
  sb.send("chat.ack_delivered", { threadId, upToMessageId: last.messageId })
  const delivered = await sa.waitFor("chat.receipt_updated", (event) =>
    event.payload.threadId === threadId && event.payload.deliveredUpTo?.messageId === last.messageId,
  { since: markA })
  assert.equal(delivered.event.payload.userId, bora.userId)
  assert.equal(delivered.event.payload.readUpTo, undefined, "delivery never carries a read cursor")
  await Promise.all([sa.barrier(), sb.barrier()])
  assert.ok(sa.received("chat.receipt_updated", deliveredMark).length <= 1, "a repeated ack is a no-op")
  assert.equal(sb.received("chat.receipt_updated", markB).length, 0, "receipts only go to the other person")
  assert.equal((await partnerReceiptsSeenBy(ada, threadId))?.deliveredUpTo?.messageId, last.messageId)

  // Read receipts are off by default and mutual: three one-sided states leak nothing.
  const readCases: Array<{ label: string; ada: boolean; bora: boolean }> = [
    { label: "neither enabled", ada: false, bora: false },
    { label: "only the sender enabled", ada: true, bora: false },
    { label: "only the reader enabled", ada: false, bora: true }
  ]
  for (const [index, readCase] of readCases.entries()) {
    await setReadReceipts(ada, readCase.ada)
    await setReadReceipts(bora, readCase.bora)
    const message = await sendOverHttp(ada, threadId, `read case ${index}`, `e2e-read-case-${index}-000`)
    await sb.waitFor("chat.message_received", (event) => event.payload.messageId === message.messageId)
    const mark = sa.mark()
    const read = await bora.http("POST", `/v1/threads/${threadId}/read`, { upToMessageId: message.messageId })
    assert.equal(read.status, 200, JSON.stringify(read.body))
    await sa.barrier()
    assert.deepEqual(readReceiptsFor(sa, threadId, mark), [], `no read receipt when ${readCase.label}`)
    assert.equal((await partnerReceiptsSeenBy(ada, threadId))?.readUpTo, undefined, `no read cursor projected when ${readCase.label}`)
    assert.equal((await partnerReceiptsSeenBy(bora, threadId))?.readUpTo, undefined)
  }

  await setReadReceipts(ada, true)
  await setReadReceipts(bora, true)
  const final = await sendOverHttp(ada, threadId, "read me", "e2e-read-final-0000")
  await sb.waitFor("chat.message_received", (event) => event.payload.messageId === final.messageId)
  const mark = sa.mark()
  const boraMark = sb.mark()
  const read = await bora.http("POST", `/v1/threads/${threadId}/read`, { upToMessageId: final.messageId })
  assert.equal(read.status, 200)
  const readSeen = await sa.waitFor("chat.receipt_updated", (event) =>
    event.payload.threadId === threadId && event.payload.readUpTo?.messageId === final.messageId, { since: mark })
  assertWithinBudget(context, "read -> sender's read tick", readSeen.at - read.startedAt)
  context.report(`read receipt -> sender: ${(readSeen.at - read.startedAt).toFixed(1)} ms`)
  assert.equal(readSeen.event.payload.userId, bora.userId)
  assert.equal((await partnerReceiptsSeenBy(ada, threadId))?.readUpTo?.messageId, final.messageId)
  await sb.barrier()
  assert.equal(sb.received("chat.receipt_updated", boraMark).length, 0, "the reader is never sent their own receipt")
  assert.ok(sb.received("chat.thread_read", boraMark).every((entry) => entry.event.payload.userId === bora.userId))
  assert.equal(sa.received("chat.thread_read", mark).length, 0, "the partner is not sent the reader's unread count")
  await Promise.all([sa.close(), sb.close()])
}

// Scenario 3 ------------------------------------------------------------------

function presenceOf(event: EventOf<"mini_room.motion_snapshot">, userId: string) {
  const avatar = event.payload.avatars.find((candidate) => candidate.userId === userId)
  assert.ok(avatar, `snapshot lists ${userId}`)
  return avatar
}

export async function sharedRoomSyncsMotionChatAndPresence(context: ScenarioContext): Promise<void> {
  const { ada, bora, sa, sb, threadId } = await connectedMatchedPair(context)

  // Invite from the chat, accept from the chat.
  let [markA, markB] = [sa.mark(), sb.mark()]
  const invite = await ada.http("POST", `/v1/threads/${threadId}/room-invites`, {})
  assert.equal(invite.status, 201, JSON.stringify(invite.body))
  const inviteId = invite.body.invite.inviteId as string
  const pending = (event: EventOf<"chat.room_invite_updated">) => event.payload.inviteId === inviteId && event.payload.status === "pending"
  const [inviteSeenByBora] = await Promise.all([
    sb.waitFor("chat.room_invite_updated", pending, { since: markB }),
    sa.waitFor("chat.room_invite_updated", pending, { since: markA })
  ])
  assertWithinBudget(context, "invite -> invitee", inviteSeenByBora.at - invite.startedAt)
  assert.equal(inviteSeenByBora.event.payload.senderUserId, ada.userId)

  ;[markA, markB] = [sa.mark(), sb.mark()]
  const accepted = await bora.http("POST", `/v1/room-invites/${inviteId}/decision`, { status: "accepted" })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  const miniRoomId = accepted.body.miniRoom.miniRoomId as string
  const ready = (event: EventOf<"mini_room.ready">) => event.payload.miniRoom.miniRoomId === miniRoomId
  const [readyForAda, readyForBora] = await Promise.all([
    sa.waitFor("mini_room.ready", ready, { since: markA }),
    sb.waitFor("mini_room.ready", ready, { since: markB })
  ])
  assertWithinBudget(context, "accept -> inviter's room ready", readyForAda.at - accepted.startedAt)
  context.report(`invite -> invitee ${(inviteSeenByBora.at - invite.startedAt).toFixed(1)} ms; ` +
    `accept -> inviter ready ${(readyForAda.at - accepted.startedAt).toFixed(1)} ms`)
  for (const entry of [readyForAda, readyForBora]) {
    assert.equal(entry.event.payload.miniRoom.sourceThreadId, threadId)
    assert.deepEqual([...entry.event.payload.miniRoom.participantUserIds].sort(), [ada.userId, bora.userId].sort())
  }
  for (const socket of [sa, sb]) {
    await socket.waitFor("chat.room_invite_updated", (event) => event.payload.inviteId === inviteId && event.payload.status === "accepted")
  }
  for (const user of [ada, bora]) {
    const joined = await user.http("POST", `/v1/room-sessions/${miniRoomId}/join`, {})
    assert.equal(joined.status, 200, JSON.stringify(joined.body))
    assert.equal(joined.body.miniRoom.miniRoomId, miniRoomId)
  }
  await enterRoomTogether(sa, sb, miniRoomId)

  // Ada walks ten steps quickly: Bora ends on her final target, never out of order.
  markB = sb.mark()
  const sentAt = Array.from({ length: 10 }, (_, index) =>
    sa.send("mini_room.move", { miniRoomId, sequence: index + 1, x: walkX(index), y: WALK_Y }))
  const finalX = walkX(9)
  const arrived = await sb.waitFor("mini_room.avatar_moved",
    (event) => event.payload.avatar.userId === ada.userId && event.payload.avatar.x === finalX, { since: markB })
  assertWithinBudget(context, "final walk target -> partner", arrived.at - sentAt[9]!)
  await sb.barrier()
  const seenSteps = movesOf(sb, ada.userId, markB).map((entry) => entry.event.payload.avatar)
  assert.equal(seenSteps.at(-1)?.x, finalX, "the partner ends on the final target")
  for (let index = 1; index < seenSteps.length; index += 1) {
    assert.ok(seenSteps[index]!.x > seenSteps[index - 1]!.x, "targets never go backwards")
    assert.ok(seenSteps[index]!.revision > seenSteps[index - 1]!.revision, "revisions only increase")
  }
  assert.equal(movesOf(sa, ada.userId, markA).filter((entry) => entry.event.payload.miniRoomId !== miniRoomId).length, 0)
  context.report(`10 quick steps: partner saw ${seenSteps.length} in order, final after ` +
    `${(arrived.at - sentAt[9]!).toFixed(1)} ms`)

  markA = sa.mark()
  const boraStepAt = sb.send("mini_room.move", { miniRoomId, sequence: 1, x: 0.6, y: 0.75 })
  const boraStep = await sa.waitFor("mini_room.avatar_moved",
    (event) => event.payload.avatar.userId === bora.userId && event.payload.avatar.x === 0.6, { since: markA })
  assertWithinBudget(context, "Bora's step -> Ada", boraStep.at - boraStepAt)

  // Durable room chat over the sockets, interleaved: each message once, in order.
  ;[markA, markB] = [sa.mark(), sb.mark()]
  for (let index = 0; index < 3; index += 1) {
    sa.send("chat.send_message", { threadId, body: `ada in room ${index}`, clientMessageId: `e2e-room-ada-${index}000` })
    sb.send("chat.send_message", { threadId, body: `bora in room ${index}`, clientMessageId: `e2e-room-bora-${index}00` })
  }
  const from = (userId: string) => (event: EventOf<"chat.message_received">) =>
    event.payload.threadId === threadId && event.payload.senderUserId === userId && !event.payload.clientMessageId
  await Promise.all([
    sb.waitForCount("chat.message_received", 3, from(ada.userId), { since: markB }),
    sa.waitForCount("chat.message_received", 3, from(bora.userId), { since: markA }),
    sa.waitForCount("chat.message_received", 3, (event) => event.payload.clientMessageId?.startsWith("e2e-room-ada") ?? false, { since: markA }),
    sb.waitForCount("chat.message_received", 3, (event) => event.payload.clientMessageId?.startsWith("e2e-room-bora") ?? false, { since: markB })
  ])
  await Promise.all([sa.barrier(), sb.barrier()])
  // A socket handles up to eight frames at once, so three sends fired without
  // pause race each other to commit. The partner must get each once, and the
  // app's (sentAt, messageId) order of what arrived equals the stored history.
  const stored = await bora.http("GET", `/v1/threads/${threadId}/messages?limit=10`)
  const storedIds = (stored.body.messages as Array<{ messageId: string; body: string }>)
    .filter((message) => message.body.includes("in room")).map((message) => message.messageId)
  assert.equal(storedIds.length, 6, "room chat is durable chat history")
  const appOrder = (left: { sentAt: string; messageId: string }, right: { sentAt: string; messageId: string }) =>
    Date.parse(left.sentAt) - Date.parse(right.sentAt) || left.messageId.localeCompare(right.messageId)
  for (const [socket, since, sender, prefix] of [[sb, markB, ada, "ada in room"], [sa, markA, bora, "bora in room"]] as const) {
    const live = socket.received("chat.message_received", since).filter((entry) => from(sender.userId)(entry.event))
      .map((entry) => entry.event.payload)
    assert.deepEqual(live.map((message) => message.body).sort(), [0, 1, 2].map((index) => `${prefix} ${index}`),
      "each room message arrives once")
    const liveIds = new Set(live.map((message) => message.messageId))
    assert.deepEqual([...live].sort(appOrder).map((message) => message.messageId), storedIds.filter((id) => liveIds.has(id)),
      "the app's order of the live messages equals the stored history")
  }
  assert.equal(sb.received("chat.message_received", markB)
    .filter((entry) => entry.event.payload.clientMessageId?.startsWith("e2e-room-ada")).length, 0,
  "the sender's retry id never reaches the partner")
  assert.deepEqual(sa.received("realtime.error", markA), [])
  assert.deepEqual(sb.received("realtime.error", markB), [])

  // Presence: leaving the scene, re-entering, and a dropped socket.
  markB = sb.mark()
  sa.send("mini_room.scene_exit", { miniRoomId })
  const left = await sb.waitFor("mini_room.motion_snapshot", (event) => !presenceOf(event, ada.userId).present, { since: markB })
  assert.equal(presenceOf(left.event, bora.userId).present, true)
  markB = sb.mark()
  sa.send("mini_room.scene_enter", { miniRoomId })
  await sb.waitFor("mini_room.motion_snapshot", (event) => presenceOf(event, ada.userId).present, { since: markB })
  markB = sb.mark()
  const droppedAt = performance.now()
  await sa.close()
  const absent = await sb.waitFor("mini_room.motion_snapshot", (event) => !presenceOf(event, ada.userId).present, { since: markB })
  assertWithinBudget(context, "socket close -> partner sees absent", absent.at - droppedAt)

  // Reconnect: the scene snapshot restores both people where they stood.
  const reconnected = await ada.connect()
  markB = sb.mark()
  reconnected.send("mini_room.scene_enter", { miniRoomId })
  const resync = await reconnected.waitFor("mini_room.motion_snapshot", (event) =>
    event.payload.miniRoomId === miniRoomId && event.payload.avatars.every((avatar) => avatar.present))
  assert.equal(presenceOf(resync.event, ada.userId).x, finalX, "Ada resumes at her last accepted target")
  assert.equal(presenceOf(resync.event, bora.userId).x, 0.6, "and sees Bora where Bora stood")
  await sb.waitFor("mini_room.motion_snapshot", (event) => presenceOf(event, ada.userId).present, { since: markB })
  await Promise.all([reconnected.close(), sb.close()])
}

// Scenario 4: races and interruptions ------------------------------------------

export async function simultaneousLikesMakeOneMatch(context: ScenarioContext): Promise<void> {
  const { harness } = context
  const ada = await harness.signUp("Ada")
  const bora = await harness.signUp("Bora", { gender: "man" })
  const [sa, sb] = await Promise.all([ada.connect(), bora.connect()])
  const likes = await Promise.all([
    ada.http("POST", `/v1/discover/${bora.userId}/like`, {}),
    bora.http("POST", `/v1/discover/${ada.userId}/like`, {})
  ])
  assert.deepEqual(likes.map((like) => like.status), [200, 200])
  const matchIds = new Set(likes.filter((like) => like.body.matched).map((like) => like.body.match.matchId as string))
  assert.equal(matchIds.size, 1, "at least one side sees the match, and both name the same one")
  const [matchId] = [...matchIds]
  const threadId = `thread_match_${matchId}`
  assert.deepEqual((await harness.services.matchService.repository.listMatchesForUser(ada.userId)).map((match) => match.matchId), [matchId])
  await Promise.all([
    sa.waitFor("chat.thread_created", (event) => event.payload.threadId === threadId),
    sb.waitFor("chat.thread_created", (event) => event.payload.threadId === threadId)
  ])
  await Promise.all([sa.barrier(), sb.barrier()])
  for (const socket of [sa, sb]) {
    const announced = socket.received("chat.thread_created")
    assert.ok(announced.every((entry) => entry.event.payload.threadId === threadId), "only the one pair thread is announced")
    context.report(`${socket.owner.name} received chat.thread_created x${announced.length} for the simultaneous match`)
  }
  assert.deepEqual(await threadIdsOf(ada), [threadId])
  assert.deepEqual(await threadIdsOf(bora), [threadId])
  await Promise.all([sa.close(), sb.close()])
}

export async function simultaneousInvitesMakeOneRoom(context: ScenarioContext): Promise<void> {
  const { ada, bora, sa, sb, threadId } = await connectedMatchedPair(context)
  const invites = await Promise.all([
    ada.http("POST", `/v1/threads/${threadId}/room-invites`, {}),
    bora.http("POST", `/v1/threads/${threadId}/room-invites`, {})
  ])
  assert.deepEqual(invites.map((invite) => invite.status).sort(), [200, 201], "one invite is created, the other side gets it back")
  const inviteIds = new Set(invites.map((invite) => invite.body.invite.inviteId as string))
  assert.equal(inviteIds.size, 1)
  const invite = invites.find((response) => response.status === 201)!.body.invite as { inviteId: string; recipientUserId: string }
  const listed = await ada.http("GET", `/v1/threads/${threadId}/room-invites`)
  assert.deepEqual((listed.body.invites as Array<{ status: string }>).map((entry) => entry.status), ["pending"])
  const recipient = invite.recipientUserId === ada.userId ? ada : bora
  const accepted = await recipient.http("POST", `/v1/room-invites/${invite.inviteId}/decision`, { status: "accepted" })
  assert.equal(accepted.status, 200)
  const miniRoomId = accepted.body.miniRoom.miniRoomId as string
  for (const socket of [sa, sb]) {
    await socket.waitFor("mini_room.ready", (event) => event.payload.miniRoom.miniRoomId === miniRoomId)
    assert.equal(socket.received("chat.room_invite_updated").filter((entry) => entry.event.payload.status === "pending").length, 1,
      "each phone is told about one pending invite")
  }
  await Promise.all([sa.close(), sb.close()])
}

export async function doubleAcceptOpensOneRoom(context: ScenarioContext): Promise<void> {
  const { harness } = context
  const { ada, bora, sa, sb, threadId } = await connectedMatchedPair(context)
  const invite = await ada.http("POST", `/v1/threads/${threadId}/room-invites`, {})
  const inviteId = invite.body.invite.inviteId as string
  const decide = () => bora.http("POST", `/v1/room-invites/${inviteId}/decision`, { status: "accepted" })
  const concurrent = await Promise.all([decide(), decide()])
  const again = await decide()
  const decisions = [...concurrent, again]
  assert.ok(decisions.every((decision) => decision.status === 200 || decision.status === 409),
    decisions.map((decision) => decision.status).join(","))
  const roomIds = new Set(decisions.filter((decision) => decision.status === 200)
    .map((decision) => decision.body.miniRoom.miniRoomId as string))
  assert.equal(roomIds.size, 1, "every successful accept names the same room")
  const [miniRoomId] = [...roomIds]
  for (const user of [ada, bora]) {
    assert.equal((await harness.services.miniRoomService.findActiveMiniRoomForUser(user.userId))?.miniRoomId, miniRoomId)
  }
  const declineAfter = await bora.http("POST", `/v1/room-invites/${inviteId}/decision`, { status: "declined" })
  assert.equal(declineAfter.status, 200, "a late decline replays the accepted outcome")
  assert.equal(declineAfter.body.miniRoom?.miniRoomId, miniRoomId)
  await Promise.all([sa.barrier(), sb.barrier()])
  for (const socket of [sa, sb]) {
    const readies = socket.received("mini_room.ready")
    assert.ok(readies.length >= 1)
    assert.ok(readies.every((entry) => entry.event.payload.miniRoom.miniRoomId === miniRoomId), "no second room is announced")
    context.report(`${socket.owner.name} received mini_room.ready x${readies.length} for ${decisions.length + 1} accept calls`)
  }
  await Promise.all([sa.close(), sb.close()])
}

export async function expiredInviteOpensNothing(context: ScenarioContext): Promise<void> {
  const { harness } = context
  const { ada, bora, sa, sb, threadId } = await connectedMatchedPair(context)
  const invite = await ada.http("POST", `/v1/threads/${threadId}/room-invites`, {})
  assert.equal(invite.status, 201)
  const inviteId = invite.body.invite.inviteId as string
  await harness.expireInvite(inviteId)
  const [markA, markB] = [sa.mark(), sb.mark()]
  const accepted = await bora.http("POST", `/v1/room-invites/${inviteId}/decision`, { status: "accepted" })
  assert.equal(accepted.status, 410)
  assert.equal(accepted.body.code, "INVITE_EXPIRED")
  await Promise.all([sa.barrier(), sb.barrier()])
  assert.deepEqual([...sa.received("mini_room.ready", markA), ...sb.received("mini_room.ready", markB)], [])
  assert.equal(await harness.services.miniRoomService.findActiveMiniRoomForUser(bora.userId), null)
  const listed = await bora.http("GET", `/v1/threads/${threadId}/room-invites`)
  assert.deepEqual((listed.body.invites as Array<{ status: string }>).map((entry) => entry.status), ["expired"])
  const reinvite = await bora.http("POST", `/v1/threads/${threadId}/room-invites`, {})
  assert.equal(reinvite.status, 201, "an expired invite does not block a fresh one")
  await Promise.all([sa.close(), sb.close()])
}

export async function blockMidRoomStopsEverything(context: ScenarioContext): Promise<void> {
  const { harness } = context
  const { ada, bora, sa, sb, threadId } = await connectedMatchedPair(context)
  const { miniRoomId } = await harness.openRoom(ada, bora, threadId)
  await enterRoomTogether(sa, sb, miniRoomId)
  sa.send("mini_room.move", { miniRoomId, sequence: 1, x: walkX(1), y: WALK_Y })
  await sb.waitFor("mini_room.avatar_moved", (event) => event.payload.avatar.userId === ada.userId)

  let [markA, markB] = [sa.mark(), sb.mark()]
  const blocked = await ada.http("POST", "/v1/safety/blocks", { blockedUserId: bora.userId })
  assert.equal(blocked.status, 201)
  const ended = (event: EventOf<"mini_room.ended">) => event.payload.miniRoomId === miniRoomId
  const [endedForAda, endedForBora] = await Promise.all([
    sa.waitFor("mini_room.ended", ended, { since: markA }),
    sb.waitFor("mini_room.ended", ended, { since: markB })
  ])
  assertWithinBudget(context, "block -> room ended for the blocked person", endedForBora.at - blocked.startedAt)
  assert.equal(endedForAda.event.payload.endedByUserId, ada.userId)
  await sa.waitFor("safety.user_blocked", (event) => event.payload.blockedUserId === bora.userId, { since: markA })
  await sb.barrier()
  assert.deepEqual(sb.received("safety.user_blocked", markB), [], "the blocked person is never told")

  // Everything after the block: steps, room chat, HTTP chat, invites, rejoin, reactions.
  ;[markA, markB] = [sa.mark(), sb.mark()]
  sa.send("mini_room.move", { miniRoomId, sequence: 2, x: walkX(2), y: WALK_Y })
  sb.send("mini_room.move", { miniRoomId, sequence: 5, x: walkX(3), y: WALK_Y })
  sb.send("mini_room.scene_enter", { miniRoomId })
  sb.send("chat.send_message", { threadId, body: "are you there", clientMessageId: "e2e-after-block-01" })
  sb.send("reaction.send", { roomId: miniRoomId, reaction: "wave" })
  const attempts = await Promise.all([
    bora.http("POST", `/v1/threads/${threadId}/messages`, { body: "hello?" }),
    ada.http("POST", `/v1/threads/${threadId}/messages`, { body: "bye" }),
    bora.http("POST", `/v1/threads/${threadId}/room-invites`, {}),
    bora.http("POST", `/v1/room-sessions/${miniRoomId}/join`, {}),
    ada.http("POST", `/v1/room-sessions/${miniRoomId}/join`, {})
  ])
  assert.deepEqual(attempts.map((attempt) => attempt.status), [404, 404, 404, 404, 404])
  const refused = await sb.waitFor("realtime.error", (event) => event.payload.clientMessageId === "e2e-after-block-01", { since: markB })
  assert.equal(refused.event.payload.message, "That conversation is not available.", "the refusal does not reveal the block")
  await delay(50)
  await Promise.all([sa.barrier(), sb.barrier()])
  const allowedForBora = new Set(["realtime.error", "chat.thread_listed"])
  assert.deepEqual(sa.events.slice(markA).map((entry) => entry.event.type).filter((type) => type !== "chat.thread_listed"), [],
    "the blocker receives nothing more")
  assert.deepEqual(sb.events.slice(markB).map((entry) => entry.event.type).filter((type) => !allowedForBora.has(type)), [],
    "the blocked person receives only the refusal of their own send")
  assert.deepEqual(eventsNaming(sb, ada.userId, markB), [])
  assert.deepEqual(eventsNaming(sa, bora.userId, markA), [])
  assert.deepEqual(await threadIdsOf(ada), [])
  assert.deepEqual(await threadIdsOf(bora), [])
  await Promise.all([sa.close(), sb.close()])
}

export async function logoutAndAccountSwitchSilenceTheOldSocket(context: ScenarioContext): Promise<void> {
  const { harness } = context
  const { ada, bora, sa, sb, threadId } = await connectedMatchedPair(context)
  const loggedOut = await ada.http("DELETE", "/v1/auth/session")
  assert.equal(loggedOut.status, 204)
  const closeCode = await sa.closed
  assert.equal(closeCode, 4403, "sign-out closes the signed-out socket at once")
  const eventsAtLogout = sa.events.length

  // The same phone signs in to another account.
  const carol = await harness.signUp("Carol", { clientAddress: ada.clientAddress })
  const sc = await carol.connect()
  const whileAway = await sendOverHttp(bora, threadId, "while you were away", "e2e-away-00000001")
  const invite = await bora.http("POST", `/v1/threads/${threadId}/room-invites`, {})
  assert.equal(invite.status, 201)
  await sb.waitFor("chat.message_received", (event) => event.payload.messageId === whileAway.messageId)
  await delay(50)
  await sc.barrier()
  assert.equal(sa.events.length, eventsAtLogout, "the signed-out socket received nothing more")
  assert.deepEqual(sc.events.filter((entry) => entry.event.type !== "chat.thread_listed"), [],
    "the next account on the phone receives nothing of the previous one")
  assert.deepEqual(eventsNaming(sc, ada.userId, 0), [])
  assert.equal((await ada.http("GET", "/v1/users/me")).status, 401)
  assert.equal((await ada.http("POST", "/v1/auth/realtime-ticket")).status, 401)

  // Signing back in restores the durable history and live delivery.
  await sc.close()
  const signedIn = await harness.request("POST", "/v1/auth/firebase/complete", {
    clientAddress: ada.clientAddress,
    body: { idToken: `e2e-phone:${ada.phoneNumber}`, authIntent: "sign-in" }
  })
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body))
  assert.equal(signedIn.body.session.userId, ada.userId)
  ada.sessionToken = signedIn.body.session.sessionToken as string
  const sa2 = await ada.connect()
  const history = await ada.http("GET", `/v1/threads/${threadId}/messages`)
  assert.ok((history.body.messages as Array<{ messageId: string }>).some((message) => message.messageId === whileAway.messageId))
  const next = await sendOverHttp(bora, threadId, "welcome back", "e2e-back-00000001")
  await sa2.waitFor("chat.message_received", (event) => event.payload.messageId === next.messageId)
  await Promise.all([sa2.close(), sb.close()])
}

// Scenario 5: notifications ---------------------------------------------------

async function waitForPushes(
  harness: SocialLoopHarness,
  userId: string,
  done: (types: string[]) => boolean
) {
  const deadline = performance.now() + 2_000
  for (;;) {
    const pushes = await harness.pendingPushes(userId)
    if (done(pushes.map((push) => push.notification.data?.type ?? ""))) return pushes
    if (performance.now() > deadline) assert.fail(`queued pushes: ${pushes.map((push) => push.notification.data?.type).join(", ")}`)
    await delay(10)
  }
}

export async function backgroundedPhoneGetsPrivatePushes(context: ScenarioContext): Promise<void> {
  const { harness } = context
  const ada = await harness.signUp("Ada")
  const bora = await harness.signUp("Bora", { gender: "man" })
  const pushToken = `ExponentPushToken[e2e-${bora.userId.slice(-8)}]`
  assert.equal((await bora.http("POST", "/v1/devices", { platform: "ios", pushToken })).status, 201)
  // The default cap is 6 per hour; raised so every type of this flow is visible.
  assert.equal((await bora.http("PUT", "/v1/notification-preferences", { maxPushesPerHour: 20 })).status, 200)
  const sa = await ada.connect()
  // Bora's phone was open, then went to the background: its socket is closed.
  await (await bora.connect()).close()

  const { threadId, matchId } = await harness.matchPair(ada, bora)
  const secret = "Meet me at the ferry, code 4821"
  const message = await sendOverHttp(ada, threadId, secret, "e2e-push-message-01")
  const invite = await ada.http("POST", `/v1/threads/${threadId}/room-invites`, {})
  assert.equal(invite.status, 201)
  const expected = ["chat.message", "chat.room_invite", "discovery.like", "discovery.match"]
  const pushes = await waitForPushes(harness, bora.userId, (types) => expected.every((type) => types.includes(type)))
  assert.deepEqual(pushes.map((push) => push.notification.data?.type).sort(), expected, "one push per event, none doubled")
  assert.ok(pushes.every((push) => push.pushToken === pushToken))
  const byType = new Map(pushes.map((push) => [push.notification.data?.type, push]))
  assert.deepEqual(byType.get("chat.message")?.notification.data, { type: "chat.message", threadId, messageId: message.messageId })
  assert.equal(byType.get("chat.room_invite")?.notification.data?.inviteId, invite.body.invite.inviteId)
  assert.equal(byType.get("discovery.match")?.notification.data?.matchId, matchId)

  const forbidden = [secret, "4821", "ferry", "Ada", ada.phoneNumber, ada.phoneNumber.slice(1)]
  for (const push of pushes) {
    const outgoing = toOutgoingPushNotification({ userId: push.userId, notification: push.notification })
    for (const [label, payload] of [["queued", push.notification], ["device", outgoing]] as const) {
      const serialized = JSON.stringify(payload)
      for (const text of forbidden) {
        assert.ok(!serialized.includes(text), `${label} ${push.notification.data?.type} push carries ${JSON.stringify(text)}`)
      }
    }
    assert.ok(!JSON.stringify(outgoing).includes(ada.userId), `the device payload of ${push.notification.data?.type} never names the partner`)
    assert.equal(outgoing.data?.recipientUserId, bora.userId)
  }
  assert.deepEqual(await harness.pendingPushes(ada.userId), [], "no device registered, nothing queued")
  await sa.barrier()

  // Bora opens the app: the socket gets the message once, and the server still
  // queues exactly one push for it (the phone hides it while focused).
  const sb = await bora.connect()
  const focused = await sendOverHttp(ada, threadId, "now you are here", "e2e-push-message-02")
  await sb.waitFor("chat.message_received", (event) => event.payload.messageId === focused.messageId)
  const isFocusedPush = (push: { notification: { data?: Record<string, string> } }) =>
    push.notification.data?.messageId === focused.messageId
  const deadline = performance.now() + 2_000
  while (!(await harness.pendingPushes(bora.userId)).some(isFocusedPush)) {
    assert.ok(performance.now() < deadline, "the focused message is queued as a push too")
    await delay(10)
  }
  await delay(50)
  await sb.barrier()
  assert.equal((await harness.pendingPushes(bora.userId)).filter(isFocusedPush).length, 1,
    "one push per message even while a socket is open")
  assert.equal(sb.received("chat.message_received").filter((entry) => entry.event.payload.messageId === focused.messageId).length, 1)
  await Promise.all([sa.close(), sb.close()])
}
