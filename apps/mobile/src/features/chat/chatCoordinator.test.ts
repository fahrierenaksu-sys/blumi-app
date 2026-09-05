import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage, ChatMessageList } from "@blumi/contracts"
import type { SessionActor } from "../session/sessionModel"
import type { ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"
import type { RoomSessionJoinResult } from "./chatRoomInviteApi"
import {
  createChatCoordinator,
  type ChatCoordinatorDependencies
} from "./chatCoordinator"

const actor = {
  session: {
    mode: "production",
    sessionToken: "token-ada",
    userId: "ada",
    accountId: "account-ada",
    sessionId: "session-ada",
    expiresAt: "2026-07-23T00:00:00.000Z",
    onboarding: { profile: "complete", avatar: "complete", room: "complete" }
  },
  profile: { userId: "ada", displayName: "Ada", avatar: { presetId: "dusk" } }
} as SessionActor

const invite: ChatRoomInviteTimelineItem = {
  kind: "room_invite",
  inviteId: "invite_1",
  threadId: "thread_1",
  senderUserId: "ada",
  recipientUserId: "bora",
  createdAt: "2026-07-22T00:00:00.000Z",
  status: "pending"
}

const roomReady = {
  miniRoom: { miniRoomId: "room_1" },
  mediaSession: { token: "media-token" },
  participants: [
    { userId: "ada", displayName: "Ada" },
    { userId: "bora", displayName: "Bora" }
  ]
} as unknown as RoomSessionJoinResult

const message: ChatMessage = {
  messageId: "message_1",
  threadId: "thread_1",
  senderUserId: "bora",
  body: "Hello",
  sentAt: "2026-07-22T00:00:00.000Z"
}

type TestDependencies = ChatCoordinatorDependencies & {
  roomInvites: ChatRoomInviteTimelineItem[]
  apiCalls: string[]
  globalEvents: unknown[]
  listedMessages: ChatMessageList[]
  messageListLoading: string[]
  messageListFailures: { threadId: string; errorMessage: string }[]
  confirmedMessages: string[]
  failedMessages: string[]
  localReadThreads: string[]
  openedRooms: RoomSessionJoinResult[]
  analyticsEvents: string[]
  toasts: { title: string; body: string }[]
}

function createDependencies(
  overrides: Partial<TestDependencies> = {}
): TestDependencies {
  const dependencies = {
    getSessionActor: () => actor,
    isCurrentSession: () => true,
    setRoomInvites: (update: (current: readonly ChatRoomInviteTimelineItem[]) => ChatRoomInviteTimelineItem[]) => {
      dependencies.roomInvites = update(dependencies.roomInvites)
    },
    fetchThreadRoomInvites: async () => [invite],
    sendThreadMessage: async () => message,
    fetchThreadMessages: async () => ({
      userId: "ada",
      threadId: "thread_1",
      messages: [message]
    }),
    markThreadRead: async () => undefined,
    createThreadRoomInvite: async () => invite,
    decideThreadRoomInvite: async () => ({ ...invite, status: "accepted" as const, roomSessionId: "room-session-1" }),
    cancelThreadRoomInvite: async () => ({ ...invite, status: "cancelled" as const }),
    joinRoomSession: async () => roomReady,
    applyChatMessageListed: (payload: ChatMessageList) => dependencies.listedMessages.push(payload),
    applyChatMessageListLoading: (threadId: string) => dependencies.messageListLoading.push(threadId),
    applyChatMessageListFailed: (threadId: string, errorMessage: string) => {
      dependencies.messageListFailures.push({ threadId, errorMessage })
    },
    confirmOptimisticMessage: (_clientMessageId: string) => dependencies.confirmedMessages.push(message.messageId),
    markOptimisticMessageFailed: (clientMessageId: string) => dependencies.failedMessages.push(clientMessageId),
    markLocalThreadRead: (threadId: string) => dependencies.localReadThreads.push(threadId),
    openReadyMiniRoom: (ready: RoomSessionJoinResult) => dependencies.openedRooms.push(ready),
    captureProductEvent: (eventName: string) => dependencies.analyticsEvents.push(eventName),
    showWarningToast: (toast: { title: string; body: string }) => dependencies.toasts.push(toast),
    sendGlobal: (event: unknown) => dependencies.globalEvents.push(event),
    baseHttpUrl: "https://api.blumi.test",
    roomInvites: [],
    apiCalls: [],
    globalEvents: [],
    listedMessages: [],
    messageListLoading: [],
    messageListFailures: [],
    confirmedMessages: [],
    failedMessages: [],
    localReadThreads: [],
    openedRooms: [],
    analyticsEvents: [],
    toasts: [],
    ...overrides
  } as TestDependencies
  return dependencies
}

test("sends production messages, confirms optimistic state, and marks a thread read", async () => {
  const dependencies = createDependencies({
    sendThreadMessage: async (_baseUrl, sessionToken, threadId, body, options) => {
      dependencies.apiCalls.push(`${sessionToken}:${threadId}:${body}:${options?.clientMessageId}`)
      return message
    },
    markThreadRead: async (_baseUrl, sessionToken, threadId, options) => {
      dependencies.apiCalls.push(
        `read:${sessionToken}:${threadId}:${options?.expectedUserId}`
      )
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.sendChatMessage("thread_1", "Hello", "client_1")
  coordinator.markChatThreadRead("thread_1")
  await Promise.resolve()

  assert.deepEqual(dependencies.apiCalls, [
    "token-ada:thread_1:Hello:client_1",
    "read:token-ada:thread_1:ada"
  ])
  assert.deepEqual(dependencies.confirmedMessages, ["message_1"])
  assert.deepEqual(dependencies.localReadThreads, ["thread_1"])
})

test("keeps demo chat on realtime and skips production-only invitation actions", async () => {
  const demoActor = {
    ...actor,
    session: { ...actor.session, mode: "demo" }
  } as SessionActor
  const dependencies = createDependencies({ getSessionActor: () => demoActor })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.sendChatMessage("thread_1", "Hello", "client_1")
  await coordinator.requestMessages("thread_1")

  assert.deepEqual(dependencies.globalEvents, [
    { type: "chat.send_message", payload: { threadId: "thread_1", body: "Hello" } },
    { type: "chat.list_messages", payload: { threadId: "thread_1" } }
  ])
  await assert.rejects(
    coordinator.handleRoomInviteAction({ type: "create", threadId: "thread_1" }),
    /available after a mutual match/
  )
})

test("hydrates and immutably updates room invites through the chat coordinator", async () => {
  const dependencies = createDependencies()
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.requestMessages("thread_1")
  assert.deepEqual(dependencies.roomInvites, [invite])

  await coordinator.handleRoomInviteAction({ type: "create", threadId: "thread_1" })
  await coordinator.handleRoomInviteAction({ type: "accept", inviteId: "invite_1" })
  await coordinator.handleRoomInviteAction({ type: "cancel", inviteId: "invite_1" })
  await coordinator.handleRoomInviteAction({
    type: "open_room",
    inviteId: "invite_1",
    roomSessionId: "room-session-1"
  })

  assert.deepEqual(dependencies.openedRooms, [roomReady, roomReady])
  assert.deepEqual(dependencies.analyticsEvents, [
    "room_invite_sent",
    "room_invite_accepted",
    "room_invite_cancelled",
    "room_joined"
  ])
})

test("does not apply production responses after the session becomes stale", async () => {
  let current = true
  const dependencies = createDependencies({
    isCurrentSession: () => current,
    fetchThreadMessages: async () => {
      current = false
      return { userId: "ada", threadId: "thread_1", messages: [message] }
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.requestMessages("thread_1")

  assert.deepEqual(dependencies.listedMessages, [])
  assert.deepEqual(dependencies.roomInvites, [])
})

test("marks a production conversation failed and rejects when messages cannot load", async () => {
  const dependencies = createDependencies({
    fetchThreadMessages: async () => {
      throw new Error("Chat needs a connection.")
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await assert.rejects(
    coordinator.requestMessages("thread_1"),
    /Chat needs a connection/
  )
  assert.deepEqual(dependencies.messageListLoading, ["thread_1"])
  assert.deepEqual(dependencies.messageListFailures, [
    {
      threadId: "thread_1",
      errorMessage: "Chat needs a connection."
    }
  ])
})

test("redacts transport diagnostics from a failed conversation state and toast", async () => {
  const technicalError =
    "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
  const dependencies = createDependencies({
    fetchThreadMessages: async () => {
      throw new Error(technicalError)
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await assert.rejects(
    coordinator.requestMessages("thread_1"),
    (error: unknown) => error instanceof Error && error.message === technicalError
  )

  const userCopy =
    "We couldn't load this conversation. Check your connection and try again."
  assert.deepEqual(dependencies.messageListFailures, [
    { threadId: "thread_1", errorMessage: userCopy }
  ])
  assert.deepEqual(dependencies.toasts, [
    { title: "Chat not loaded", body: userCopy }
  ])
})

test("keeps a newer realtime invite update when hydration resolves with stale data", async () => {
  let resolveInvites: ((invites: ChatRoomInviteTimelineItem[]) => void) | undefined
  const staleInviteResponse = new Promise<ChatRoomInviteTimelineItem[]>((resolve) => {
    resolveInvites = resolve
  })
  const dependencies = createDependencies({
    fetchThreadRoomInvites: async () => staleInviteResponse
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.requestMessages("thread_1")
  const acceptedInvite = {
    ...invite,
    status: "accepted" as const,
    roomSessionId: "room-session-1"
  }
  coordinator.upsertRoomInvite(acceptedInvite)
  resolveInvites?.([invite])
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(dependencies.roomInvites, [acceptedInvite])
})

test("surfaces room-invite hydration failures without failing message loading", async () => {
  const dependencies = createDependencies({
    fetchThreadRoomInvites: async () => {
      throw new Error("invite service offline")
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.requestMessages("thread_1")
  await Promise.resolve()

  assert.deepEqual(dependencies.listedMessages, [
    { userId: "ada", threadId: "thread_1", messages: [message] }
  ])
  assert.deepEqual(dependencies.toasts, [
    {
      title: "Room invitations unavailable",
      body: "We couldn't load room invitations. Try again in a moment."
    }
  ])
})

test("does not confirm or fail a message after the session becomes stale", async () => {
  let current = true
  const dependencies = createDependencies({
    isCurrentSession: () => current,
    sendThreadMessage: async () => {
      current = false
      return message
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.sendChatMessage("thread_1", "Hello", "client_1")

  assert.deepEqual(dependencies.confirmedMessages, [])
  assert.deepEqual(dependencies.failedMessages, [])
  assert.deepEqual(dependencies.toasts, [])
})

test("does not open or report a room after an invite response becomes stale", async () => {
  let current = true
  const dependencies = createDependencies({
    isCurrentSession: () => current,
    joinRoomSession: async () => {
      current = false
      return roomReady
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.handleRoomInviteAction({ type: "accept", inviteId: "invite_1" })

  assert.deepEqual(dependencies.openedRooms, [])
  assert.deepEqual(dependencies.analyticsEvents, [])
})

test("surfaces a failed production message without mutating optimistic state twice", async () => {
  const dependencies = createDependencies({
    sendThreadMessage: async () => {
      throw new Error("offline")
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await assert.rejects(
    coordinator.sendChatMessage("thread_1", "Hello", "client_1"),
    /offline/
  )

  assert.deepEqual(dependencies.failedMessages, ["client_1"])
  assert.deepEqual(dependencies.toasts, [{
    title: "Message not sent",
    body: "Your message wasn't sent. Check your connection and try again."
  }])
})

test("redacts transport diagnostics from room invitation actions", async () => {
  const dependencies = createDependencies({
    createThreadRoomInvite: async () => {
      throw new Error("fetch failed: native transport timed out")
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await assert.rejects(coordinator.handleRoomInviteAction({
    type: "create",
    threadId: "thread_1"
  }))

  assert.deepEqual(dependencies.toasts, [{
    title: "Room invitation unavailable",
    body: "That room invitation isn't available right now. Try again."
  }])
})
