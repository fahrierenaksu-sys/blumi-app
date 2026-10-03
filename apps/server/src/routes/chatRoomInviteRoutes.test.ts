import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createInMemoryConnectionRepository } from "../connections/connectionRepository"
import type { ConnectionService } from "../connections/connectionService"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore
} from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createNotificationService } from "../notifications/notificationService"
import { createRecipientLocaleResolver } from "../notifications/notificationDeliveryContext"
import { createPresenceService } from "../presence/presenceService"
import { createConnectionManager } from "../realtime/connectionManager"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

test("mutual-match chat room invite endpoints persist state, notify safely, and accept idempotently", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([]))
  })
  const sentPushes: Array<{ data?: Record<string, string> }> = []
  const notificationService = createNotificationService({
    pushProvider: {
      async sendPush(_token, notification) {
        sentPushes.push({ data: notification.data })
      }
    }
  })
  const miniRoomService = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService(),
    idFactory: (() => {
      let index = 0
      return () => `http_${++index}`
    })()
  })
  const connectionManager = createConnectionManager()
  const roomEndEvents: Array<Extract<ServerEvent, { type: "mini_room.ended" }>> = []
  const sendToUsers = connectionManager.sendToUsers.bind(connectionManager)
  connectionManager.sendToUsers = (userIds, event) => {
    if (event.type === "mini_room.ended") roomEndEvents.push(event)
    sendToUsers(userIds, event)
  }
  const app = createServer({
    authService,
    chatService,
    safetyService,
    matchService,
    miniRoomService,
    notificationService,
    connectionManager
  })
  try {
    const sender = await createEligibleAccount(app, authService, "+905551110001", "Ada")
    const recipient = await createEligibleAccount(app, authService, "+905551110002", "Bora")
    await notificationService.registerDevice(recipient.userId, {
      platform: "ios",
      pushToken: "recipient-device"
    })
    await matchService.repository.createMatch({
      matchId: "mutual_chat",
      participantUserIds: [sender.userId, recipient.userId],
      matchedAt: "2026-07-21T10:00:00.000Z"
    })
    const threadId = "thread_match_mutual_chat"
    await chatService.createThread({
      threadId,
      miniRoomId: "match_mutual_chat",
      participantUserIds: [sender.userId, recipient.userId],
      participants: [
        { userId: sender.userId, displayName: "Ada" },
        { userId: recipient.userId, displayName: "Bora" }
      ]
    })

    const created = await app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(created.statusCode, 201)
    assert.equal(created.json().invite.sourceThreadId, threadId)
    const inviteId = created.json().invite.inviteId as string

    const repeatedCreate = await app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(repeatedCreate.statusCode, 200)
    assert.equal(repeatedCreate.json().created, false)
    assert.equal(repeatedCreate.json().invite.inviteId, inviteId)

    const listed = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${recipient.sessionToken}` }
    })
    assert.equal(listed.statusCode, 200)
    assert.deepEqual(listed.json().invites.map((invite: { inviteId: string }) => invite.inviteId), [inviteId])
    await notificationService.dispatchDue()
    assert.deepEqual(sentPushes, [{
      data: {
        type: "chat.room_invite",
        threadId,
        inviteId,
        expiresAt: created.json().invite.expiresAt,
        recipientUserId: recipient.userId
      }
    }])

    const accepted = await app.inject({
      method: "POST",
      url: `/v1/room-invites/${inviteId}/decision`,
      headers: { authorization: `Bearer ${recipient.sessionToken}` },
      payload: { status: "accepted" }
    })
    assert.equal(accepted.statusCode, 200)
    assert.equal(accepted.json().invite.status, "accepted")
    assert.equal(accepted.json().miniRoom.sourceThreadId, threadId)

    const rejoined = await app.inject({
      method: "POST",
      url: `/v1/room-sessions/${accepted.json().miniRoom.miniRoomId}/join`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(rejoined.statusCode, 200)
    assert.equal(rejoined.json().miniRoom.miniRoomId, accepted.json().miniRoom.miniRoomId)
    assert.equal(rejoined.json().mediaSession.miniRoomId, accepted.json().miniRoom.miniRoomId)
    assert.equal(rejoined.json().participants.length, 2)

    const acceptedAgain = await app.inject({
      method: "POST",
      url: `/v1/room-invites/${inviteId}/decision`,
      headers: { authorization: `Bearer ${recipient.sessionToken}` },
      payload: { status: "accepted" }
    })
    assert.equal(acceptedAgain.statusCode, 200)
    assert.equal(acceptedAgain.json().miniRoom.miniRoomId, accepted.json().miniRoom.miniRoomId)

    const busy = await app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(busy.statusCode, 409)
    assert.equal(busy.json().code, "SELF_IN_ROOM")

    const roomId = accepted.json().miniRoom.miniRoomId as string
    assert.equal(busy.json().roomSessionId, roomId)
    const unauthenticatedLeave = await app.inject({
      method: "POST",
      url: `/v1/room-sessions/${roomId}/leave`,
      payload: {}
    })
    assert.equal(unauthenticatedLeave.statusCode, 401)
    const stranger = await createEligibleAccount(app, authService, "+905551110012", "Cem")
    const forbiddenLeave = await app.inject({
      method: "POST",
      url: `/v1/room-sessions/${roomId}/leave`,
      headers: { authorization: `Bearer ${stranger.sessionToken}` },
      payload: {}
    })
    assert.equal(forbiddenLeave.statusCode, 404)
    assert.ok(await miniRoomService.findActiveMiniRoomForUser(sender.userId))

    const left = await app.inject({
      method: "POST",
      url: `/v1/room-sessions/${roomId}/leave`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(left.statusCode, 200)
    assert.equal(left.json().ended, true)
    assert.equal(await miniRoomService.findActiveMiniRoomForUser(sender.userId), null)
    const repeatedLeave = await app.inject({
      method: "POST",
      url: `/v1/room-sessions/${roomId}/leave`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(repeatedLeave.statusCode, 200)
    assert.equal(repeatedLeave.json().ended, false)

    const otherParticipant = await app.inject({
      method: "POST",
      url: `/v1/users/me/active-room/leave`,
      headers: { authorization: `Bearer ${recipient.sessionToken}` },
      payload: { expectedRoomSessionId: roomId }
    })
    assert.equal(otherParticipant.statusCode, 200)
    assert.equal(otherParticipant.json().ended, false)

    const nextInvite = await app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(nextInvite.statusCode, 201)
    const nextAccepted = await app.inject({
      method: "POST",
      url: `/v1/room-invites/${nextInvite.json().invite.inviteId}/decision`,
      headers: { authorization: `Bearer ${recipient.sessionToken}` },
      payload: { status: "accepted" }
    })
    assert.equal(nextAccepted.statusCode, 200)
    const nextRoomId = nextAccepted.json().miniRoom.miniRoomId as string
    const staleRecovery = await app.inject({
      method: "POST",
      url: "/v1/users/me/active-room/leave",
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: { expectedRoomSessionId: roomId }
    })
    assert.equal(staleRecovery.statusCode, 409)
    assert.equal((await miniRoomService.findActiveMiniRoomForUser(sender.userId))?.miniRoomId, nextRoomId)
    const recovered = await app.inject({
      method: "POST",
      url: "/v1/users/me/active-room/leave",
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: { expectedRoomSessionId: nextRoomId }
    })
    assert.equal(recovered.statusCode, 200)
    assert.equal(recovered.json().ended, true)
    assert.equal(await miniRoomService.findActiveMiniRoomForUser(recipient.userId), null)
    const nothingToRecover = await app.inject({
      method: "POST",
      url: "/v1/users/me/active-room/leave",
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: { expectedRoomSessionId: nextRoomId }
    })
    assert.equal(nothingToRecover.statusCode, 200)
    assert.equal(nothingToRecover.json().ended, false)

    const safetyInvite = await app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(safetyInvite.statusCode, 201)
    const safetyRoom = await app.inject({
      method: "POST",
      url: `/v1/room-invites/${safetyInvite.json().invite.inviteId}/decision`,
      headers: { authorization: `Bearer ${recipient.sessionToken}` },
      payload: { status: "accepted" }
    })
    assert.equal(safetyRoom.statusCode, 200)
    const safetyRoomId = safetyRoom.json().miniRoom.miniRoomId as string
    const block = await app.inject({
      method: "POST",
      url: "/v1/safety/blocks",
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: { blockedUserId: recipient.userId }
    })
    assert.equal(block.statusCode, 201)
    assert.equal(await miniRoomService.findActiveMiniRoomForUser(sender.userId), null)
    assert.equal(roomEndEvents.filter((event) => event.payload.miniRoomId === safetyRoomId).length, 1)
  } finally {
    await app.close()
  }
})

test("a room invite push is queued even while the recipient holds a socket, and expires with the invite", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([]))
  })
  const sentPushes: Array<{ body: string; data?: Record<string, string> }> = []
  const notificationService = createNotificationService({
    pushProvider: { async sendPush(_token, notification) { sentPushes.push({ body: notification.body, data: notification.data }) } },
    resolveRecipientLocale: createRecipientLocaleResolver(authService.repository)
  })
  const miniRoomService = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService()
  })
  const connectionManager = createConnectionManager()
  // A socket the server still counts can belong to a phone that has already
  // gone to the background; only the phone knows whether the thread is open.
  connectionManager.hasUserConnections = () => true
  const app = createServer({
    authService, chatService, safetyService, matchService, miniRoomService, notificationService, connectionManager
  })
  try {
    const sender = await createEligibleAccount(app, authService, "+905551110020", "Ada")
    const recipient = await createEligibleAccount(app, authService, "+905551110021", "Bora")
    await notificationService.registerDevice(recipient.userId, { platform: "ios", pushToken: "recipient-device" })
    await matchService.repository.createMatch({
      matchId: "socket_invite",
      participantUserIds: [sender.userId, recipient.userId],
      matchedAt: "2026-07-21T10:00:00.000Z"
    })
    const threadId = "thread_match_socket_invite"
    await chatService.createThread({
      threadId,
      miniRoomId: "match_socket_invite",
      participantUserIds: [sender.userId, recipient.userId],
      participants: [
        { userId: sender.userId, displayName: "Ada" },
        { userId: recipient.userId, displayName: "Bora" }
      ]
    })
    const created = await app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(created.statusCode, 201)
    const invite = created.json().invite as { inviteId: string; expiresAt: string }
    await notificationService.dispatchDue()
    assert.deepEqual(sentPushes, [{
      // The recipient registered with the Turkish app language.
      body: "Yeni bir oda davetin var.",
      data: {
        type: "chat.room_invite",
        threadId,
        inviteId: invite.inviteId,
        expiresAt: invite.expiresAt,
        recipientUserId: recipient.userId
      }
    }])
  } finally {
    await app.close()
  }
})

test("opening a matched chat with a test persona creates one incoming room invite", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([]))
  })
  const miniRoomService = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService()
  })
  const app = createServer({
    authService,
    chatService,
    safetyService,
    matchService,
    miniRoomService,
    connectionManager: createConnectionManager()
  })
  try {
    const user = await createEligibleAccount(app, authService, "+905551110010", "Ada")
    const persona = await createEligibleAccount(app, authService, "+905551110011", "Bora")
    chatService.repository.findTestPersona = async (userId) => userId === persona.userId
      ? { userId, greeting: "Merhaba", replies: ["Nasılsın?"] }
      : null
    await matchService.repository.createMatch({
      matchId: "persona_room",
      participantUserIds: [user.userId, persona.userId],
      matchedAt: "2026-07-21T10:00:00.000Z"
    })
    const threadId = "thread_match_persona_room"
    await chatService.createThread({
      threadId,
      miniRoomId: "match_persona_room",
      participantUserIds: [user.userId, persona.userId],
      participants: [
        { userId: user.userId, displayName: "Ada" },
        { userId: persona.userId, displayName: "Bora" }
      ]
    })

    const missingTarget = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites?inviteId=synthetic_unavailable`,
      headers: { authorization: `Bearer ${user.sessionToken}` }
    })
    assert.equal(missingTarget.statusCode, 404)
    assert.equal((await miniRoomService.repository.listInvitesForThread(threadId, new Date())).length, 0,
      "an exact lookup never asks a test persona to create an invitation")
    const first = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites?limit=1`,
      headers: { authorization: `Bearer ${user.sessionToken}` }
    })
    assert.equal(first.statusCode, 200)
    assert.equal(first.json().invites.length, 1)
    assert.equal(first.json().invites[0].senderUserId, persona.userId)
    assert.equal(first.json().invites[0].recipientUserId, user.userId)
    assert.equal(first.json().nextCursor, null)
    assert.deepEqual(first.json().activeInvites, [])

    const repeated = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites?limit=1`,
      headers: { authorization: `Bearer ${user.sessionToken}` }
    })
    assert.equal(repeated.statusCode, 200)
    assert.equal(repeated.json().invites.length, 1)
    assert.equal(repeated.json().invites[0].inviteId, first.json().invites[0].inviteId)

    const inviteId = first.json().invites[0].inviteId as string
    const accepted = await app.inject({
      method: "POST",
      url: `/v1/room-invites/${inviteId}/decision`,
      headers: { authorization: `Bearer ${user.sessionToken}` },
      payload: { status: "accepted" }
    })
    assert.equal(accepted.statusCode, 200)
    const roomId = accepted.json().miniRoom.miniRoomId as string
    const whileLive = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites?limit=1`,
      headers: { authorization: `Bearer ${user.sessionToken}` }
    })
    assert.deepEqual(
      whileLive.json().invites.map((entry: { status: string; roomSessionId?: string }) => [entry.status, entry.roomSessionId]),
      [["accepted", roomId]],
      "a live room's invite stays the only one"
    )

    const left = await app.inject({
      method: "POST",
      url: `/v1/room-sessions/${roomId}/leave`,
      headers: { authorization: `Bearer ${user.sessionToken}` },
      payload: {}
    })
    assert.equal(left.json().ended, true)
    const afterEnd = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites?limit=1`,
      headers: { authorization: `Bearer ${user.sessionToken}` }
    })
    assert.equal(afterEnd.statusCode, 200)
    assert.equal(afterEnd.json().invites.length, 1, "persona creation rereads the requested bounded page")
    assert.equal(afterEnd.json().invites[0]?.status, "pending")
    const earlier = await app.inject({ method: "GET",
      url: `/v1/threads/${threadId}/room-invites?limit=1&before=${afterEnd.json().invites[0].inviteId}`,
      headers: { authorization: `Bearer ${user.sessionToken}` } })
    assert.deepEqual(earlier.json().invites.map((entry: { inviteId: string }) => entry.inviteId), [inviteId])
    assert.equal(earlier.json().nextCursor, null)
    assert.deepEqual(earlier.json().activeInvites.map((entry: { inviteId: string }) => entry.inviteId),
      [afterEnd.json().invites[0].inviteId])
    const legacy = await app.inject({ method: "GET", url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${user.sessionToken}` } })
    const afterEndInvites = legacy.json().invites as Array<{
      inviteId: string; status: string; senderUserId: string; roomSessionId?: string
    }>
    assert.equal(afterEndInvites.length, 2, "the persona invites again once its room has ended")
    assert.equal(afterEndInvites[0]?.inviteId, inviteId)
    assert.equal(afterEndInvites[0]?.status, "accepted")
    assert.equal(afterEndInvites[0]?.roomSessionId, undefined, "an ended room is not offered for entry")
    assert.equal(afterEndInvites[1]?.status, "pending")
    assert.equal(afterEndInvites[1]?.senderUserId, persona.userId)
  } finally {
    await app.close()
  }
})

test("room invite creation rejects a chat not backed by a persisted mutual match", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const miniRoomService = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService()
  })
  const app = createServer({ authService, chatService, safetyService, miniRoomService })
  try {
    const sender = await createEligibleAccount(app, authService, "+905551110003", "Ada")
    const recipient = await createEligibleAccount(app, authService, "+905551110004", "Bora")
    await chatService.createThread({
      threadId: "thread_unmatched",
      miniRoomId: "unmatched",
      participantUserIds: [sender.userId, recipient.userId],
      participants: [
        { userId: sender.userId, displayName: "Ada" },
        { userId: recipient.userId, displayName: "Bora" }
      ]
    })
    const response = await app.inject({
      method: "POST",
      url: "/v1/threads/thread_unmatched/room-invites",
      headers: { authorization: `Bearer ${sender.sessionToken}` },
      payload: {}
    })
    assert.equal(response.statusCode, 403)
  } finally {
    await app.close()
  }
})

test("room-saved mutual matches can invite again only from their canonical chat", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([]))
  })
  const connectionRepository = createInMemoryConnectionRepository()
  const miniRoomService = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService()
  })
  const app = createServer({
    authService, chatService, safetyService, miniRoomService, matchService,
    connectionService: { repository: connectionRepository } as ConnectionService
  })
  try {
    const sender = await createEligibleAccount(app, authService, "+905551110091", "Ada")
    const recipient = await createEligibleAccount(app, authService, "+905551110092", "Bora")
    await connectionRepository.saveMatch({
      miniRoomId: "saved_room_pair",
      participantUserIds: [sender.userId, recipient.userId],
      matchedAt: "2026-09-29T10:00:00.000Z"
    })
    await matchService.repository.createMatch({
      matchId: "later_discovery_match",
      participantUserIds: [sender.userId, recipient.userId],
      matchedAt: "2026-09-29T10:01:00.000Z"
    })
    const participants = [
      { userId: sender.userId, displayName: "Ada" },
      { userId: recipient.userId, displayName: "Bora" }
    ] as [{ userId: string; displayName: string }, { userId: string; displayName: string }]
    await chatService.createThread({
      threadId: "thread_connection_saved_room_pair",
      miniRoomId: "saved_room_pair",
      participantUserIds: [sender.userId, recipient.userId], participants
    })
    await chatService.createThread({
      threadId: "thread_other",
      miniRoomId: "saved_room_pair",
      participantUserIds: [sender.userId, recipient.userId], participants
    })
    const headers = { authorization: `Bearer ${sender.sessionToken}` }
    const invalid = await app.inject({ method: "POST", url: "/v1/threads/thread_other/room-invites", headers, payload: {} })
    assert.equal(invalid.statusCode, 403)
    const created = await app.inject({ method: "POST", url: "/v1/threads/thread_connection_saved_room_pair/room-invites", headers, payload: {} })
    assert.equal(created.statusCode, 201)
    assert.equal(created.json().invite.sourceThreadId, "thread_connection_saved_room_pair")
    const listed = await app.inject({
      method: "GET", url: "/v1/threads/thread_connection_saved_room_pair/room-invites",
      headers: { authorization: `Bearer ${recipient.sessionToken}` }
    })
    assert.equal(listed.statusCode, 200)
    assert.equal(listed.json().invites.length, 1)
  } finally {
    await app.close()
  }
})

test("bounded invitation reads reduce a thousand-row history while preserving active actions, exact old targets and legacy history", async (t) => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const matchService = createMatchService({ repository: createInMemoryMatchRepository(createInMemoryMatchStore([])) })
  const miniRoomService = createMiniRoomService({ presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService, chatService, livekitTokenService: createLivekitTokenService() })
  const app = createServer({ authService, chatService, safetyService, matchService, miniRoomService })
  try {
    const owner = await createEligibleAccount(app, authService, "+905551110093", "Synthetic owner")
    const peer = await createEligibleAccount(app, authService, "+905551110094", "Synthetic peer")
    const stranger = await createEligibleAccount(app, authService, "+905551110095", "Synthetic outsider")
    await matchService.repository.createMatch({ matchId: "synthetic_history_match", participantUserIds: [owner.userId, peer.userId], matchedAt: "2026-10-01T00:00:00Z" })
    const threadId = "thread_match_synthetic_history_match"
    await chatService.createThread({ threadId, miniRoomId: "match_synthetic_history_match", participantUserIds: [owner.userId, peer.userId],
      participants: [{ userId: owner.userId }, { userId: peer.userId }] })
    const oldLiveId = "synthetic_old_live"
    const liveRoomId = "synthetic_history_live_room"
    await miniRoomService.repository.saveInvite({ inviteId: oldLiveId, sourceThreadId: threadId,
      senderUserId: owner.userId, recipientUserId: peer.userId, status: "pending",
      createdAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" })
    assert.equal(await miniRoomService.repository.acceptPendingInvite({ inviteId: oldLiveId, decidedAt: "2026-01-01T00:01:00Z",
      miniRoom: { miniRoomId: liveRoomId, lobbyRoomId: "thread", sourceThreadId: threadId, participantUserIds: [owner.userId, peer.userId],
        livekitRoomName: "synthetic-history-room", startedAt: "2026-01-01T00:01:00Z" } }), "accepted")
    const oldPendingId = "synthetic_old_pending"
    await miniRoomService.repository.saveInvite({ inviteId: oldPendingId, sourceThreadId: threadId,
      senderUserId: peer.userId, recipientUserId: owner.userId, status: "pending",
      createdAt: "2026-01-02T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" })
    const historyIds: string[] = []
    for (let index = 0; index < 1_000; index += 1) {
      const inviteId = `synthetic_archived_${String(index).padStart(4, "0")}`
      historyIds.push(inviteId)
      await miniRoomService.repository.saveInvite({ inviteId, sourceThreadId: threadId,
        senderUserId: peer.userId, recipientUserId: owner.userId, status: "cancelled",
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, Math.floor(index / 3))).toISOString(),
        expiresAt: "2026-10-01T00:00:00Z", decidedAt: "2026-10-01T00:00:00Z" })
    }
    const headers = { authorization: `Bearer ${owner.sessionToken}` }
    const read = (query = "", requestHeaders = headers) => app.inject({ method: "GET", url: `/v1/threads/${threadId}/room-invites${query}`, headers: requestHeaders })
    const legacy = await read()
    const recent = await read("?limit=20")
    assert.equal(recent.statusCode, 200)
    assert.deepEqual(recent.json().invites.map((invite: { inviteId: string }) => invite.inviteId), historyIds.slice(-20))
    assert.deepEqual(recent.json().activeInvites.map((invite: { inviteId: string }) => invite.inviteId), [oldLiveId, oldPendingId])
    assert.equal(recent.json().activeInvites[0].roomSessionId, liveRoomId)
    assert.equal(recent.json().nextCursor, historyIds.at(-20))
    const earlier = await read(`?limit=20&before=${recent.json().nextCursor}`)
    assert.deepEqual(earlier.json().invites.map((invite: { inviteId: string }) => invite.inviteId), historyIds.slice(-40, -20), "cursor preserves tied timestamps without repeating rows")
    assert.equal(legacy.json().invites.length, 1_002)
    assert.equal(legacy.json().nextCursor, undefined)
    const legacyBytes = Buffer.byteLength(legacy.body)
    const pageBytes = Buffer.byteLength(recent.body)
    assert.ok(pageBytes < legacyBytes / 20)
    t.diagnostic(`Synthetic invitation history: legacy 1002 records / ${legacyBytes} JSON bytes; recent 20 + active 2 records / ${pageBytes} JSON bytes`)

    const oldTarget = await read(`?inviteId=${historyIds[0]}`)
    assert.equal(oldTarget.statusCode, 200)
    assert.equal(oldTarget.json().invites.length, 1)
    assert.equal(oldTarget.json().invites[0].status, "cancelled")
    assert.equal(oldTarget.json().nextCursor, null)
    assert.deepEqual(oldTarget.json().activeInvites, [])
    const missing = await read("?inviteId=synthetic_missing")
    assert.equal(missing.statusCode, 404)
    const unauthorized = await read(`?inviteId=${oldLiveId}`, { authorization: `Bearer ${stranger.sessionToken}` })
    assert.equal(unauthorized.statusCode, 404)
    for (const query of ["?limit=0", "?limit=51", "?limit=3.5", "?limit=Infinity", "?inviteId=synthetic_missing&limit=20", "?before=synthetic_missing&limit=20"]) {
      assert.equal((await read(query)).statusCode, 400)
    }
    const strippedUnknownQuery = await read("?limit=20&unexpected=1")
    assert.equal(strippedUnknownQuery.statusCode, 200)
    assert.deepEqual(strippedUnknownQuery.json().invites, recent.json().invites,
      "Fastify strips unknown query fields without bypassing the requested bounded page")
    assert.equal((await miniRoomService.repository.findInvite(oldPendingId))?.status, "pending", "a faster read never cancels an actionable invitation")
    const joined = await app.inject({ method: "POST", url: `/v1/room-sessions/${liveRoomId}/join`, headers, payload: {} })
    assert.equal(joined.statusCode, 200, "older active room access keeps its server permission checks")
    await miniRoomService.repository.endMiniRoom(liveRoomId, owner.userId, new Date().toISOString())
    const ended = await read(`?inviteId=${oldLiveId}`)
    assert.equal(ended.json().invites[0].status, "accepted")
    assert.equal(ended.json().invites[0].roomSessionId, undefined, "old ended rooms retain history without offering entry")
    await safetyService.repository.saveBlock({ actorUserId: peer.userId, blockedUserId: owner.userId, createdAt: new Date().toISOString() })
    for (const query of ["?limit=20", `?inviteId=${oldLiveId}`, "?limit=20&before=synthetic_missing"]) {
      assert.equal((await read(query)).statusCode, 404, "a block hides both data and cursor existence in every read mode")
    }
  } finally { await app.close() }
})

async function createEligibleAccount(
  app: ReturnType<typeof createServer>,
  authService: ReturnType<typeof createAuthService>,
  phoneNumber: string,
  displayName: string
) {
  await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber } })
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber, verificationCode: "482931" }
  })
  const sessionToken = verified.json().session.sessionToken as string
  const userId = verified.json().session.userId as string
  await authService.updateProfile(sessionToken, {
    displayName,
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(sessionToken, step)
  }
  return { sessionToken, userId }
}
