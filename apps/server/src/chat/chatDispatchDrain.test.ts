import assert from "node:assert/strict"
import test from "node:test"
import type { NotificationService } from "../notifications/notificationService"
import type { ConnectionManager } from "../realtime/connectionManager"
import { createSafetyService } from "../safety/safetyService"
import { createChatMessageDeliveryService, drainChatDispatches } from "./chatMessageDeliveryService"
import { createChatService } from "./chatService"

async function fixture() {
  const chatService = createChatService()
  await chatService.createThread({
    threadId: "thread_private", miniRoomId: "room_private",
    participantUserIds: ["user_sender", "user_recipient"],
    participants: [{ userId: "user_sender", displayName: "Ada" }, { userId: "user_recipient", displayName: "Bora" }]
  })
  let release!: () => void
  const pushGate = new Promise<void>((resolve) => { release = resolve })
  const pushed: string[] = []
  const delivery = createChatMessageDeliveryService({
    chatService, safetyService: createSafetyService(),
    connectionManager: { async sendToUsersDurably() {}, hasUserConnections: () => false } as unknown as ConnectionManager,
    notificationService: {
      async sendPushToUser(_userId: string, push: { data: { messageId: string } }) {
        await pushGate
        pushed.push(push.data.messageId)
      }
    } as unknown as NotificationService,
    reportError: () => {}
  })
  return { chatService, delivery, pushed, release }
}

test("shutdown waits for an in-flight post-persist dispatch before the pool closes", async () => {
  const { chatService, delivery, pushed, release } = await fixture()
  const { message } = await delivery.sendMessage({ senderUserId: "user_sender", threadId: "thread_private", body: "hi" })
  let drained = false
  const drain = drainChatDispatches(chatService, 5_000).then(() => { drained = true })
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  assert.equal(drained, false, "the push is still being enqueued")
  release()
  await drain
  assert.deepEqual(pushed, [message.messageId])
  // The outbox job completed, so a later instance has nothing to re-send.
  assert.deepEqual(await chatService.repository.claimDeliveries({ now: new Date(Date.now() + 3_600_000), limit: 10, leaseMs: 30_000 }), [])
})

test("the drain gives up at its deadline and returns without throwing", async () => {
  const { chatService, delivery, pushed, release } = await fixture()
  await delivery.sendMessage({ senderUserId: "user_sender", threadId: "thread_private", body: "hi" })
  const startedAt = Date.now()
  await drainChatDispatches(chatService, 50)
  assert.ok(Date.now() - startedAt < 1_000)
  assert.deepEqual(pushed, [])
  release()
  await drainChatDispatches(chatService, 5_000)
  assert.equal(pushed.length, 1)
})

test("a chat service with nothing in flight drains at once", async () => {
  await drainChatDispatches(createChatService(), 5_000)
})
