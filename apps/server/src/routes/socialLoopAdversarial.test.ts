import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore,
  createSeedDiscoverProfiles
} from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createPresenceService } from "../presence/presenceService"
import { createConnectionManager } from "../realtime/connectionManager"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

// Adversarial coverage for the social loop: mutual match -> chat -> room
// invite -> shared room, plus block/report. Each app instance stays below the
// global 100 requests/minute limit so the attacks reach the route logic.

type Harness = ReturnType<typeof createHarness>

function createHarness(seedProfiles: Parameters<typeof createInMemoryMatchStore>[0] = []) {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const safetyService = createSafetyService()
  const chatService = createChatService({ blockPolicy: safetyService })
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore(seedProfiles))
  })
  let nextId = 0
  const miniRoomService = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService(),
    idFactory: () => `adv_${++nextId}`
  })
  const connectionService = createConnectionService({ miniRoomService, safetyService })
  const connectionManager = createConnectionManager()
  const events: Array<{ userIds: readonly string[]; event: ServerEvent }> = []
  const sendToUsers = connectionManager.sendToUsers.bind(connectionManager)
  const sendToUser = connectionManager.sendToUser.bind(connectionManager)
  const sendToUsersDurably = connectionManager.sendToUsersDurably.bind(connectionManager)
  connectionManager.sendToUsers = (userIds, event) => {
    events.push({ userIds: [...userIds], event })
    sendToUsers(userIds, event)
  }
  connectionManager.sendToUser = (userId, event) => {
    events.push({ userIds: [userId], event })
    sendToUser(userId, event)
  }
  connectionManager.sendToUsersDurably = async (userIds, event) => {
    events.push({ userIds: [...userIds], event })
    await sendToUsersDurably(userIds, event)
  }
  const app = createServer({
    authService,
    chatService,
    safetyService,
    matchService,
    miniRoomService,
    connectionService,
    connectionManager
  })
  return {
    app,
    authService,
    chatService,
    safetyService,
    matchService,
    miniRoomService,
    connectionService,
    events,
    eventsOfType(type: ServerEvent["type"]) {
      return events.filter((entry) => entry.event.type === type)
    }
  }
}

async function createEligibleAccount(
  harness: Harness,
  phoneNumber: string,
  displayName: string
) {
  await harness.app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber } })
  const verified = await harness.app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: {
      termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber,
      verificationCode: "482931"
    }
  })
  const sessionToken = verified.json().session.sessionToken as string
  const userId = verified.json().session.userId as string
  await harness.authService.updateProfile(sessionToken, {
    displayName,
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await harness.authService.completeOnboardingStep(sessionToken, step)
  }
  return {
    userId,
    sessionToken,
    headers: { authorization: `Bearer ${sessionToken}` }
  }
}

async function createMatchedPair(harness: Harness, prefix: string) {
  const ada = await createEligibleAccount(harness, `+90555${prefix}01`, "Ada")
  const bora = await createEligibleAccount(harness, `+90555${prefix}02`, "Bora")
  const stranger = await createEligibleAccount(harness, `+90555${prefix}03`, "Cem")
  await harness.matchService.repository.createMatch({
    matchId: `match_${prefix}`,
    participantUserIds: [ada.userId, bora.userId],
    matchedAt: "2026-09-30T08:00:00.000Z"
  })
  const opened = await harness.app.inject({
    method: "POST",
    url: "/v1/threads",
    headers: ada.headers,
    payload: { participantUserIds: [ada.userId, bora.userId] }
  })
  assert.equal(opened.statusCode, 201)
  const threadId = opened.json().thread.threadId as string
  return { ada, bora, stranger, threadId }
}

async function settle(): Promise<void> {
  // Delivery fan-out runs after the send ACK; let queued microtasks and
  // timers drain before counting realtime events.
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

test("chat routes refuse outsiders, forged fields and malformed bodies without persisting anything", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, stranger, threadId } = await createMatchedPair(harness, "40001")

    const outsiderSend = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: stranger.headers,
      payload: { body: "hello from outside" }
    })
    assert.equal(outsiderSend.statusCode, 404)
    const outsiderRead = await harness.app.inject({
      method: "GET", url: `/v1/threads/${threadId}/messages`, headers: stranger.headers
    })
    assert.equal(outsiderRead.statusCode, 404)
    const outsiderReceipt = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/read`, headers: stranger.headers, payload: {}
    })
    assert.equal(outsiderReceipt.statusCode, 404)
    const outsiderInvites = await harness.app.inject({
      method: "GET", url: `/v1/threads/${threadId}/room-invites`, headers: stranger.headers
    })
    // A thread the caller cannot see answers 404 on every thread route (also
    // when a block hides it), so invites match messages and read receipts.
    assert.equal(outsiderInvites.statusCode, 404)
    const outsiderInvite = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: stranger.headers, payload: {}
    })
    assert.equal(outsiderInvite.statusCode, 404)
    const outsiderThread = await harness.app.inject({
      method: "POST", url: "/v1/threads", headers: stranger.headers,
      payload: { participantUserIds: [ada.userId, bora.userId] }
    })
    assert.equal(outsiderThread.statusCode, 400)
    const selfThread = await harness.app.inject({
      method: "POST", url: "/v1/threads", headers: ada.headers,
      payload: { participantUserIds: [ada.userId, ada.userId] }
    })
    assert.equal(selfThread.statusCode, 400)

    const objectBody = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: { text: "hi" } }
    })
    assert.equal(objectBody.statusCode, 400)
    for (const body of ["", "   ", "\n\t  \n", "x".repeat(501)]) {
      const invalid = await harness.app.inject({
        method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
        payload: { body }
      })
      assert.equal(invalid.statusCode, 400)
    }
    const invalidRetryId = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: "hi", clientMessageId: "short" }
    })
    assert.equal(invalidRetryId.statusCode, 400)
    assert.equal((await harness.chatService.listMessages(ada.userId, threadId)).length, 0)

    const maxLength = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: "y".repeat(500) }
    })
    assert.equal(maxLength.statusCode, 201)
    assert.equal(maxLength.json().message.senderUserId, ada.userId)

    // Fastify strips unknown body fields (Ajv removeAdditional); a forged
    // sender never reaches the service, which always uses the session user.
    const forgedSender = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: "spoofed", senderUserId: bora.userId, threadId: "thread_other", messageId: "message_forged" }
    })
    assert.equal(forgedSender.statusCode, 201)
    assert.equal(forgedSender.json().message.senderUserId, ada.userId)
    assert.equal(forgedSender.json().message.threadId, threadId)
    assert.notEqual(forgedSender.json().message.messageId, "message_forged")
    // Ajv coerces scalar types (coerceTypes): the service only ever sees a string.
    for (const body of [123, null, ["coerced"]]) {
      const coerced = await harness.app.inject({
        method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
        payload: { body }
      })
      assert.ok(coerced.statusCode === 201 || coerced.statusCode === 400, `body ${JSON.stringify(body)} -> ${coerced.statusCode}`)
      if (coerced.statusCode === 201) assert.equal(typeof coerced.json().message.body, "string")
    }

    const forgedCursor = await harness.app.inject({
      method: "GET",
      url: `/v1/threads/${threadId}/messages?before=message_from_another_thread&limit=1000`,
      headers: bora.headers
    })
    // An unknown cursor falls back to the newest page of this thread only.
    assert.equal(forgedCursor.statusCode, 200)
    const cursorPage = forgedCursor.json().messages as Array<{ threadId: string }>
    assert.ok(cursorPage.length > 0 && cursorPage.every((message) => message.threadId === threadId))
    // An injected userId query parameter is stripped; the session user decides access.
    const extraQuery = await harness.app.inject({
      method: "GET", url: `/v1/threads/${threadId}/messages?userId=${bora.userId}`, headers: stranger.headers
    })
    assert.equal(extraQuery.statusCode, 404)
  } finally {
    await harness.app.close()
  }
})

test("message bodies and report notes carrying control characters are rejected before persistence", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, threadId } = await createMatchedPair(harness, "40002")
    for (const body of ["hi\u0000there", "\u0000", "bell\u0007", "esc\u001b[31m"]) {
      const response = await harness.app.inject({
        method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
        payload: { body }
      })
      assert.equal(response.statusCode, 400, `control characters in ${JSON.stringify(body)} must be rejected`)
    }
    assert.equal((await harness.chatService.listMessages(ada.userId, threadId)).length, 0)
    const report = await harness.app.inject({
      method: "POST", url: "/v1/safety/reports", headers: ada.headers,
      payload: { reportedUserId: bora.userId, reason: "harassment", note: "see\u0000this" }
    })
    assert.equal(report.statusCode, 400)
    assert.equal((await harness.safetyService.listReportsForActor(ada.userId)).length, 0)
    // Ordinary multi-line text still normalizes to one line.
    const multiLine = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: "line one\r\nline two\ttab" }
    })
    assert.equal(multiLine.statusCode, 201)
    assert.equal(multiLine.json().message.body, "line one line two tab")
  } finally {
    await harness.app.close()
  }
})

test("twenty concurrent sends with one client message id persist and deliver exactly one message", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, threadId } = await createMatchedPair(harness, "40003")
    const responses = await Promise.all(Array.from({ length: 20 }, () =>
      harness.app.inject({
        method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
        payload: { body: "same tap", clientMessageId: "client-concurrent-0001" }
      })
    ))
    assert.deepEqual(
      responses.map((response) => response.statusCode).sort(),
      [...Array.from({ length: 19 }, () => 200), 201]
    )
    const messageIds = new Set(responses.map((response) => response.json().message.messageId))
    assert.equal(messageIds.size, 1)
    assert.equal((await harness.chatService.listMessages(bora.userId, threadId)).length, 1)
    await settle()
    assert.equal(harness.eventsOfType("chat.message_received").length, 1)

    const conflicting = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: "different text", clientMessageId: "client-concurrent-0001" }
    })
    assert.equal(conflicting.statusCode, 409)
    // The same client id is scoped per sender: the partner's own id is independent.
    const partnerSameId = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: bora.headers,
      payload: { body: "partner text", clientMessageId: "client-concurrent-0001" }
    })
    assert.equal(partnerSameId.statusCode, 201)
    assert.equal(partnerSameId.json().message.senderUserId, bora.userId)
    assert.equal((await harness.chatService.listMessages(bora.userId, threadId)).length, 2)
  } finally {
    await harness.app.close()
  }
})

test("concurrent thread opens from both sides persist one thread and a read receipt stays private", async () => {
  const harness = createHarness()
  try {
    const ada = await createEligibleAccount(harness, "+905554000401", "Ada")
    const bora = await createEligibleAccount(harness, "+905554000402", "Bora")
    await harness.matchService.repository.createMatch({
      matchId: "match_open_race",
      participantUserIds: [ada.userId, bora.userId],
      matchedAt: "2026-09-30T08:00:00.000Z"
    })
    const opens = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      harness.app.inject({
        method: "POST", url: "/v1/threads", headers: index % 2 ? bora.headers : ada.headers,
        payload: { participantUserIds: index % 2 ? [bora.userId, ada.userId] : [ada.userId, bora.userId] }
      })
    ))
    assert.ok(opens.every((response) => response.statusCode === 200 || response.statusCode === 201))
    assert.deepEqual(new Set(opens.map((response) => response.json().thread.threadId)), new Set(["thread_match_match_open_race"]))
    assert.equal((await harness.chatService.listThreads(ada.userId)).length, 1)

    const receipt = await harness.app.inject({
      method: "POST", url: "/v1/threads/thread_match_match_open_race/read", headers: ada.headers, payload: {}
    })
    assert.equal(receipt.statusCode, 200)
    const readEvents = harness.eventsOfType("chat.thread_read")
    assert.equal(readEvents.length, 1)
    assert.deepEqual(readEvents[0]!.userIds, [ada.userId])
  } finally {
    await harness.app.close()
  }
})

test("room invite decisions are recipient-only and yield one outcome under concurrent accept and decline", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, stranger, threadId } = await createMatchedPair(harness, "40005")
    const created = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: ada.headers, payload: {}
    })
    assert.equal(created.statusCode, 201)
    const inviteId = created.json().invite.inviteId as string

    const duplicateFromPartner = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: bora.headers, payload: {}
    })
    assert.equal(duplicateFromPartner.statusCode, 200)
    assert.equal(duplicateFromPartner.json().invite.inviteId, inviteId)

    const inviterAccepts = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${inviteId}/decision`, headers: ada.headers,
      payload: { status: "accepted" }
    })
    assert.equal(inviterAccepts.statusCode, 403)
    const strangerAccepts = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${inviteId}/decision`, headers: stranger.headers,
      payload: { status: "accepted" }
    })
    // The stranger is not in the invite's thread: 404, like the thread itself.
    assert.equal(strangerAccepts.statusCode, 404)
    const strangerCancels = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${inviteId}/cancel`, headers: stranger.headers, payload: {}
    })
    assert.equal(strangerCancels.statusCode, 403)
    const recipientCancels = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${inviteId}/cancel`, headers: bora.headers, payload: {}
    })
    assert.equal(recipientCancels.statusCode, 403)
    for (const payload of [{ status: "cancelled" }, { status: "ACCEPTED" }, { status: 1 }, {}]) {
      const invalid = await harness.app.inject({
        method: "POST", url: `/v1/room-invites/${inviteId}/decision`, headers: bora.headers, payload
      })
      assert.equal(invalid.statusCode, 400, `decision payload ${JSON.stringify(payload)} must be rejected`)
    }
    assert.equal((await harness.miniRoomService.repository.findInvite(inviteId))?.status, "pending")

    const decisions = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      harness.app.inject({
        method: "POST", url: `/v1/room-invites/${inviteId}/decision`, headers: bora.headers,
        payload: { status: index % 2 ? "declined" : "accepted" }
      })
    ))
    const finalInvite = await harness.miniRoomService.repository.findInvite(inviteId)
    assert.ok(finalInvite?.status === "accepted" || finalInvite?.status === "declined")
    const activeRoom = await harness.miniRoomService.findActiveMiniRoomForUser(bora.userId)
    if (finalInvite?.status === "accepted") {
      assert.ok(activeRoom)
      const roomIds = new Set(decisions
        .filter((response) => response.statusCode === 200)
        .map((response) => response.json().miniRoom?.miniRoomId))
      assert.deepEqual(roomIds, new Set([activeRoom.miniRoomId]))
      assert.ok(decisions.every((response) => response.statusCode === 200 || response.statusCode === 409))
      assert.equal(harness.eventsOfType("mini_room.ready")
        .filter((entry) => entry.userIds[0] === ada.userId).length >= 1, true)
    } else {
      assert.equal(activeRoom, null)
      assert.ok(decisions.every((response) =>
        response.statusCode === 409 || response.json().invite?.status === "declined"))
    }
  } finally {
    await harness.app.close()
  }
})

test("accepting and joining a room read each participant's account once", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, threadId } = await createMatchedPair(harness, "40013")
    const invite = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: ada.headers, payload: {}
    })
    assert.equal(invite.statusCode, 201)
    const accountReads: string[] = []
    const repository = harness.authService.repository
    const findAccountByUserId = repository.findAccountByUserId.bind(repository)
    repository.findAccountByUserId = async (userId) => {
      accountReads.push(userId)
      return findAccountByUserId(userId)
    }

    const accepted = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${invite.json().invite.inviteId}/decision`, headers: bora.headers,
      payload: { status: "accepted" }
    })
    assert.equal(accepted.statusCode, 200)
    assert.deepEqual(accepted.json().participants.map((participant: { displayName: string }) => participant.displayName),
      ["Ada", "Bora"])
    // The caller's account comes with the session; the partner's is read
    // once (with its moderation state). It used to be read six times in a row.
    assert.ok(accountReads.length <= 2, `decision read accounts ${accountReads.length} times`)
    assert.ok(accountReads.every((userId) => userId === ada.userId))

    accountReads.length = 0
    const roomId = accepted.json().miniRoom.miniRoomId as string
    const joined = await harness.app.inject({
      method: "POST", url: `/v1/room-sessions/${roomId}/join`, headers: ada.headers, payload: {}
    })
    assert.equal(joined.statusCode, 200)
    assert.deepEqual(joined.json().participants.map((participant: { userId: string }) => participant.userId),
      [ada.userId, bora.userId])
    assert.ok(accountReads.length <= 2, `join read accounts ${accountReads.length} times`)
    assert.ok(accountReads.every((userId) => userId === bora.userId))
  } finally {
    await harness.app.close()
  }
})

test("an expired room invite cannot be accepted and never opens a room", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, threadId } = await createMatchedPair(harness, "40006")
    const created = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: ada.headers, payload: {}
    })
    assert.equal(created.statusCode, 201)
    const invite = created.json().invite
    await harness.miniRoomService.repository.saveInvite({
      ...invite,
      expiresAt: new Date(Date.now() - 1000).toISOString()
    })
    const accepted = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${invite.inviteId}/decision`, headers: bora.headers,
      payload: { status: "accepted" }
    })
    assert.equal(accepted.statusCode, 410)
    assert.equal(await harness.miniRoomService.findActiveMiniRoomForUser(bora.userId), null)
    assert.equal((await harness.miniRoomService.repository.findInvite(invite.inviteId))?.status, "expired")
  } finally {
    await harness.app.close()
  }
})

test("a block stops the pair on every social-loop route, including room connection decisions", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, stranger, threadId } = await createMatchedPair(harness, "40007")
    const invite = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: ada.headers, payload: {}
    })
    const accepted = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${invite.json().invite.inviteId}/decision`, headers: bora.headers,
      payload: { status: "accepted" }
    })
    assert.equal(accepted.statusCode, 200)
    const roomId = accepted.json().miniRoom.miniRoomId as string
    // IDOR: a third account cannot join, close, or decide on the pair's room.
    for (const route of ["join", "leave"]) {
      const foreign = await harness.app.inject({
        method: "POST", url: `/v1/room-sessions/${roomId}/${route}`, headers: stranger.headers, payload: {}
      })
      assert.equal(foreign.statusCode, 404)
    }
    const foreignDecision = await harness.app.inject({
      method: "POST", url: "/v1/connections/decision", headers: stranger.headers,
      payload: { miniRoomId: roomId, partnerUserId: ada.userId, status: "saved" }
    })
    assert.equal(foreignDecision.statusCode, 409)
    const foreignActiveLeave = await harness.app.inject({
      method: "POST", url: "/v1/users/me/active-room/leave", headers: stranger.headers,
      payload: { expectedRoomSessionId: roomId }
    })
    assert.equal(foreignActiveLeave.json().ended, false)
    assert.ok(await harness.miniRoomService.findActiveMiniRoomForUser(ada.userId))
    const adaSaves = await harness.app.inject({
      method: "POST", url: "/v1/connections/decision", headers: ada.headers,
      payload: { miniRoomId: roomId, partnerUserId: bora.userId, status: "saved" }
    })
    assert.equal(adaSaves.statusCode, 200)
    assert.equal(adaSaves.json().match, null)
    const left = await harness.app.inject({
      method: "POST", url: `/v1/room-sessions/${roomId}/leave`, headers: ada.headers, payload: {}
    })
    assert.equal(left.json().ended, true)
    const pending = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: ada.headers, payload: {}
    })
    assert.equal(pending.statusCode, 201)
    const pendingInviteId = pending.json().invite.inviteId as string

    const blocked = await harness.app.inject({
      method: "POST", url: "/v1/safety/blocks", headers: ada.headers, payload: { blockedUserId: bora.userId }
    })
    assert.equal(blocked.statusCode, 201)
    const eventCountAtBlock = harness.events.length

    for (const actor of [ada, bora]) {
      const send = await harness.app.inject({
        method: "POST", url: `/v1/threads/${threadId}/messages`, headers: actor.headers,
        payload: { body: "still there?" }
      })
      // The block hides the thread from both users: 404, not a block-revealing 403.
      assert.equal(send.statusCode, 404)
      const inviteAgain = await harness.app.inject({
        method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: actor.headers, payload: {}
      })
      assert.equal(inviteAgain.statusCode, 404)
      const join = await harness.app.inject({
        method: "POST", url: `/v1/room-sessions/${roomId}/join`, headers: actor.headers, payload: {}
      })
      assert.notEqual(join.statusCode, 200)
      const reopen = await harness.app.inject({
        method: "POST", url: "/v1/threads", headers: actor.headers,
        payload: { participantUserIds: [ada.userId, bora.userId] }
      })
      assert.equal(reopen.statusCode, 403)
    }
    // The block cancelled the pending invite (pair separation), and the hidden
    // thread answers a later accept with 404 before any invite state is read.
    assert.equal((await harness.miniRoomService.repository.findInvite(pendingInviteId))?.status, "cancelled")
    const acceptAfterBlock = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${pendingInviteId}/decision`, headers: bora.headers,
      payload: { status: "accepted" }
    })
    assert.equal(acceptAfterBlock.statusCode, 404)
    assert.equal(await harness.miniRoomService.findActiveMiniRoomForUser(bora.userId), null)

    // The blocked partner completes the room's "save" handshake after the block.
    const boraSaves = await harness.app.inject({
      method: "POST", url: "/v1/connections/decision", headers: bora.headers,
      payload: { miniRoomId: roomId, partnerUserId: ada.userId, status: "saved" }
    })
    assert.equal(boraSaves.statusCode, 409)
    assert.equal(await harness.connectionService.repository.findMatch(roomId), null)
    assert.equal(harness.eventsOfType("connection.matched").length, 0)
    assert.equal(harness.events.slice(eventCountAtBlock)
      .filter((entry) => entry.userIds.includes(ada.userId) && entry.event.type !== "chat.room_invite_updated").length, 0)
    // Read from storage: the service now hides the blocked pair's thread.
    assert.equal((await harness.chatService.repository.listMessages(threadId)).length, 0)
  } finally {
    await harness.app.close()
  }
})

test("a block or report over HTTP reaches the blocker's other devices, never the blocked person", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, stranger } = await createMatchedPair(harness, "40012")
    const blockedEvents = () => harness.eventsOfType("safety.user_blocked")
      .map((entry) => ({ userIds: entry.userIds, payload: entry.event.payload }))

    const blocked = await harness.app.inject({
      method: "POST", url: "/v1/safety/blocks", headers: ada.headers, payload: { blockedUserId: bora.userId }
    })
    assert.equal(blocked.statusCode, 201)
    // Same confirmation the realtime safety.block handler sends: the blocker's
    // other phone drops the chat at once instead of on its next refresh.
    assert.deepEqual(blockedEvents(), [{ userIds: [ada.userId], payload: { blockedUserId: bora.userId } }])

    const reported = await harness.app.inject({
      method: "POST", url: "/v1/safety/reports", headers: stranger.headers,
      payload: { reportedUserId: bora.userId, reason: "harassment" }
    })
    assert.equal(reported.statusCode, 201)
    assert.deepEqual(blockedEvents().at(-1), { userIds: [stranger.userId], payload: { blockedUserId: bora.userId } })
    assert.ok(blockedEvents().every((entry) => !entry.userIds.includes(bora.userId)))
  } finally {
    await harness.app.close()
  }
})

test("reports refuse self-reports and forged fields, and replay one report per idempotency key under concurrency", async () => {
  const harness = createHarness()
  try {
    const ada = await createEligibleAccount(harness, "+905554000801", "Ada")
    const bora = await createEligibleAccount(harness, "+905554000802", "Bora")
    const self = await harness.app.inject({
      method: "POST", url: "/v1/safety/reports", headers: ada.headers,
      payload: { reportedUserId: ada.userId, reason: "harassment" }
    })
    assert.equal(self.statusCode, 400)
    const selfBlock = await harness.app.inject({
      method: "POST", url: "/v1/safety/blocks", headers: ada.headers, payload: { blockedUserId: ada.userId }
    })
    assert.equal(selfBlock.statusCode, 400)
    for (const payload of [
      { reportedUserId: bora.userId, reason: "not-a-reason" },
      { reportedUserId: bora.userId, reason: "harassment", note: { text: "x" } },
      { reportedUserId: bora.userId, reason: "harassment", note: "n".repeat(1001) },
      { reportedUserId: "   ", reason: "harassment" }
    ]) {
      const invalid = await harness.app.inject({
        method: "POST", url: "/v1/safety/reports", headers: ada.headers, payload
      })
      assert.equal(invalid.statusCode, 400, `report payload ${JSON.stringify(payload).slice(0, 80)} must be rejected`)
    }
    const concurrent = await Promise.all(Array.from({ length: 10 }, () =>
      harness.app.inject({
        method: "POST", url: "/v1/safety/reports",
        headers: { ...ada.headers, "idempotency-key": "report-key-00000001" },
        payload: { reportedUserId: bora.userId, reason: "harassment", note: "same" }
      })
    ))
    assert.deepEqual(concurrent.map((response) => response.statusCode).sort(), [200, 200, 200, 200, 200, 200, 200, 200, 200, 201])
    assert.equal(new Set(concurrent.map((response) => response.json().report.reportId)).size, 1)
    assert.equal((await harness.safetyService.listReportsForActor(ada.userId)).length, 1)
    assert.equal(await harness.safetyService.hasBlockBetween(ada.userId, bora.userId), true)
    const reusedKey = await harness.app.inject({
      method: "POST", url: "/v1/safety/reports",
      headers: { ...ada.headers, "idempotency-key": "report-key-00000001" },
      payload: { reportedUserId: bora.userId, reason: "spam" }
    })
    assert.equal(reusedKey.statusCode, 409)
    // The reported user cannot read the reporter's report status list.
    const foreignReports = await harness.app.inject({
      method: "GET", url: "/v1/safety/reports", headers: bora.headers
    })
    assert.equal(foreignReports.statusCode, 200)
    assert.deepEqual(foreignReports.json().reports, [])
    // Unblocking someone else's block is scoped to the actor and changes nothing.
    const foreignUnblock = await harness.app.inject({
      method: "DELETE", url: `/v1/safety/blocks/${ada.userId}`, headers: bora.headers
    })
    assert.equal(foreignUnblock.statusCode, 204)
    assert.equal(await harness.safetyService.hasBlockBetween(ada.userId, bora.userId), true)
  } finally {
    await harness.app.close()
  }
})

test("discovery decisions refuse self and unknown targets and spend quota once for twenty concurrent likes", async () => {
  const harness = createHarness([{
    ...createSeedDiscoverProfiles()[0]!,
    userId: "seed_target"
  }])
  try {
    const ada = await createEligibleAccount(harness, "+905554000901", "Ada")
    const self = await harness.app.inject({
      method: "POST", url: `/v1/discover/${ada.userId}/like`, headers: ada.headers, payload: {}
    })
    assert.equal(self.statusCode, 409)
    const unknown = await harness.app.inject({
      method: "POST", url: "/v1/discover/does_not_exist/like", headers: ada.headers, payload: {}
    })
    assert.equal(unknown.statusCode, 409)
    const likes = await Promise.all(Array.from({ length: 20 }, () =>
      harness.app.inject({
        method: "POST", url: "/v1/discover/seed_target/like", headers: ada.headers, payload: {}
      })
    ))
    assert.ok(likes.every((response) => response.statusCode === 200), likes.map((r) => r.statusCode).join(","))
    const quota = await harness.matchService.getDecisionQuota(ada.userId)
    assert.equal(quota.used, 1)
    const blockedTarget = await harness.app.inject({
      method: "POST", url: "/v1/safety/blocks", headers: ada.headers, payload: { blockedUserId: "seed_target" }
    })
    assert.equal(blockedTarget.statusCode, 201)
    const likeBlocked = await harness.app.inject({
      method: "POST", url: "/v1/discover/seed_target/pass", headers: ada.headers, payload: {}
    })
    assert.equal(likeBlocked.statusCode, 400)
    assert.equal((await harness.matchService.getDecisionQuota(ada.userId)).used, 1)
  } finally {
    await harness.app.close()
  }
})

// Owner decision (2026-09-30): while a block exists in either direction the
// pair's thread is hidden from both users; removing the block restores it with
// its history. Hidden answers match a thread the caller is not in (404).
async function visibleThreadState(harness: Harness, actor: { headers: Record<string, string> }, threadId: string) {
  const listed = await harness.app.inject({ method: "GET", url: "/v1/threads", headers: actor.headers })
  const synced = await harness.app.inject({ method: "POST", url: "/v1/threads/sync-matches", headers: actor.headers })
  const history = await harness.app.inject({
    method: "GET", url: `/v1/threads/${threadId}/messages`, headers: actor.headers
  })
  return {
    listed: listed.json().threads.map((thread: { threadId: string }) => thread.threadId),
    synced: synced.json().threads.map((thread: { threadId: string }) => thread.threadId),
    historyStatus: history.statusCode,
    history: history.statusCode === 200
      ? history.json().messages.map((message: { body: string }) => message.body)
      : []
  }
}

test("a block hides the pair's conversation, name and history from both users on every thread route", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, stranger, threadId } = await createMatchedPair(harness, "40010")
    const sent = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: "before the block" }
    })
    assert.equal(sent.statusCode, 201)
    const pending = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: bora.headers, payload: {}
    })
    assert.equal(pending.statusCode, 201)
    const blocked = await harness.app.inject({
      method: "POST", url: "/v1/safety/blocks", headers: ada.headers, payload: { blockedUserId: bora.userId }
    })
    assert.equal(blocked.statusCode, 201)
    const eventCountAtBlock = harness.events.length

    for (const actor of [bora, ada]) {
      assert.deepEqual(await visibleThreadState(harness, actor, threadId),
        { listed: [], synced: [], historyStatus: 404, history: [] })
      // The realtime `chat.list_threads` / `chat.list_messages` handlers use the same service.
      assert.deepEqual((await harness.chatService.listThreadsPage(actor.userId)).threads, [])
      await assert.rejects(harness.chatService.listMessages(actor.userId, threadId), /not available/)
      const hidden = await Promise.all([
        harness.app.inject({ method: "POST", url: `/v1/threads/${threadId}/messages`, headers: actor.headers,
          payload: { body: "after the block" } }),
        harness.app.inject({ method: "POST", url: `/v1/threads/${threadId}/read`, headers: actor.headers, payload: {} }),
        harness.app.inject({ method: "GET", url: `/v1/threads/${threadId}/room-invites`, headers: actor.headers }),
        harness.app.inject({ method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: actor.headers, payload: {} })
      ])
      assert.deepEqual(hidden.map((response) => response.statusCode), [404, 404, 404, 404])
      // Same body as for a thread the caller is not in.
      const outsider = await harness.app.inject({
        method: "GET", url: `/v1/threads/${threadId}/messages`, headers: stranger.headers
      })
      assert.equal(outsider.statusCode, 404)
      assert.deepEqual(hidden[0]!.json(), outsider.json())
    }
    const decision = await harness.app.inject({
      method: "POST", url: `/v1/room-invites/${pending.json().invite.inviteId}/decision`, headers: ada.headers,
      payload: { status: "accepted" }
    })
    assert.equal(decision.statusCode, 404)
    // Creation between the blocked pair stays refused (unchanged 403).
    const reopen = await harness.app.inject({
      method: "POST", url: "/v1/threads", headers: bora.headers,
      payload: { participantUserIds: [ada.userId, bora.userId] }
    })
    assert.equal(reopen.statusCode, 403)
    await settle()
    assert.deepEqual(harness.events.slice(eventCountAtBlock)
      .filter((entry) => entry.event.type !== "chat.room_invite_updated")
      .map((entry) => entry.event.type), [])
    // Nothing was deleted: the history is still stored.
    assert.deepEqual((await harness.chatService.repository.listMessages(threadId)).map((message) => message.body),
      ["before the block"])
  } finally {
    await harness.app.close()
  }
})

test("removing a block restores the hidden thread with its history for both users", async () => {
  const harness = createHarness()
  try {
    const { ada, bora, threadId } = await createMatchedPair(harness, "40011")
    const sent = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: ada.headers,
      payload: { body: "kept through the block" }
    })
    assert.equal(sent.statusCode, 201)
    // The blocked side blocks back, so both directions must be removed.
    for (const [actor, target] of [[bora, ada], [ada, bora]] as const) {
      const blocked = await harness.app.inject({
        method: "POST", url: "/v1/safety/blocks", headers: actor.headers, payload: { blockedUserId: target.userId }
      })
      assert.equal(blocked.statusCode, 201)
    }
    const unblockBora = await harness.app.inject({
      method: "DELETE", url: `/v1/safety/blocks/${ada.userId}`, headers: bora.headers
    })
    assert.equal(unblockBora.statusCode, 204)
    assert.deepEqual((await visibleThreadState(harness, ada, threadId)).listed, [],
      "still hidden while ada's block remains")
    const unblockAda = await harness.app.inject({
      method: "DELETE", url: `/v1/safety/blocks/${bora.userId}`, headers: ada.headers
    })
    assert.equal(unblockAda.statusCode, 204)

    for (const actor of [ada, bora]) {
      assert.deepEqual(await visibleThreadState(harness, actor, threadId), {
        listed: [threadId], synced: [threadId], historyStatus: 200, history: ["kept through the block"]
      })
    }
    const listed = await harness.app.inject({ method: "GET", url: "/v1/threads", headers: bora.headers })
    assert.deepEqual(listed.json().threads[0].participants.map((participant: { displayName: string }) => participant.displayName).sort(),
      ["Ada", "Bora"])
    const reply = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/messages`, headers: bora.headers,
      payload: { body: "hello again" }
    })
    assert.equal(reply.statusCode, 201)
    const read = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/read`, headers: ada.headers, payload: {}
    })
    assert.equal(read.statusCode, 200)
    const invite = await harness.app.inject({
      method: "POST", url: `/v1/threads/${threadId}/room-invites`, headers: ada.headers, payload: {}
    })
    assert.equal(invite.statusCode, 201)
  } finally {
    await harness.app.close()
  }
})
