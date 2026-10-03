import assert from "node:assert/strict"
import test from "node:test"
import { RoomInviteApiError } from "./chatRoomInviteApi"
import type { ChatMessage, ChatMessageList } from "@blumi/contracts"
import type { SessionActor } from "../session/sessionModel"
import { getRoomInviteActions, type ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"
import type { RoomSessionJoinResult } from "./chatRoomInviteApi"
import { getChatRoomInviteHistory, resetChatRoomInviteHistory } from "./chatRoomInvitePagingStore"
import {
  createChatCoordinator,
  type ChatCoordinatorDependencies
} from "./chatCoordinator"
import { fetchThreadMessages as fetchHistoryPage, type FetchThreadMessagesOptions } from "./chatApi"
import {
  applyChatMessageListed,
  applyChatMessageListLoading,
  applyChatMessageListFailed,
  getMessageListState,
  getMessages,
  hasMessageHistory,
  createChatThreadSnapshotReader,
  getHistoryPageMessageIds,
  resetChatStore
} from "./chatStore"

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

const historicInvite = (index: number): ChatRoomInviteTimelineItem => ({ ...invite,
  inviteId: `paged-${index}`, status: "declined", createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() })

test("bounded invite sync retains requested history, deduplicates older loads and keeps active/exact targets out of the history cursor", async () => {
  resetChatRoomInviteHistory()
  const rows = Array.from({ length: 200 }, (_, index) => historicInvite(index))
  const ancientLive = { ...rows[0]!, status: "accepted" as const, roomSessionId: "live-fixture" }
  const options: unknown[] = []
  const deps = createDependencies({ fetchThreadRoomInvitePage: async (_base, _token, _thread, request = {}) => {
    options.push(request)
    if (request.inviteId) return { invites: [rows[2]!], activeInvites: [], nextCursor: null, paged: true }
    const end = request.before ? rows.findIndex(row => row.inviteId === request.before) : rows.length
    const page = rows.slice(Math.max(0, end - 20), end)
    return { invites: page, activeInvites: [ancientLive], nextCursor: end > 20 ? page[0]!.inviteId : null, paged: true }
  } })
  const c = createChatCoordinator(deps)
  await c.refreshThreadRoomInvites("thread_1")
  assert.equal(deps.roomInvites.length, 21)
  const first = getChatRoomInviteHistory("thread_1", "ada")
  assert.equal(first.nextCursor, rows[180]!.inviteId)
  assert.deepEqual(first.activeInviteIds, [ancientLive.inviteId])
  const pending = c.requestOlderRoomInvites("thread_1", first.nextCursor!)
  const duplicate = c.requestOlderRoomInvites("thread_1", first.nextCursor!)
  assert.equal(pending, duplicate)
  assert.equal((await pending).length, 20)
  assert.equal(deps.roomInvites.length, 41)
  await c.refreshThreadRoomInvites("thread_1")
  assert.equal(deps.roomInvites.length, 41, "a bounded latest refresh never deletes previously loaded history")
  assert.equal(getChatRoomInviteHistory("thread_1", "ada").nextCursor, rows[160]!.inviteId)
  assert.equal(await c.ensureRoomInvite("thread_1", rows[2]!.inviteId), true)
  assert.equal(deps.roomInvites.length, 42)
  assert.ok(!getChatRoomInviteHistory("thread_1", "ada").historyInviteIds.includes(rows[2]!.inviteId))
  assert.equal(getChatRoomInviteHistory("thread_1", "ada").nextCursor, rows[160]!.inviteId)
  assert.deepEqual(options[0], { limit: 20 })
  assert.deepEqual(options[1], { before: rows[180]!.inviteId, limit: 20 })
  c.closeEndedRoom("live-fixture")
  assert.deepEqual(getChatRoomInviteHistory("thread_1", "ada").activeInviteIds, [])
  resetChatRoomInviteHistory()
})

test("a stale invite page cannot revert realtime cancel/accept or erase a new arrival while first page loads", async () => {
  resetChatRoomInviteHistory()
  let finish: (page: Awaited<ReturnType<NonNullable<ChatCoordinatorDependencies["fetchThreadRoomInvitePage"]>>>) => void = () => undefined
  const deps = createDependencies({ fetchThreadRoomInvitePage: () => new Promise(resolve => { finish = resolve }) })
  const c = createChatCoordinator(deps)
  const pending = c.refreshThreadRoomInvites("thread_1")
  c.upsertRoomInvite({ ...invite, status: "cancelled" })
  const arrival = { ...historicInvite(2), status: "accepted" as const, roomSessionId: "live-fixture" }
  c.upsertRoomInvite(arrival)
  finish({ invites: [invite], activeInvites: [], nextCursor: null, paged: true })
  await pending
  assert.equal(deps.roomInvites.find(row => row.inviteId === invite.inviteId)!.status, "cancelled")
  const metadata = getChatRoomInviteHistory("thread_1", "ada")
  assert.deepEqual(metadata.activeInviteIds, [arrival.inviteId])
  assert.ok(metadata.historyInviteIds.includes(arrival.inviteId))
  assert.equal(metadata.nextCursor, null)
  resetChatRoomInviteHistory()
})

test("late latest, older and targeted invitations are ignored after an account switch; terminal targets do not walk history", async () => {
  for (const mode of ["latest", "older", "target"] as const) {
    resetChatRoomInviteHistory()
    let current = true
    let delayed = false
    let finish: (page: Awaited<ReturnType<NonNullable<ChatCoordinatorDependencies["fetchThreadRoomInvitePage"]>>>) => void = () => undefined
    const deps = createDependencies({ isCurrentSession: () => current,
      fetchThreadRoomInvitePage: async () => delayed ? new Promise(resolve => { finish = resolve })
        : { invites: [historicInvite(20)], activeInvites: [], nextCursor: historicInvite(20).inviteId, paged: true } })
    const c = createChatCoordinator(deps)
    if (mode !== "latest") await c.refreshThreadRoomInvites("thread_1")
    delayed = true
    const pending = mode === "latest" ? c.refreshThreadRoomInvites("thread_1") : mode === "older"
      ? c.requestOlderRoomInvites("thread_1", historicInvite(20).inviteId) : c.ensureRoomInvite("thread_1", invite.inviteId)
    const before = deps.roomInvites
    current = false
    resetChatRoomInviteHistory()
    finish({ invites: [invite], activeInvites: [], nextCursor: null, paged: true })
    if (mode === "target") await assert.rejects(pending, { name: "AbortError" })
    else await pending
    assert.equal(deps.roomInvites, before)
    assert.equal(getChatRoomInviteHistory("thread_1", "ada").ready, false)
  }
  let calls = 0
  const c = createChatCoordinator(createDependencies({ fetchThreadRoomInvitePage: async () => {
    calls += 1
    return { invites: [], activeInvites: [], nextCursor: null, paged: true }
  } }))
  assert.equal(await c.ensureRoomInvite("thread_1", "missing-fixture"), false)
  assert.equal(calls, 1)
})

test("a message reconnect cannot consume an old invite target and a newer realtime decision wins the exact reply", async () => {
  resetChatRoomInviteHistory()
  let finish: (page: Awaited<ReturnType<NonNullable<ChatCoordinatorDependencies["fetchThreadRoomInvitePage"]>>>) => void = () => undefined
  const deps = createDependencies({ fetchThreadRoomInvitePage: async (_base, _token, _thread, options) =>
    options?.inviteId ? new Promise(resolve => { finish = resolve }) : { invites: [], activeInvites: [], nextCursor: null, paged: true } })
  const c = createChatCoordinator(deps)
  const pending = c.ensureRoomInvite("thread_1", invite.inviteId)
  c.resynchronizeMessages("thread_1")
  c.upsertRoomInvite({ ...invite, status: "cancelled" })
  finish({ invites: [invite], activeInvites: [], nextCursor: null, paged: true })
  assert.equal(await pending, true)
  assert.equal(deps.roomInvites.find(row => row.inviteId === invite.inviteId)!.status, "cancelled")
  resetChatRoomInviteHistory()
})

test("a published exact accepted target cannot be downgraded by an older in-flight latest page", async () => {
  resetChatRoomInviteHistory()
  let finishLatest: (page: Awaited<ReturnType<NonNullable<ChatCoordinatorDependencies["fetchThreadRoomInvitePage"]>>>) => void = () => undefined
  const accepted = { ...invite, status: "accepted" as const, roomSessionId: "live-fixture" }
  const deps = createDependencies({ fetchThreadRoomInvitePage: async (_base, _token, _thread, options) =>
    options?.inviteId ? { invites: [accepted], activeInvites: [], nextCursor: null, paged: true }
      : new Promise(resolve => { finishLatest = resolve }) })
  const c = createChatCoordinator(deps)
  const latest = c.refreshThreadRoomInvites("thread_1")
  assert.equal(await c.ensureRoomInvite("thread_1", invite.inviteId), true)
  finishLatest({ invites: [invite], activeInvites: [], nextCursor: null, paged: true })
  await latest
  assert.equal(deps.roomInvites[0]!.status, "accepted")
  assert.equal(deps.roomInvites[0]!.roomSessionId, accepted.roomSessionId)
  resetChatRoomInviteHistory()
})

test("sends production messages, confirms optimistic state, and marks a thread read", async () => {
  const dependencies = createDependencies({
    sendThreadMessage: async (_baseUrl, sessionToken, threadId, body, options) => {
      dependencies.apiCalls.push(`${sessionToken}:${threadId}:${body}:${options?.clientMessageId}`)
      return message
    },
    markThreadRead: async (_baseUrl, sessionToken, threadId, options) => {
      dependencies.apiCalls.push(
        `read:${sessionToken}:${threadId}:${options?.expectedUserId}:${options?.upToMessageId ?? "now"}`
      )
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.sendChatMessage("thread_1", "Hello", "client_1")
  coordinator.markChatThreadRead("thread_1")
  coordinator.markChatThreadRead("thread_1", "message_from_partner")
  await Promise.resolve()

  assert.deepEqual(dependencies.apiCalls, [
    "token-ada:thread_1:Hello:client_1",
    "read:token-ada:thread_1:ada:now",
    "read:token-ada:thread_1:ada:message_from_partner"
  ])
  assert.deepEqual(dependencies.confirmedMessages, ["message_1"])
  assert.deepEqual(dependencies.localReadThreads, ["thread_1", "thread_1"])
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

  assert.deepEqual(dependencies.openedRooms, [roomReady])
  assert.deepEqual(dependencies.analyticsEvents, [
    "room_invite_sent",
    "room_invite_accepted",
    "room_invite_cancelled",
    "room_joined"
  ])
})

test("an unchanged invitation refresh keeps the same invite list, so its holder does not re-render", async () => {
  let served: ChatRoomInviteTimelineItem[] = [{ ...invite }]
  const other: ChatRoomInviteTimelineItem = { ...invite, inviteId: "invite_2", threadId: "thread_2" }
  const dependencies = createDependencies({
    roomInvites: [other],
    fetchThreadRoomInvites: async () => served.map((entry) => ({ ...entry }))
  })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.refreshThreadRoomInvites("thread_1")
  const first = dependencies.roomInvites
  assert.deepEqual(first, [other, invite])
  await coordinator.refreshThreadRoomInvites("thread_1")
  assert.equal(dependencies.roomInvites, first, "same values from the server: same list")
  served = [{ ...invite, status: "accepted", roomSessionId: "room-session-1" }]
  await coordinator.refreshThreadRoomInvites("thread_1")
  assert.notEqual(dependencies.roomInvites, first)
  assert.deepEqual(dependencies.roomInvites, [other, served[0]])
})

test("acceptance updates the card without entering; a separate entry joins with fresh server authority", async () => {
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

  assert.equal(joins, 0)
  assert.deepEqual(dependencies.openedRooms, [])
  assert.deepEqual(dependencies.roomInvites, [decided], "the stored invite carries no room payload")
  assert.deepEqual(dependencies.analyticsEvents, ["room_invite_accepted"])
  await coordinator.handleRoomInviteAction({ type: "open_room", inviteId: "invite_1", roomSessionId: "room_1" })
  assert.equal(joins, 1)
  assert.deepEqual(dependencies.openedRooms, [roomReady])
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
  assert.equal(secondHistory, firstHistory, "normalizing the initial page preserves in-flight sharing")
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

test("a cold first page becomes readable without waiting for a slow invitation service", async () => {
  let finishInvites!: (value: ChatRoomInviteTimelineItem[]) => void
  const pendingInvites = new Promise<ChatRoomInviteTimelineItem[]>((resolve) => { finishInvites = resolve })
  const dependencies = createDependencies({ fetchThreadRoomInvites: async () => pendingInvites })
  const coordinator = createChatCoordinator(dependencies)
  const opening = coordinator.requestMessages("thread_1")
  await opening
  assert.equal(dependencies.listedMessages.length, 1, "the available conversation is published immediately")
  assert.deepEqual(dependencies.roomInvites, [], "the invitation service is still pending")
  finishInvites([invite])
  await coordinator.refreshThreadRoomInvites("thread_1")
  assert.deepEqual(dependencies.roomInvites, [invite])
  assert.equal(dependencies.listedMessages.length, 1, "the late card merges without republishing history")
})

test("refreshing loaded history never waits for a slow invitation service", async () => {
  let finishInvites!: (value: ChatRoomInviteTimelineItem[]) => void
  const pendingInvites = new Promise<ChatRoomInviteTimelineItem[]>((resolve) => { finishInvites = resolve })
  const dependencies = createDependencies({ hasMessageHistory: () => true, fetchThreadRoomInvites: async () => pendingInvites })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.requestMessages("thread_1")
  assert.equal(dependencies.listedMessages.length, 1)
  assert.deepEqual(dependencies.messageListLoading, [], "already readable history does not toggle a hidden loading flag")
  finishInvites([invite])
  await coordinator.refreshThreadRoomInvites("thread_1")
})

test("a failed cached refresh preserves readable messages and a retry clears its stale error", async () => {
  resetChatStore()
  try {
    const page = { userId: "ada", threadId: "thread_1", messages: [message] }
    applyChatMessageListed(page)
    const cached = getMessages("thread_1")
    let fail!: () => void
    let first = true
    const pending = new Promise<ChatMessageList>((_resolve, reject) => { fail = () => reject(new Error("Synthetic offline failure")) })
    const dependencies = createDependencies({
      hasMessageHistory,
      applyChatMessageListed,
      applyChatMessageListLoading,
      applyChatMessageListFailed,
      fetchThreadMessages: async () => {
        if (first) { first = false; return pending }
        return structuredClone(page)
      }
    })
    const coordinator = createChatCoordinator(dependencies)
    const refresh = coordinator.requestMessages("thread_1")
    assert.equal(getMessageListState("thread_1").status, "ready", "a pending refresh leaves cached content ready")
    fail()
    await assert.rejects(refresh, /Synthetic offline failure/)
    assert.equal(getMessageListState("thread_1").status, "failed", "failure remains available to the retry UI")
    assert.equal(getMessages("thread_1"), cached)
    assert.equal(hasMessageHistory("thread_1"), true)
    await coordinator.requestMessages("thread_1")
    assert.equal(getMessageListState("thread_1").status, "ready", "success clears the previous error")
    assert.equal(getMessages("thread_1"), cached, "unchanged cached bubbles still do not redraw")
  } finally {
    resetChatStore()
  }
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

test("a press-in warmup never flags the thread loading; opening it does", async () => {
  let finishHistory!: (value: ChatMessageList) => void
  const dependencies = createDependencies({
    fetchThreadMessages: async () => new Promise<ChatMessageList>((resolve) => { finishHistory = resolve })
  })
  const coordinator = createChatCoordinator(dependencies)
  const warmup = coordinator.requestMessages("thread_1", {}, { purpose: "prefetch" })
  assert.deepEqual(dependencies.messageListLoading, [], "a warmup notifies no store reader while the finger is down")
  const open = coordinator.requestMessages("thread_1")
  assert.deepEqual(dependencies.messageListLoading, [], "opening during the warmup reuses it")
  finishHistory({ userId: "ada", threadId: "thread_1", messages: [message] })
  await Promise.all([warmup, open])
  assert.equal(dependencies.listedMessages.length, 1, "the warmed page still lands in the store")
  const openedDependencies = createDependencies()
  await createChatCoordinator(openedDependencies).requestMessages("thread_1")
  assert.deepEqual(openedDependencies.messageListLoading, ["thread_1"], "an opened chat shows that it loads")
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
  const requestedPages: (FetchThreadMessagesOptions | undefined)[] = []
  const dependencies = createDependencies({
    fetchThreadMessages: async (_url, _token, _thread, options) => {
      histories += 1
      requestedPages.push(options)
      return { userId: "ada", threadId: "thread_1", messages: [message] }
    },
    fetchThreadRoomInvites: async () => { invitations += 1; return [invite] }
  })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.requestMessages("thread_1")
  await coordinator.resynchronizeMessages("thread_1")
  assert.equal(histories, 2)
  assert.equal(invitations, 2)
  assert.deepEqual(requestedPages, [{ limit: 20 }, { limit: 20 }])
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
  assert.deepEqual(requestedPages, [{ limit: 20 }, { before: "message_1", limit: 20 }, { limit: 20 }])
})

test("production opening requests the newest twenty messages and preserves older and custom pages over HTTP", async () => {
  const threadId = "synthetic-history-thread"
  const history = Array.from({ length: 64 }, (_, index): ChatMessage => ({
    messageId: `synthetic-history-${index}`, threadId, senderUserId: "synthetic-partner",
    body: "Synthetic content", sentAt: new Date(Date.UTC(2026, 9, 3, 0, 0, index)).toISOString()
  }))
  const receipts = { deliveredUpTo: { sentAt: history.at(-1)!.sentAt, messageId: history.at(-1)!.messageId } }
  const requests: { before: string | null; limit: string | null }[] = []
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const before = url.searchParams.get("before")
    const limit = url.searchParams.get("limit")
    requests.push({ before, limit })
    const end = before ? history.findIndex((entry) => entry.messageId === before) : history.length
    const count = limit ? Number(limit) : 50
    return new Response(JSON.stringify({
      userId: "ada", threadId, messages: history.slice(Math.max(0, end - count), end), partnerReceipts: receipts
    }), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  const dependencies = createDependencies({
    fetchThreadMessages: (baseUrl, token, id, options) => fetchHistoryPage(baseUrl, token, id, options, fetcher)
  })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.requestMessages(threadId)
  const newest = dependencies.listedMessages[0]!
  assert.deepEqual(newest.messages, history.slice(-20), "the initial request fetches only the latest server page")
  assert.deepEqual(newest.partnerReceipts, receipts, "a smaller history page does not rewrite server receipt authority")
  await coordinator.requestMessages(threadId, { before: newest.messages[0]!.messageId, limit: 20 })
  assert.deepEqual(dependencies.listedMessages[1]!.messages, history.slice(-40, -20), "the displayed oldest message is an exclusive cursor")
  await coordinator.requestMessages(threadId, { limit: 7 })
  assert.deepEqual(dependencies.listedMessages[2]!.messages, history.slice(-7), "an explicit custom limit is not reused from the initial page")
  await coordinator.requestMessages(threadId, { before: newest.messages[0]!.messageId })
  assert.deepEqual(dependencies.listedMessages[3]!.messages, history.slice(0, -20), "a caller-supplied cursor without a limit retains server paging semantics")
  assert.deepEqual(requests, [
    { before: null, limit: "20" },
    { before: newest.messages[0]!.messageId, limit: "20" },
    { before: null, limit: "7" },
    { before: newest.messages[0]!.messageId, limit: null }
  ])
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

test("history publication preserves the authoritative latest boundary while older HTTP pages retain their own membership", async () => {
  resetChatStore()
  try {
    const history = Array.from({ length: 45 }, (_, index): ChatMessage => ({
      messageId: `synthetic-boundary-${index}`, threadId: "synthetic-boundary-thread", senderUserId: "synthetic-peer",
      body: "Synthetic content", sentAt: new Date(Date.UTC(2026, 9, 3, 0, index)).toISOString()
    }))
    const dependencies = createDependencies({ hasMessageHistory, applyChatMessageListed,
      applyChatMessageListLoading, applyChatMessageListFailed,
      fetchThreadMessages: async (_base, _token, threadId, options) => {
        const end = options?.before ? history.findIndex((entry) => entry.messageId === options.before) : history.length
        return { userId: actor.profile.userId, threadId, messages: history.slice(Math.max(0, end - (options?.limit ?? 20)), end) }
      }
    })
    const coordinator = createChatCoordinator(dependencies)
    const read = createChatThreadSnapshotReader("synthetic-boundary-thread")
    await coordinator.requestMessages("synthetic-boundary-thread")
    const latest = read().latestHistoryMessageIds
    const before = latest![0]!
    await coordinator.requestMessages("synthetic-boundary-thread", { before, limit: 20 })
    assert.equal(read().latestHistoryMessageIds, latest, "older-page loads never impersonate a new latest page")
    assert.deepEqual(getHistoryPageMessageIds("synthetic-boundary-thread", before), history.slice(5, 25).map((message) => message.messageId))
  } finally { resetChatStore() }
})

test("a history response outside the current owner or requested conversation is rejected before publication", async () => {
  for (const reply of [
    { userId: "synthetic-other-owner", threadId: "thread_1", messages: [message] },
    { userId: actor.profile.userId, threadId: "synthetic-other-thread", messages: [message] },
    { userId: actor.profile.userId, threadId: "thread_1", messages: [{ ...message, threadId: "synthetic-other-thread" }] }
  ]) {
    const dependencies = createDependencies({ fetchThreadMessages: async () => reply })
    const coordinator = createChatCoordinator(dependencies)
    await assert.rejects(coordinator.requestMessages("thread_1"), /could not confirm that conversation/)
    assert.deepEqual(dependencies.listedMessages, [])
    assert.equal(dependencies.messageListFailures[0]?.threadId, "thread_1")
    assert.equal(dependencies.toasts.length, 1)
  }
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

test("an ended room stops offering entry, even from an invite response already in flight", async () => {
  let resolveInvites: ((invites: ChatRoomInviteTimelineItem[]) => void) | undefined
  const inFlight = new Promise<ChatRoomInviteTimelineItem[]>((resolve) => {
    resolveInvites = resolve
  })
  const dependencies = createDependencies({ fetchThreadRoomInvites: async () => inFlight })
  const coordinator = createChatCoordinator(dependencies)
  const accepted = { ...invite, status: "accepted" as const, roomSessionId: "room-session-ended" }
  const otherThread = { ...accepted, inviteId: "invite_2", threadId: "thread_2", roomSessionId: "room-session-live" }
  coordinator.upsertRoomInvite(accepted)
  coordinator.upsertRoomInvite(otherThread)
  assert.equal(getRoomInviteActions(dependencies.roomInvites[0]!, "ada")[0]?.type, "open_room")

  const refresh = coordinator.refreshThreadRoomInvites("thread_1")
  coordinator.closeEndedRoom("room-session-ended")
  const [closed, untouched] = dependencies.roomInvites
  assert.equal(closed?.status, "accepted", "the invite keeps its history")
  assert.equal(closed?.roomSessionId, undefined)
  assert.deepEqual(getRoomInviteActions(closed!, "ada"), [], "the door to the ended room is closed")
  assert.equal(untouched?.roomSessionId, "room-session-live", "another room stays enterable")

  resolveInvites?.([accepted])
  await refresh
  const refreshed = dependencies.roomInvites.find((entry) => entry.inviteId === accepted.inviteId)
  assert.equal(refreshed?.roomSessionId, undefined, "a response read before the end cannot reopen the room")
  coordinator.upsertRoomInvite(accepted)
  assert.equal(
    dependencies.roomInvites.find((entry) => entry.inviteId === accepted.inviteId)?.roomSessionId,
    undefined
  )
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
    decideThreadRoomInvite: async () => {
      current = false
      return { ...invite, status: "accepted", roomSessionId: "room_1" }
    }
  })
  const coordinator = createChatCoordinator(dependencies)

  await coordinator.handleRoomInviteAction({ type: "accept", inviteId: "invite_1" })

  assert.deepEqual(dependencies.openedRooms, [])
  assert.deepEqual(dependencies.analyticsEvents, [])
})

test("does not enter a room when the explicit join response belongs to a stale session", async () => {
  let current = true
  const dependencies = createDependencies({
    isCurrentSession: () => current,
    joinRoomSession: async () => { current = false; return roomReady }
  })
  const coordinator = createChatCoordinator(dependencies)
  await coordinator.handleRoomInviteAction({ type: "open_room", inviteId: "invite_1", roomSessionId: "room_1" })
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
