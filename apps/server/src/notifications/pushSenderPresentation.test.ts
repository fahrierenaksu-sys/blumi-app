import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createNotificationService, type CreateNotificationServiceOptions } from "./notificationService"
import { createInMemoryNotificationRepository } from "./notificationRepository"
import { createPushSenderResolver } from "./notificationDeliveryContext"
import type { PushNotification } from "./pushProvider"

const messageText = "Meet me at the ferry, code 4821"

function setup(options: { resolvePushSender?: CreateNotificationServiceOptions["resolvePushSender"] } = {}) {
  const sent: PushNotification[] = []
  const queued: PushNotification[] = []
  const repository = createInMemoryNotificationRepository()
  const recordingRepository = {
    ...repository,
    async claimPolicyAndEnqueueDeliveries(input: Parameters<typeof repository.claimPolicyAndEnqueueDeliveries>[0]) {
      queued.push(...input.deliveries.map((delivery) => delivery.notification))
      return repository.claimPolicyAndEnqueueDeliveries(input)
    }
  }
  const service = createNotificationService({
    repository: recordingRepository,
    pushProvider: { async sendPush(_token, notification) { sent.push(notification) } },
    resolveRecipientLocale: async () => "tr",
    ...(options.resolvePushSender ? { resolvePushSender: options.resolvePushSender } : {})
  })
  return { service, sent, queued }
}

test("the sender's name, picture and message text are read at send time and never stored in the outbox", async () => {
  const resolverCalls: string[] = []
  const { service, sent, queued } = setup({
    resolvePushSender: createPushSenderResolver({
      findMessage: async (threadId, messageId) => {
        resolverCalls.push(`${threadId}/${messageId}`)
        return { senderUserId: "user_ada", body: messageText }
      },
      findRoomInvite: async () => null,
      findAccount: async (userId) => userId === "user_ada"
        ? { profile: { displayName: "Ada", avatar: {} } }
        : null
    })
  })
  await service.registerDevice("user_bora", { platform: "ios", pushToken: "token_bora" })
  await service.sendPushToUser("user_bora", {
    title: "x", body: "y", data: { type: "chat.message", threadId: "thread_1", messageId: "message_1" }
  })

  assert.equal(queued.length, 1)
  assert.ok(!JSON.stringify(queued).includes(messageText), "the outbox keeps no message text")
  assert.ok(!JSON.stringify(queued).includes("Ada"), "the outbox keeps no sender name")
  assert.equal(resolverCalls.length, 0, "nothing is read before the send")

  await service.dispatchDue()
  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.title, "Ada")
  assert.equal(sent[0]?.body, messageText)
  assert.equal(sent[0]?.delivery?.categoryId, "CHAT_MESSAGE")
  assert.equal(sent[0]?.data?.senderImage, undefined, "no avatar loadout, no picture")
  assert.ok(!JSON.stringify(sent[0]?.data).includes("user_ada"), "the device payload never names the sender")
})

test("a failing or empty sender lookup still sends the neutral push", async () => {
  for (const resolvePushSender of [
    async () => { throw new Error("database unavailable") },
    async () => undefined
  ]) {
    const { service, sent } = setup({ resolvePushSender })
    await service.registerDevice("user_bora", { platform: "ios", pushToken: "token_bora" })
    await service.sendPushToUser("user_bora", {
      title: "x", body: "y", data: { type: "chat.room_invite", threadId: "thread_1", inviteId: "invite_1" }
    })
    await service.dispatchDue()
    assert.equal(sent.length, 1)
    assert.deepEqual([sent[0]?.title, sent[0]?.body], ["Blumi", "Yeni bir oda davetin var."])
    assert.equal(sent[0]?.delivery?.categoryId, "ROOM_INVITE", "the invite actions still apply")
  }
})

test("the sender resolver names only the other person of the event", async () => {
  const urls: string[] = []
  const resolve = createPushSenderResolver({
    findMessage: async (_threadId, messageId) => messageId === "own"
      ? { senderUserId: "user_bora", body: "mine" }
      : messageId === "partner" ? { senderUserId: "user_ada", body: "hi" } : null,
    findRoomInvite: async (inviteId) => inviteId === "for_bora"
      ? { senderUserId: "user_ada", recipientUserId: "user_bora" }
      : { senderUserId: "user_ada", recipientUserId: "user_cem" },
    findAccount: async () => ({
      profile: { displayName: "Ada", avatar: { loadout: { schemaVersion: 1, bodyId: "x" } } }
    }),
    portraits: { urlFor: (sender) => { urls.push(sender.userId); return "https://api.example.test/p" } }
  })
  const now = new Date()
  const push = (data: Record<string, string>) => ({ userId: "user_bora", notification: { title: "", body: "", data } })

  assert.equal(await resolve(push({ type: "chat.message", threadId: "t", messageId: "own" }), now), undefined)
  assert.equal(await resolve(push({ type: "chat.message", threadId: "t", messageId: "missing" }), now), undefined)
  assert.equal(await resolve(push({ type: "chat.room_invite", inviteId: "for_cem" }), now), undefined)
  assert.equal(await resolve(push({ type: "discovery.like" }), now), undefined)
  assert.deepEqual(await resolve(push({ type: "chat.message", threadId: "t", messageId: "partner" }), now),
    { displayName: "Ada", messageText: "hi" }, "an unreadable loadout gets no picture")
  assert.equal(urls.length, 0)

  const withAvatar = createPushSenderResolver({
    findMessage: async () => null,
    findRoomInvite: async () => ({ senderUserId: "user_ada", recipientUserId: "user_bora" }),
    findAccount: async () => ({ profile: { displayName: "Ada", avatar: { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT } } }),
    portraits: { urlFor: (sender) => { urls.push(sender.userId); return "https://api.example.test/p" } }
  })
  assert.deepEqual(await withAvatar(push({ type: "chat.room_invite", inviteId: "for_bora" }), now),
    { displayName: "Ada", imageUrl: "https://api.example.test/p" })
  assert.deepEqual(urls, ["user_ada"], "the picture is the sender's, seeded by the sender")
})
