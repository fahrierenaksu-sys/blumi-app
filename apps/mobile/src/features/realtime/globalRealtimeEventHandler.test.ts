import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage, ChatThreadList } from "@blumi/contracts"
import {
  createGlobalRealtimeEventHandler,
  type GlobalRealtimeEventHandlerDependencies,
  type IncomingMessageToast
} from "./globalRealtimeEventHandler"

type TestDependencies = GlobalRealtimeEventHandlerDependencies & {
  handledMatchIds: Set<string>
  reconcilingMatchIds: Set<string>
  listedThreadLists: ChatThreadList[]
  createdThreadEvents: string[]
  listedMessages: ChatMessage[]
  receivedMessages: ChatMessage[]
  readyRooms: unknown[]
  roomInvites: unknown[]
  matchedEvents: unknown[]
  toasts: IncomingMessageToast[]
}

const message: ChatMessage = {
  messageId: "message_1",
  threadId: "thread_1",
  senderUserId: "bora",
  body: "This is a message that is intentionally longer than sixty characters so it is shortened.",
  sentAt: "2026-07-22T00:00:00.000Z"
}

test("read events stay on the current account and next chat pages are requested", () => {
  const reads: string[] = []
  const cursors: string[] = []
  let refreshes = 0
  const dependencies = createDependencies({ applyChatThreadRead: (value) => reads.push(value.userId), requestThreadPage: (cursor) => cursors.push(cursor), requestThreadRefresh: () => { refreshes++ } })
  const handler = createGlobalRealtimeEventHandler(dependencies)
  handler({ type: "chat.thread_read", payload: { userId: "bora", threadId: "thread_1", readAt: message.sentAt } })
  handler({ type: "chat.thread_read", payload: { userId: "ada", threadId: "thread_1", readAt: message.sentAt } })
  handler({ type: "chat.thread_listed", payload: { userId: "bora", threads: [], nextCursor: "foreign" } })
  handler({ type: "chat.thread_listed", payload: { userId: "ada", threads: [], nextCursor: "next" } })
  assert.deepEqual(reads, ["ada"])
  assert.deepEqual(cursors, ["next"])
  assert.equal(refreshes, 1)
})

test("the incoming message toast stays quiet when the conversation is on screen or the push already alerted", () => {
  const asked: { threadId: string; messageId: string }[] = []
  let allow = false
  const dependencies = createDependencies({
    shouldShowIncomingMessageAlert: (incoming) => { asked.push(incoming); return allow }
  })
  const handler = createGlobalRealtimeEventHandler(dependencies)
  handler({ type: "chat.message_received", payload: message })
  assert.deepEqual(dependencies.receivedMessages, [message], "the message is still applied to the store")
  assert.deepEqual(dependencies.toasts, [])
  allow = true
  handler({ type: "chat.message_received", payload: { ...message, messageId: "message_2" } })
  assert.equal(dependencies.toasts.length, 1)
  assert.deepEqual(asked, [
    { threadId: "thread_1", messageId: "message_1" },
    { threadId: "thread_1", messageId: "message_2" }
  ])
})

test("a partner's arriving message is acknowledged as delivered; my own echo is not", () => {
  const acknowledged: string[] = []
  const handler = createGlobalRealtimeEventHandler(createDependencies({
    acknowledgeDelivery: (value) => { acknowledged.push(value.messageId) }
  }))
  handler({ type: "chat.message_received", payload: message })
  handler({ type: "chat.message_received", payload: { ...message, messageId: "message_mine", senderUserId: "ada" } })
  assert.deepEqual(acknowledged, ["message_1"])
})

test("receipt updates reach the chat store with the current account", () => {
  const applied: { userId: string; localUserId?: string }[] = []
  const handler = createGlobalRealtimeEventHandler(createDependencies({
    applyChatReceiptUpdated: (payload, options) => { applied.push({ userId: payload.userId, localUserId: options.localUserId }) }
  }))
  handler({
    type: "chat.receipt_updated",
    payload: { threadId: "thread_1", userId: "bora", participantUserIds: ["ada", "bora"], readUpTo: { sentAt: message.sentAt, messageId: "message_1" } }
  })
  assert.deepEqual(applied, [{ userId: "bora", localUserId: "ada" }])
})

test("delivery is acknowledged even when no alert is shown, because the conversation is open", () => {
  const acknowledged: string[] = []
  const handler = createGlobalRealtimeEventHandler(createDependencies({
    shouldShowIncomingMessageAlert: () => false,
    acknowledgeDelivery: (value) => { acknowledged.push(value.messageId) }
  }))
  handler({ type: "chat.message_received", payload: message })
  assert.deepEqual(acknowledged, ["message_1"])
})

test("the server's block confirmation drops the blocked partner's chat", () => {
  const blocked: string[] = []
  const handler = createGlobalRealtimeEventHandler(createDependencies({
    onPartnerBlocked: (blockedUserId) => { blocked.push(blockedUserId) }
  }))
  handler({ type: "safety.user_blocked", payload: { blockedUserId: "bora" } })
  assert.deepEqual(blocked, ["bora"])
})

function createDependencies(
  overrides: Partial<TestDependencies> = {}
): TestDependencies {
  const dependencies = {
    currentUserId: "ada",
    handledMatchIds: new Set<string>(),
    reconcilingMatchIds: new Set<string>(),
    getMatchDeduplicationState: () => ({
      handledMatchIds: dependencies.handledMatchIds,
      reconcilingMatchIds: dependencies.reconcilingMatchIds
    }),
    listedThreadLists: [],
    createdThreadEvents: [],
    listedMessages: [],
    receivedMessages: [],
    readyRooms: [],
    roomInvites: [],
    matchedEvents: [],
    toasts: [],
    normalizeRoomInviteRecord: (value: unknown) => value as never,
    upsertRoomInvite: (invite: never) => dependencies.roomInvites.push(invite),
    applyChatThreadListed: (payload: ChatThreadList) => dependencies.listedThreadLists.push(payload),
    applyChatThreadCreated: () => dependencies.createdThreadEvents.push("created"),
    applyChatMessageListed: (payload: { messages: ChatMessage[] }) => {
      dependencies.listedMessages.push(...payload.messages)
    },
    applyChatMessageReceived: (payload: ChatMessage) => dependencies.receivedMessages.push(payload),
    getThreads: () => [],
    openReadyMiniRoom: (payload: unknown) => dependencies.readyRooms.push(payload),
    onConnectionMatched: (payload: unknown) => dependencies.matchedEvents.push(payload),
    showIncomingMessageToast: (toast: IncomingMessageToast) => {
      dependencies.toasts.push(toast)
    },
    ...overrides
  } as TestDependencies
  return dependencies
}

test("routes chat list and ready-room events to their coordinator dependencies", () => {
  const dependencies = createDependencies()
  const handler = createGlobalRealtimeEventHandler(dependencies)
  const threadList: ChatThreadList = { userId: "ada", threads: [] }
  const readyPayload = { miniRoom: { miniRoomId: "room_1" } }

  handler({ type: "chat.thread_listed", payload: threadList })
  handler({ type: "mini_room.ready", payload: readyPayload as never })

  assert.deepEqual(dependencies.listedThreadLists, [threadList])
  assert.deepEqual(dependencies.readyRooms, [readyPayload])
})

test("routes thread-created and message-listed events without treating them as notifications", () => {
  const dependencies = createDependencies()
  const handler = createGlobalRealtimeEventHandler(dependencies)

  handler({
    type: "chat.thread_created",
    payload: {
      threadId: "thread_1",
      miniRoomId: "room_1",
      participantUserIds: ["ada", "bora"],
      participants: [{ userId: "ada" }, { userId: "bora" }],
      createdAt: "2026-07-22T00:00:00.000Z"
    }
  })
  handler({
    type: "chat.message_listed",
    payload: { userId: "ada", threadId: "thread_1", messages: [message] }
  })

  assert.deepEqual(dependencies.createdThreadEvents, ["created"])
  assert.deepEqual(dependencies.listedMessages, [message])
  assert.deepEqual(dependencies.toasts, [])
})

test("applies incoming messages and shortens only other-user notification copy", () => {
  const dependencies = createDependencies({
    getThreads: () => [{
      threadId: "thread_1",
      miniRoomId: "room_1",
      participantUserIds: ["ada", "bora"],
      participants: [{ userId: "ada" }, { userId: "bora", displayName: "Bora" }],
      createdAt: "2026-07-22T00:00:00.000Z"
    }]
  })
  const handler = createGlobalRealtimeEventHandler(dependencies)

  handler({ type: "chat.message_received", payload: message })
  handler({
    type: "chat.message_received",
    payload: { ...message, messageId: "message_2", senderUserId: "ada" }
  })

  assert.equal(dependencies.receivedMessages.length, 2)
  assert.deepEqual(dependencies.toasts.map(({ title, body, durationMs }) => ({ title, body, durationMs })), [{
    title: "Bora",
    body: `${message.body.slice(0, 57)}…`,
    durationMs: 2500
  }])
})

test("no toast for a message whose conversation is on screen, in its chat or its MiniRoom (CHT-01)", () => {
  const onScreen = new Set(["thread_1"])
  const asked: string[] = []
  const dependencies = createDependencies({
    shouldShowIncomingMessageAlert: ({ threadId, messageId }) => {
      asked.push(messageId)
      return !onScreen.has(threadId)
    }
  })
  const handler = createGlobalRealtimeEventHandler(dependencies)
  handler({ type: "chat.message_received", payload: message })
  assert.deepEqual(dependencies.toasts, [])
  handler({ type: "chat.message_received", payload: { ...message, messageId: "message_2", threadId: "thread_2" } })
  assert.equal(dependencies.toasts.length, 1)
  handler({ type: "chat.message_received", payload: { ...message, messageId: "message_3", senderUserId: "ada" } })
  assert.deepEqual(asked, ["message_1", "message_2"], "own messages are never alerts")
})

test("the message toast opens its conversation and names an unknown sender in the user's language", () => {
  const opened: string[] = []
  const dependencies = createDependencies({
    openConversation: (threadId) => { opened.push(threadId) },
    unknownSenderName: "Biri"
  })
  const handler = createGlobalRealtimeEventHandler(dependencies)
  handler({ type: "chat.message_received", payload: message })
  const [toast] = dependencies.toasts
  assert.equal(toast?.title, "Biri")
  toast?.onPress?.()
  assert.deepEqual(opened, ["thread_1"])
})

test("the sender's in-room acknowledgement is stored without its client id", () => {
  const dependencies = createDependencies()
  const handler = createGlobalRealtimeEventHandler(dependencies)
  const acknowledged = {
    messageId: "message_ack",
    threadId: "thread_1",
    senderUserId: "ada",
    body: "hi",
    sentAt: "2026-09-30T10:00:00.000Z"
  }
  handler({ type: "chat.message_received", payload: { ...acknowledged, clientMessageId: "room_client_1" } })
  assert.deepEqual(dependencies.receivedMessages, [acknowledged])
})

test("ignores malformed room invites and deduplicated or foreign match events", () => {
  const dependencies = createDependencies({
    normalizeRoomInviteRecord: () => {
      throw new Error("invalid")
    }
  })
  const handler = createGlobalRealtimeEventHandler(dependencies)
  const matchPayload = {
    miniRoomId: "room_match",
    participantUserIds: ["ada", "bora"] as [string, string],
    matchedAt: "2026-07-22T00:00:00.000Z"
  }

  handler({ type: "chat.room_invite_updated", payload: {} as never })
  handler({ type: "connection.matched", payload: matchPayload })
  handler({
    type: "connection.matched",
    payload: { ...matchPayload, miniRoomId: "foreign", participantUserIds: ["bora", "cora"] }
  })

  assert.deepEqual(dependencies.roomInvites, [])
  assert.deepEqual(dependencies.matchedEvents, [matchPayload])
})

test("does not mutate deduplication sets while routing an eligible match", () => {
  const handledMatchIds = new Set<string>()
  const reconcilingMatchIds = new Set<string>()
  const dependencies = createDependencies({ handledMatchIds, reconcilingMatchIds })
  const handler = createGlobalRealtimeEventHandler(dependencies)

  handler({
    type: "connection.matched",
    payload: {
      miniRoomId: "room_match",
      participantUserIds: ["ada", "bora"],
      matchedAt: "2026-07-22T00:00:00.000Z"
    }
  })

  assert.deepEqual([...handledMatchIds], [])
  assert.deepEqual([...reconcilingMatchIds], [])
})
