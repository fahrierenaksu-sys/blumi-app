import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createSafetyService } from "../safety/safetyService"
import { createInMemoryChatRepository, createInMemoryChatStore, type ChatRepository } from "./chatRepository"
import { ChatReceiptsUnavailableError, createChatReceiptService } from "./chatReceiptService"
import { createChatService } from "./chatService"

const ADA = "user_ada"
const BORA = "user_bora"
const THREAD = "thread_receipts"

async function setup(options: {
  receiptsSupported?: boolean
  rolledOut?: (userId: string) => boolean
  repository?: (base: ChatRepository) => ChatRepository
} = {}) {
  let nextId = 0
  const base = createInMemoryChatRepository(createInMemoryChatStore(), {
    receiptsSupported: options.receiptsSupported ?? true
  })
  const safetyService = createSafetyService()
  const chatService = createChatService({
    repository: options.repository ? options.repository(base) : base,
    blockPolicy: safetyService,
    idFactory: () => `message_${String(++nextId).padStart(2, "0")}`
  })
  await chatService.createThread({
    threadId: THREAD,
    miniRoomId: "room_receipts",
    participantUserIds: [ADA, BORA],
    participants: [{ userId: ADA, displayName: "Ada" }, { userId: BORA, displayName: "Bora" }]
  })
  const events: Array<{ userId: string; event: ServerEvent }> = []
  const errors: unknown[] = []
  const receipts = createChatReceiptService({
    chatService,
    blockPolicy: safetyService,
    isRolledOutFor: options.rolledOut ?? (() => true),
    emit: (userId, event) => { events.push({ userId, event }) },
    reportError: (error) => { errors.push(error) }
  })
  const send = (userId: string, body: string, at: string) =>
    chatService.sendMessage(userId, THREAD, body, new Date(at))
  return { chatService, safetyService, receipts, events, errors, send }
}

test("a delivery ack moves the cursor and tells only the sender", async () => {
  const { receipts, events, send } = await setup()
  const first = await send(ADA, "one", "2026-10-01T10:00:00.000Z")
  const second = await send(ADA, "two", "2026-10-01T10:00:01.000Z")

  await receipts.acknowledgeDelivered(BORA, THREAD, second.messageId)
  await receipts.acknowledgeDelivered(BORA, THREAD, first.messageId)

  assert.deepEqual(events, [{
    userId: ADA,
    event: {
      type: "chat.receipt_updated",
      payload: {
        threadId: THREAD,
        userId: BORA,
        participantUserIds: [ADA, BORA],
        deliveredUpTo: { sentAt: second.sentAt, messageId: second.messageId }
      }
    }
  }], "the older ack is a no-op and nothing reaches the acker")
})

test("loading the newest history page counts as delivery of the newest partner message", async () => {
  const { chatService, receipts, events, send } = await setup()
  const partnerMessage = await send(ADA, "hi", "2026-10-01T10:00:00.000Z")
  await send(BORA, "hello back", "2026-10-01T10:00:02.000Z")

  await receipts.noteHistoryLoaded(BORA, THREAD, await chatService.listMessages(BORA, THREAD))

  assert.equal(events.length, 1)
  const event = events[0]!.event
  assert.equal(event.type === "chat.receipt_updated" ? event.payload.deliveredUpTo?.messageId : null, partnerMessage.messageId)
})

test("read receipts are off by default and mutual: both must turn them on", async () => {
  const { receipts, events, send } = await setup()
  const message = await send(ADA, "secret crush?", "2026-10-01T10:00:00.000Z")

  await receipts.markRead(BORA, THREAD, { upToMessageId: message.messageId })
  assert.equal(events.length, 0, "both off")

  await receipts.savePreferences(BORA, { readReceiptsEnabled: true })
  const second = await send(ADA, "again", "2026-10-01T10:00:01.000Z")
  await receipts.markRead(BORA, THREAD, { upToMessageId: second.messageId })
  assert.equal(events.length, 0, "only the reader turned them on")

  await receipts.savePreferences(ADA, { readReceiptsEnabled: true })
  const third = await send(ADA, "third", "2026-10-01T10:00:02.000Z")
  await receipts.markRead(BORA, THREAD, { upToMessageId: third.messageId })
  assert.deepEqual(events.map(({ userId, event }) => [userId, event.type,
    event.type === "chat.receipt_updated" ? event.payload.readUpTo : null]), [
    [ADA, "chat.receipt_updated", { sentAt: third.sentAt, messageId: third.messageId }]
  ])
})

test("projections show delivery to both, and read state only while both share it", async () => {
  const { chatService, receipts, send } = await setup()
  const message = await send(ADA, "hello", "2026-10-01T10:00:00.000Z")
  await receipts.acknowledgeDelivered(BORA, THREAD, message.messageId)
  await receipts.markRead(BORA, THREAD, { upToMessageId: message.messageId })
  const delivered = { sentAt: message.sentAt, messageId: message.messageId }

  const adaView = async () => (await receipts.projectThreads(ADA, await chatService.listThreads(ADA)))[0]!.partnerReceipts
  assert.deepEqual(await adaView(), { deliveredUpTo: delivered })
  assert.deepEqual(await receipts.getPartnerReceipts(ADA, THREAD), { deliveredUpTo: delivered })

  await receipts.savePreferences(ADA, { readReceiptsEnabled: true })
  await receipts.savePreferences(BORA, { readReceiptsEnabled: true })
  assert.deepEqual(await adaView(), { deliveredUpTo: delivered, readUpTo: delivered })

  // Turning it off hides it both ways, including for the person who turned it off.
  await receipts.savePreferences(BORA, { readReceiptsEnabled: false })
  assert.deepEqual(await adaView(), { deliveredUpTo: delivered })
  assert.deepEqual(await receipts.getPartnerReceipts(BORA, THREAD), {})
})

test("a blocked pair receives no receipt events in either direction", async () => {
  const { receipts, safetyService, events, send } = await setup()
  await receipts.savePreferences(ADA, { readReceiptsEnabled: true })
  await receipts.savePreferences(BORA, { readReceiptsEnabled: true })
  const message = await send(ADA, "hello", "2026-10-01T10:00:00.000Z")
  await safetyService.blockUser(ADA, BORA)

  await receipts.acknowledgeDelivered(BORA, THREAD, message.messageId)
  await assert.rejects(receipts.markRead(BORA, THREAD, { upToMessageId: message.messageId }), /not available/)
  assert.deepEqual(events, [])
})

test("an account outside the rollout neither moves cursors nor receives receipts", async () => {
  const { receipts, events, send } = await setup({ rolledOut: (userId) => userId === BORA })
  const message = await send(ADA, "hello", "2026-10-01T10:00:00.000Z")

  await receipts.acknowledgeDelivered(BORA, THREAD, message.messageId)
  assert.deepEqual(events, [], "the partner is not rolled out")
  assert.equal(await receipts.isEnabledFor(ADA), false)
  assert.equal(await receipts.getPartnerReceipts(ADA, THREAD), undefined)
  await assert.rejects(receipts.savePreferences(ADA, { readReceiptsEnabled: true }), ChatReceiptsUnavailableError)
  assert.deepEqual(await receipts.getPreferences(ADA), { preferences: { readReceiptsEnabled: false }, available: false })
})

test("with mutual receipts a read without a message id clears unread but never shows the partner a read tick", async () => {
  const { chatService, receipts, events, send } = await setup()
  await receipts.savePreferences(ADA, { readReceiptsEnabled: true })
  await receipts.savePreferences(BORA, { readReceiptsEnabled: true })
  const message = await send(ADA, "hello", "2026-10-01T10:00:00.000Z")

  const read = await receipts.markRead(BORA, THREAD, {}, new Date("2026-10-01T10:05:00.000Z"))
  assert.equal(read.readAt, "2026-10-01T10:05:00.000Z")
  assert.equal(read.readUpTo, undefined)
  assert.equal((await chatService.listThreads(BORA))[0]!.unreadCount, 0)
  assert.deepEqual(events.filter(({ event }) => event.type === "chat.receipt_updated" && event.payload.readUpTo), [])
  assert.equal((await receipts.getPartnerReceipts(ADA, THREAD))?.readUpTo, undefined)

  // Naming the shown message is what moves and publishes the receipt.
  await receipts.markRead(BORA, THREAD, { upToMessageId: message.messageId })
  assert.deepEqual((await receipts.getPartnerReceipts(ADA, THREAD))?.readUpTo, { sentAt: message.sentAt, messageId: message.messageId })
})

test("before migration 070 chat keeps working and receipts are simply absent", async () => {
  const { chatService, receipts, events, errors, send } = await setup({ receiptsSupported: false })
  const message = await send(ADA, "hello", "2026-10-01T10:00:00.000Z")

  await receipts.acknowledgeDelivered(BORA, THREAD, message.messageId)
  await receipts.noteHistoryLoaded(BORA, THREAD, await chatService.listMessages(BORA, THREAD))
  assert.deepEqual(await receipts.markRead(BORA, THREAD, { upToMessageId: message.messageId }), {
    readAt: message.sentAt,
    participantUserIds: [ADA, BORA]
  })
  const read = await receipts.markRead(BORA, THREAD, {}, new Date("2026-10-01T10:05:00.000Z"))
  assert.equal(read.readAt, "2026-10-01T10:05:00.000Z")
  assert.equal(read.readUpTo, undefined)
  const threads = await chatService.listThreads(BORA)
  assert.equal((await receipts.projectThreads(BORA, threads))[0]!.partnerReceipts, undefined)
  assert.equal(threads[0]!.unreadCount, 0)
  assert.deepEqual(await receipts.getPreferences(BORA), { preferences: { readReceiptsEnabled: false }, available: false })
  await assert.rejects(receipts.savePreferences(BORA, { readReceiptsEnabled: true }), ChatReceiptsUnavailableError)
  assert.deepEqual(events, [])
  assert.deepEqual(errors, [])
})

test("a storage failure while acknowledging is reported without leaking ids and never thrown", async () => {
  const { receipts, events, errors, send } = await setup({
    repository: (base) => ({
      ...base,
      async advanceDeliveredCursor() { throw new Error("connection reset") }
    })
  })
  const message = await send(ADA, "hello", "2026-10-01T10:00:00.000Z")
  await receipts.acknowledgeDelivered(BORA, THREAD, message.messageId)
  assert.equal(errors.length, 1)
  assert.deepEqual(events, [])
})

test("a failed receipt lookup never fails a thread or message list", async () => {
  const { chatService, receipts, errors, send } = await setup({
    repository: (base) => ({
      ...base,
      async listReceiptParticipants() { throw new Error("statement timeout") }
    })
  })
  await send(ADA, "hello", "2026-10-01T10:00:00.000Z")
  const threads = await chatService.listThreads(BORA)
  assert.equal(await receipts.projectThreads(BORA, threads), threads)
  assert.equal(await receipts.getPartnerReceipts(BORA, THREAD), undefined)
  assert.equal(errors.length, 2)
})

test("an unknown or own message cannot become the read cursor", async () => {
  const { receipts, send } = await setup()
  const own = await send(BORA, "mine", "2026-10-01T10:00:00.000Z")
  await assert.rejects(receipts.markRead(BORA, THREAD, { upToMessageId: own.messageId }), /message is not available/)
  await assert.rejects(receipts.markRead(BORA, THREAD, { upToMessageId: "message_missing" }), /message is not available/)
})
