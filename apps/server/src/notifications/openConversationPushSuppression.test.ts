import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryChatRepository } from "../chat/chatRepository"
import {
  CHAT_MESSAGE_PUSH_HOLD_MS,
  createNotificationDeliveryHooks,
  createNotificationRelevanceCheck
} from "./notificationDeliveryContext"
import { createNotificationService } from "./notificationService"

// Owner rule (2026-10-02): while a conversation is open, its messages raise
// no notification of any kind. The phone hides banners for the conversation
// on screen; the server additionally holds a chat message push briefly and
// drops it when the recipient has read the message by then (the open chat
// marks it read about half a second after it arrives over the socket).

const T0 = new Date("2026-10-02T10:00:00.000Z")
const at = (ms: number) => new Date(T0.getTime() + ms)
const message = (messageId: string) => ({
  title: "Blumi",
  body: "You have a new message.",
  data: { type: "chat.message", threadId: "thread_1", messageId }
})

function createService(input: { unreadFromPartner: () => boolean; holdMs?: number }) {
  const sent: string[] = []
  let clock = T0
  const service = createNotificationService({
    now: () => clock,
    pushProvider: { async sendPush(_token, notification) { sent.push(notification.data?.messageId ?? notification.data?.type ?? "") } },
    chatMessagePushHoldMs: input.holdMs ?? CHAT_MESSAGE_PUSH_HOLD_MS,
    isDeliveryCurrent: createNotificationRelevanceCheck({
      isUserAllowed: async () => true,
      hasBlockBetween: async () => false,
      findThread: async () => ({ participantUserIds: ["recipient", "partner"] }),
      findRoomInvite: async () => null,
      hasUnreadMessagesFrom: async (_userId, senders) => senders.includes("partner") && input.unreadFromPartner()
    })
  })
  return { service, sent, setClock: (next: Date) => { clock = next } }
}

test("a chat message push waits for the hold, so an open conversation can read it first", async () => {
  const { service, sent, setClock } = createService({ unreadFromPartner: () => true })
  await service.registerDevice("recipient", { platform: "ios", pushToken: "token_r" }, T0)
  await service.sendPushToUser("recipient", message("m1"))
  await service.dispatchDue(at(0))
  assert.deepEqual(sent, [], "nothing is sent before the hold ends")
  setClock(at(CHAT_MESSAGE_PUSH_HOLD_MS))
  await service.dispatchDue(at(CHAT_MESSAGE_PUSH_HOLD_MS))
  assert.deepEqual(sent, ["m1"], "an unread message is pushed once the hold ends")
})

test("a message read during the hold (its chat was open) is never pushed", async () => {
  let unread = true
  const { service, sent } = createService({ unreadFromPartner: () => unread })
  await service.registerDevice("recipient", { platform: "ios", pushToken: "token_r" }, T0)
  await service.sendPushToUser("recipient", message("m_open"))
  unread = false
  await service.dispatchDue(at(CHAT_MESSAGE_PUSH_HOLD_MS + 1))
  assert.deepEqual(sent, [])
  assert.deepEqual(await service.repository.listPendingDeliveries(), [], "the dropped push leaves the outbox")
})

test("only chat message pushes are held; matches and likes go out at once", async () => {
  const { service, sent } = createService({ unreadFromPartner: () => true })
  await service.registerDevice("recipient", { platform: "ios", pushToken: "token_r" }, T0)
  await service.sendPushToUser("recipient", { title: "Blumi", body: "x", data: { type: "discovery.match", matchId: "match_1", partnerUserId: "partner" } })
  await service.dispatchDue(at(0))
  assert.deepEqual(sent, ["discovery.match"])
})

test("the hold is bounded", () => {
  assert.throws(() => createNotificationService({ chatMessagePushHoldMs: 60_000 }), /between 0 and 10 seconds/)
  assert.throws(() => createNotificationService({ chatMessagePushHoldMs: -1 }), /between 0 and 10 seconds/)
  assert.ok(CHAT_MESSAGE_PUSH_HOLD_MS > 500 && CHAT_MESSAGE_PUSH_HOLD_MS <= 3_000,
    "longer than the chat's 500 ms read debounce, short enough to stay prompt")
})

test("production wiring reads the recipient's unread messages from the conversation partner", async () => {
  const repository = createInMemoryChatRepository()
  await repository.saveThread({
    threadId: "thread_1", miniRoomId: "room_1", participantUserIds: ["recipient", "partner"],
    participants: [{ userId: "recipient" }, { userId: "partner" }], createdAt: T0.toISOString()
  })
  const sent = { messageId: "m1", threadId: "thread_1", senderUserId: "partner", body: "hi", sentAt: at(10).toISOString() }
  await repository.createMessage(sent)
  const hooks = createNotificationDeliveryHooks(() => ({
    authService: {
      repository: { findAccountByUserId: async () => null },
      isRealtimeUserAllowed: async () => true
    },
    chatService: { repository, countUnreadMessages: async () => 0 },
    safetyService: { hasBlockBetween: async () => false },
    miniRoomService: { repository: { findInvite: async () => null } }
  }))
  assert.equal(hooks.chatMessagePushHoldMs, CHAT_MESSAGE_PUSH_HOLD_MS)
  const push = { userId: "recipient", notification: message("m1") }
  assert.equal(await hooks.isDeliveryCurrent(push, at(2_000)), true, "unread: the banner is still news")
  await repository.advanceReadCursor({ threadId: "thread_1", userId: "recipient", upToMessageId: "m1" })
  assert.equal(await hooks.isDeliveryCurrent(push, at(2_000)), false, "read in the open chat: no banner")
  assert.equal(await hooks.isDeliveryCurrent({ userId: "recipient", notification: {
    title: "Blumi", body: "x", data: { type: "chat.room_invite", threadId: "thread_1" }
  } }, at(2_000)), true, "room invites are not dropped by the read rule")
})
