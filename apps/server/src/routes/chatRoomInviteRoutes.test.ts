import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore
} from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createNotificationService } from "../notifications/notificationService"
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
  const app = createServer({
    authService,
    chatService,
    safetyService,
    matchService,
    miniRoomService,
    notificationService,
    connectionManager: createConnectionManager()
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
      data: { type: "chat.room_invite", threadId, inviteId }
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
