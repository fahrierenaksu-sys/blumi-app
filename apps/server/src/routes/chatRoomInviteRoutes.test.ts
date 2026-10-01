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
    const renamed = await app.inject({ method: "PATCH", url: "/v1/users/me",
      headers: { authorization: `Bearer ${recipient.sessionToken}` }, payload: { displayName: "Irmak" } })
    assert.equal(renamed.statusCode, 200)

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
    const livePartner = rejoined.json().participants.find((participant: { userId: string }) => participant.userId === recipient.userId)
    assert.equal(livePartner.displayName, "Irmak")
    assert.equal(livePartner.profileUpdatedAt, (await authService.repository.findAccountByUserId(recipient.userId))?.updatedAt)

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

    const first = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${user.sessionToken}` }
    })
    assert.equal(first.statusCode, 200)
    assert.equal(first.json().invites.length, 1)
    assert.equal(first.json().invites[0].senderUserId, persona.userId)
    assert.equal(first.json().invites[0].recipientUserId, user.userId)

    const repeated = await app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/room-invites`,
      headers: { authorization: `Bearer ${user.sessionToken}` }
    })
    assert.equal(repeated.statusCode, 200)
    assert.equal(repeated.json().invites.length, 1)
    assert.equal(repeated.json().invites[0].inviteId, first.json().invites[0].inviteId)
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
