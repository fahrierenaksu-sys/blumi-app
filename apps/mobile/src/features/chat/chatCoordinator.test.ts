import assert from "node:assert/strict"
import test from "node:test"
import { RoomInviteApiError } from "./chatRoomInviteApi"
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
    leaveActiveRoom: async () => ({ ended: true }),
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

test("serializes same-thread HTTP sends so a later tap cannot overtake an earlier ACK", async () => {
  const started: { threadId: string; body: string; clientMessageId: string | undefined }[] = []
  let resolveFirst!: (message: ChatMessage) => void
  const firstResponse = new Promise<ChatMessage>((resolve) => { resolveFirst = resolve })
  const dependencies = createDependencies({
    sendThreadMessage: async (_baseUrl, _token, threadId, body, options) => {
      started.push({ threadId, body, clientMessageId: options?.clientMessageId })
      return body === "first"
        ? firstResponse
        : { ...message, senderUserId: "ada", body, sentAt: "2026-07-22T00:00:02.000Z" }
    }
  })
  const coordinator = createChatCoordinator(dependencies)
  // RootNavigator may recreate the coordinator; the thread queue must survive it.
  const recreatedCoordinator = createChatCoordinator(dependencies)

  const first = coordinator.sendChatMessage("thread_1", "first", "client-order-001")
  const second = recreatedCoordinator.sendChatMessage("thread_1", "second", "client-order-002")
  const otherThread = recreatedCoordinator.sendChatMessage("thread_2", "independent", "client-order-003")
  const startedBeforeFirstAck = [...started]
  resolveFirst({
    ...message,
    senderUserId: "ada",
    body: "first",
    sentAt: "2026-07-22T00:00:01.000Z"
  })
  await Promise.all([first, second, otherThread])

  assert.deepEqual(startedBeforeFirstAck, [{
    threadId: "thread_1",
    body: "first",
    clientMessageId: "client-order-001"
  }, {
    threadId: "thread_2",
    body: "independent",
    clientMessageId: "client-order-003"
  }])
  assert.deepEqual(started, [
    { threadId: "thread_1", body: "first", clientMessageId: "client-order-001" },
    { threadId: "thread_2", body: "independent", clientMessageId: "client-order-003" },
    { threadId: "thread_1", body: "second", clientMessageId: "client-order-002" }
  ])
})

test("a failed send releases the same-thread queue and retry retains its idempotency key", async () => {
  const started: { body: string; clientMessageId: string | undefined }[] = []
  let rejectFirst!: (error: Error) => void
  const firstResponse = new Promise<ChatMessage>((_resolve, reject) => { rejectFirst = reject })
  let firstAttempt = true
  const dependencies = createDependencies({
    sendThreadMessage: async (_baseUrl, _token, _threadId, body, options) => {
      started.push({ body, clientMessageId: options?.clientMessageId })
      if (options?.clientMessageId === "client-retry-001" && firstAttempt) {
        firstAttempt = false
        return firstResponse
      }
      return { ...message, senderUserId: "ada", body }
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  const first = coordinator.sendChatMessage("thread_1", "first", "client-retry-001")
  const firstRejected = assert.rejects(first, /offline/)
  const second = coordinator.sendChatMessage("thread_1", "second", "client-after-failure-001")
  const startedBeforeFailure = [...started]
  rejectFirst(new Error("offline"))
  await Promise.all([firstRejected, second])
  await coordinator.sendChatMessage("thread_1", "first", "client-retry-001")

  assert.deepEqual(startedBeforeFailure, [{
    body: "first",
    clientMessageId: "client-retry-001"
  }])
  assert.deepEqual(started, [
    { body: "first", clientMessageId: "client-retry-001" },
    { body: "second", clientMessageId: "client-after-failure-001" },
    { body: "first", clientMessageId: "client-retry-001" }
  ])
  assert.deepEqual(dependencies.failedMessages, ["client-retry-001"])
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

test("an accepted invite opens the room from the decision answer without a second join request", async () => {
  let joins = 0
  const decided = { ...invite, status: "accepted" as const, roomSessionId: "room_1" }
  const dependencies = createDependencies({
    decideThreadRoomInvite: async () => ({ ...decided, readyRoom: roomReady }),
    joinRoomSession: async () => {
      joins += 1
      return roomReady
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.handleRoomInviteAction({ type: "accept", inviteId: "invite_1" })

  // The decision already carries the room, participants and media session;
  // a second join round trip only delayed the room (latency audit 2026-10-01).
  assert.equal(joins, 0)
  assert.deepEqual(dependencies.openedRooms, [roomReady])
  assert.deepEqual(dependencies.roomInvites, [decided], "the stored invite carries no room payload")
  assert.deepEqual(dependencies.analyticsEvents, ["room_invite_accepted"])
})

test("loads invitations before slow message history and shares in-flight history and invite requests", async () => {
  let finishHistory: ((value: ChatMessageList) => void) | undefined
  let finishInvites: ((value: ChatRoomInviteTimelineItem[]) => void) | undefined
  const slowHistory = new Promise<ChatMessageList>((resolve) => { finishHistory = resolve })
  const pendingInvites = new Promise<ChatRoomInviteTimelineItem[]>((resolve) => { finishInvites = resolve })
  let inviteRequests = 0
  let historyRequests = 0
  const dependencies = createDependencies({
    fetchThreadMessages: async () => {
      historyRequests += 1
      return slowHistory
    },
    fetchThreadRoomInvites: async () => {
      inviteRequests += 1
      return pendingInvites
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  const firstHistory = coordinator.requestMessages("thread_1")
  const secondHistory = coordinator.requestMessages("thread_1")
  assert.equal(inviteRequests, 1)
  assert.equal(historyRequests, 1)
  assert.deepEqual(dependencies.listedMessages, [])

  finishInvites?.([invite])
  await coordinator.refreshThreadRoomInvites("thread_1")
  assert.equal(inviteRequests, 1)
  assert.deepEqual(dependencies.roomInvites, [invite])
  assert.deepEqual(dependencies.listedMessages, [])

  finishHistory?.({ userId: "ada", threadId: "thread_1", messages: [message] })
  await Promise.all([firstHistory, secondHistory])
  assert.equal(dependencies.listedMessages.length, 1)
})

test("a cold first page is published after its invitation snapshot, not as two visible history stages", async () => {
  let finishInvites!: (value: ChatRoomInviteTimelineItem[]) => void
  const pendingInvites = new Promise<ChatRoomInviteTimelineItem[]>((resolve) => { finishInvites = resolve })
  const dependencies = createDependencies({ fetchThreadRoomInvites: async () => pendingInvites })
  const coordinator = createChatCoordinator(dependencies)
  const opening = coordinator.requestMessages("thread_1")
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(dependencies.listedMessages, [], "fast messages alone must not reveal an incomplete first snapshot")
  finishInvites([invite])
  await opening
  assert.deepEqual(dependencies.roomInvites, [invite])
  assert.equal(dependencies.listedMessages.length, 1)
})

test("refreshing loaded history never waits for a slow invitation service", async () => {
  let finishInvites!: (value: ChatRoomInviteTimelineItem[]) => void
  const pendingInvites = new Promise<ChatRoomInviteTimelineItem[]>((resolve) => { finishInvites = resolve })
  const dependencies = createDependencies({ hasMessageHistory: () => true, fetchThreadRoomInvites: async () => pendingInvites })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.requestMessages("thread_1")
  assert.equal(dependencies.listedMessages.length, 1)
  finishInvites([invite])
  await coordinator.refreshThreadRoomInvites("thread_1")
})

test("quiet inbox warmup starts history and invitations together and opening reuses both", async () => {
  let finishHistory!: (value: ChatMessageList) => void
  const slowHistory = new Promise<ChatMessageList>((resolve) => { finishHistory = resolve })
  let historyRequests = 0
  let inviteRequests = 0
  const dependencies = createDependencies({
    fetchThreadMessages: async () => {
      historyRequests += 1
      return slowHistory
    },
    fetchThreadRoomInvites: async () => {
      inviteRequests += 1
      return [invite]
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  const warmup = coordinator.requestMessages("thread_1", {}, { purpose: "prefetch" })
  assert.equal(historyRequests, 1)
  assert.equal(inviteRequests, 1)
  const open = coordinator.requestMessages("thread_1")
  assert.equal(historyRequests, 1)
  assert.equal(inviteRequests, 1)

  finishHistory({ userId: "ada", threadId: "thread_1", messages: [message] })
  await Promise.all([warmup, open])
  await coordinator.requestMessages("thread_1")
  assert.equal(historyRequests, 1, "a just-warmed conversation should reuse its complete first page")
  assert.equal(inviteRequests, 1, "a just-warmed invitation should not reload after opening")
  assert.equal(dependencies.listedMessages.length, 1)
})

test("quiet invitation warmup failures do not toast, and opening retries the invitation", async () => {
  let attempts = 0
  const dependencies = createDependencies({
    fetchThreadRoomInvites: async () => {
      attempts += 1
      if (attempts === 1) throw new Error("offline")
      return [invite]
    }
  })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.requestMessages("thread_1", {}, { purpose: "prefetch" })
  await Promise.resolve()
  assert.deepEqual(dependencies.toasts, [])
  await coordinator.requestMessages("thread_1")
  assert.equal(attempts, 2)
  assert.deepEqual(dependencies.roomInvites, [invite])
})

test("reconnect resynchronization bypasses fresh history and invitation receipts", async () => {
  let histories = 0
  let invitations = 0
  const dependencies = createDependencies({
    fetchThreadMessages: async () => {
      histories += 1
      return { userId: "ada", threadId: "thread_1", messages: [message] }
    },
    fetchThreadRoomInvites: async () => { invitations += 1; return [invite] }
  })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.requestMessages("thread_1")
  await coordinator.resynchronizeMessages("thread_1")
  assert.equal(histories, 2)
  assert.equal(invitations, 2)
})

test("reconnect discards a pre-gap history and invite response without losing the new snapshot", async () => {
  let finishHistory!: (value: ChatMessageList) => void
  let finishInvites!: (value: ChatRoomInviteTimelineItem[]) => void
  let histories = 0
  let invitations = 0
  const dependencies = createDependencies({
    fetchThreadMessages: async () => ++histories === 1
      ? new Promise((resolve) => { finishHistory = resolve })
      : { userId: "ada", threadId: "thread_1", messages: [{ ...message, body: "current" }] },
    fetchThreadRoomInvites: async () => ++invitations === 1
      ? new Promise((resolve) => { finishInvites = resolve })
      : [{ ...invite, status: "accepted" }]
  })
  const coordinator = createChatCoordinator(dependencies)
  const old = coordinator.requestMessages("thread_1")
  await coordinator.resynchronizeMessages("thread_1")
  finishHistory({ userId: "ada", threadId: "thread_1", messages: [message] })
  finishInvites([invite])
  await old
  assert.equal(dependencies.listedMessages.length, 1)
  assert.equal(dependencies.listedMessages[0].messages[0].body, "current")
  assert.equal(dependencies.roomInvites[0].status, "accepted")
})

test("opening freshness expires and older-message pagination never reuses the first page", async (context) => {
  let now = 1_000
  context.mock.method(Date, "now", () => now)
  const requestedPages: unknown[] = []
  const dependencies = createDependencies({
    fetchThreadMessages: async (_url, _token, _thread, options) => {
      requestedPages.push(options)
      return { userId: "ada", threadId: "thread_1", messages: [message] }
    }
  })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.requestMessages("thread_1", {}, { purpose: "prefetch" })
  await coordinator.requestMessages("thread_1")
  assert.equal(requestedPages.length, 1)
  await coordinator.requestMessages("thread_1", { before: "message_1", limit: 20 })
  assert.equal(requestedPages.length, 2)
  now += 10_001
  await coordinator.requestMessages("thread_1")
  assert.equal(requestedPages.length, 3)
})

test("history warmup cannot apply or be reused across accounts", async () => {
  let currentActor = actor
  const nextActor = {
    ...actor,
    session: { ...actor.session, sessionToken: "token-next", userId: "next" },
    profile: { ...actor.profile, userId: "next" }
  } as SessionActor
  const finishes = new Map<string, (value: ChatMessageList) => void>()
  const dependencies = createDependencies({
    getSessionActor: () => currentActor,
    isCurrentSession: (expected) => currentActor === expected,
    fetchThreadMessages: async (_url, token) => new Promise((resolve) => {
      finishes.set(token, resolve)
    })
  })
  const coordinator = createChatCoordinator(dependencies)
  const previous = coordinator.requestMessages("thread_1", {}, { purpose: "prefetch" })
  currentActor = nextActor
  const next = coordinator.requestMessages("thread_1")
  finishes.get("token-ada")!({ userId: "ada", threadId: "thread_1", messages: [message] })
  await previous
  assert.deepEqual(dependencies.listedMessages, [])
  finishes.get("token-next")!({ userId: "next", threadId: "thread_1", messages: [] })
  await next
  assert.deepEqual(dependencies.listedMessages, [{ userId: "next", threadId: "thread_1", messages: [] }])
})

test("quiet inbox warmup has no unsolicited toast and a failed warmup can be retried", async () => {
  let attempts = 0
  const dependencies = createDependencies({
    fetchThreadMessages: async () => {
      attempts += 1
      if (attempts === 1) throw new Error("offline")
      return { userId: "ada", threadId: "thread_1", messages: [message] }
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await assert.rejects(
    coordinator.requestMessages("thread_1", {}, { purpose: "prefetch" }),
    /offline/
  )
  assert.deepEqual(dependencies.toasts, [])
  await coordinator.requestMessages("thread_1")
  assert.equal(attempts, 2)
  assert.equal(dependencies.listedMessages.length, 1)
})

test("a new account does not reuse or apply the previous account's pending invitations", async () => {
  const nextActor = {
    ...actor,
    session: { ...actor.session, sessionToken: "token-bora", userId: "bora" },
    profile: { ...actor.profile, userId: "bora" }
  } as SessionActor
  let currentActor = actor
  const finishByToken = new Map<string, (value: ChatRoomInviteTimelineItem[]) => void>()
  const dependencies = createDependencies({
    getSessionActor: () => currentActor,
    isCurrentSession: (expectedActor) => expectedActor === currentActor,
    fetchThreadRoomInvites: async (_baseUrl, token) => new Promise((resolve) => {
      finishByToken.set(token, resolve)
    })
  })
  const coordinator = createChatCoordinator(dependencies)

  const previousRequest = coordinator.refreshThreadRoomInvites("thread_1")
  currentActor = nextActor
  const currentRequest = coordinator.refreshThreadRoomInvites("thread_1")
  assert.deepEqual([...finishByToken.keys()], ["token-ada", "token-bora"])

  const currentInvite = { ...invite, status: "accepted" as const, roomSessionId: "room_1" }
  finishByToken.get("token-bora")?.([currentInvite])
  await currentRequest
  finishByToken.get("token-ada")?.([invite])
  await previousRequest
  assert.deepEqual(dependencies.roomInvites, [currentInvite])
})

test("a shared failed invite refresh reports one warning without failing message history", async () => {
  let rejectInvites: ((error: Error) => void) | undefined
  const pendingInvites = new Promise<ChatRoomInviteTimelineItem[]>((_resolve, reject) => {
    rejectInvites = reject
  })
  let inviteRequests = 0
  const dependencies = createDependencies({
    fetchThreadRoomInvites: async () => {
      inviteRequests += 1
      return pendingInvites
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  const history = Promise.all([
    coordinator.requestMessages("thread_1"),
    coordinator.requestMessages("thread_1")
  ])
  const sharedFailure = assert.rejects(coordinator.refreshThreadRoomInvites("thread_1"), /offline/)
  rejectInvites?.(new Error("invite service offline"))
  await history
  await sharedFailure
  assert.equal(inviteRequests, 1)
  assert.equal(dependencies.listedMessages.length, 1)
  assert.deepEqual(dependencies.toasts, [{
    title: "Room invitations unavailable",
    body: "We couldn't load room invitations. Try again in a moment."
  }])
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

  const history = coordinator.requestMessages("thread_1")
  const acceptedInvite = {
    ...invite,
    status: "accepted" as const,
    roomSessionId: "room-session-1"
  }
  coordinator.upsertRoomInvite(acceptedInvite)
  resolveInvites?.([invite])
  await history

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

test("self-busy room invite lets the caller offer explicit recovery without a duplicate generic toast", async () => {
  let closed = 0
  const dependencies = createDependencies({
    createThreadRoomInvite: async () => {
      throw new RoomInviteApiError("You are still in a room.", "SELF_IN_ROOM", 409, "room_one")
    },
    leaveActiveRoom: async (_baseUrl, _sessionToken, expectedRoomSessionId) => {
      assert.equal(expectedRoomSessionId, "room_one")
      closed += 1
      return { ended: true }
    }
  })
  const coordinator = createChatCoordinator(dependencies)
  await assert.rejects(
    coordinator.handleRoomInviteAction({ type: "create", threadId: "thread_1" }),
    (error: unknown) => error instanceof RoomInviteApiError && error.code === "SELF_IN_ROOM"
  )
  assert.deepEqual(dependencies.toasts, [])
  await coordinator.closeMyActiveRoom("room_one")
  assert.equal(closed, 1)
})

test("another participant's busy room has a specific safe explanation", async () => {
  const dependencies = createDependencies({
    createThreadRoomInvite: async () => {
      throw new RoomInviteApiError("The other participant is already in a room.", "PARTICIPANT_BUSY", 409)
    }
  })
  const coordinator = createChatCoordinator(dependencies)
  await assert.rejects(coordinator.handleRoomInviteAction({ type: "create", threadId: "thread_1" }))
  assert.equal(dependencies.toasts[0]?.body, "The other person is currently in another room. Try again later.")
})
