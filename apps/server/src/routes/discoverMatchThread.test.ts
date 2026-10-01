import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore,
  createSeedDiscoverProfiles
} from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import { createAfterResponseTasks } from "../operations/afterResponseTasks"
import { createConnectionManager } from "../realtime/connectionManager"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

// A Discover match must reach both people while they are online: the pair's
// chat opens with the match and `chat.thread_created` goes to both, instead of
// waiting until one of them opens the chat or restarts the app.

function createHarness() {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const safetyService = createSafetyService()
  const chatService = createChatService({ blockPolicy: safetyService })
  const store = createInMemoryMatchStore([])
  const afterResponseTasks = createAfterResponseTasks()
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(store),
    deferSideEffects: (work) => afterResponseTasks.run("match-side-effects", work)
  })
  const connectionManager = createConnectionManager()
  const events: Array<{ userIds: string[]; event: ServerEvent }> = []
  const sendToUsers = connectionManager.sendToUsers.bind(connectionManager)
  connectionManager.sendToUsers = (userIds, event) => {
    events.push({ userIds: [...userIds].sort(), event })
    sendToUsers(userIds, event)
  }
  const app = createServer({ authService, chatService, safetyService, matchService, connectionManager, afterResponseTasks })
  return { app, authService, chatService, safetyService, matchService, store, events, afterResponseTasks }
}

type Harness = ReturnType<typeof createHarness>

async function createDiscoverableAccount(harness: Harness, phoneNumber: string, displayName: string) {
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
  harness.store.discoverProfiles.set(userId, {
    ...createSeedDiscoverProfiles()[0]!,
    userId,
    displayName
  })
  return { userId, headers: { authorization: `Bearer ${sessionToken}` } }
}

/** The response no longer waits for the announcement; settle it before asserting. */
async function like(harness: Harness, actor: { headers: Record<string, string> }, targetUserId: string) {
  const response = await harness.app.inject({
    method: "POST", url: `/v1/discover/${targetUserId}/like`, headers: actor.headers, payload: {}
  })
  await harness.afterResponseTasks.drain()
  return response
}

function matchedEvents(harness: Harness) {
  return harness.events.filter((entry) => entry.event.type === "connection.matched")
}

function threadCreatedEvents(harness: Harness) {
  return harness.events.filter((entry) => entry.event.type === "chat.thread_created")
}

test("a mutual Discover like opens the pair's chat and announces it to both people once", async () => {
  const harness = createHarness()
  try {
    const ada = await createDiscoverableAccount(harness, "+905556100001", "Ada")
    const bora = await createDiscoverableAccount(harness, "+905556100002", "Bora")

    const first = await like(harness, bora, ada.userId)
    assert.equal(first.statusCode, 200)
    assert.equal(first.json().matched, false)
    assert.deepEqual(threadCreatedEvents(harness), [], "a one-sided like opens nothing")

    const second = await like(harness, ada, bora.userId)
    assert.equal(second.statusCode, 200)
    assert.equal(second.json().matched, true)
    const matchId = second.json().match.matchId as string
    const expectedThreadId = `thread_match_${matchId}`

    const announced = threadCreatedEvents(harness)
    assert.equal(announced.length, 1)
    assert.deepEqual(announced[0]!.userIds, [ada.userId, bora.userId].sort())
    const thread = (announced[0]!.event as Extract<ServerEvent, { type: "chat.thread_created" }>).payload
    assert.equal(thread.threadId, expectedThreadId)
    assert.equal(thread.miniRoomId, `match_${matchId}`)
    assert.deepEqual(
      thread.participants.map((participant) => participant.displayName).sort(),
      ["Ada", "Bora"]
    )
    assert.ok(await harness.chatService.repository.findThread(expectedThreadId))
    assert.equal(second.json().matchCreated, undefined, "the creator flag stays server-side")

    // The partner learns of the match on any screen: one connection.matched
    // to both people, keyed like the chat (`match_<matchId>`), after the chat.
    const matched = matchedEvents(harness)
    assert.equal(matched.length, 1)
    assert.deepEqual(matched[0]!.userIds, [ada.userId, bora.userId].sort())
    assert.deepEqual((matched[0]!.event as Extract<ServerEvent, { type: "connection.matched" }>).payload, {
      miniRoomId: `match_${matchId}`,
      participantUserIds: [ada.userId, bora.userId].sort(),
      matchedAt: second.json().match.matchedAt
    })
    assert.ok(harness.events.indexOf(announced[0]!) < harness.events.indexOf(matched[0]!),
      "the chat (with names and avatars) reaches the phone before the match moment")

    // Opening the chat later reuses the announced thread and announces nothing new.
    const opened = await harness.app.inject({
      method: "POST", url: "/v1/threads", headers: bora.headers,
      payload: { participantUserIds: [ada.userId, bora.userId] }
    })
    assert.equal(opened.statusCode, 200)
    assert.equal(opened.json().thread.threadId, expectedThreadId)
    const synced = await harness.app.inject({ method: "POST", url: "/v1/threads/sync-matches", headers: ada.headers })
    assert.deepEqual(synced.json().threads.map((entry: { threadId: string }) => entry.threadId), [expectedThreadId])
    assert.equal(threadCreatedEvents(harness).length, 1)

    // A retried like of the same match stays a match and announces nothing new.
    const retried = await like(harness, ada, bora.userId)
    assert.equal(retried.statusCode, 200)
    assert.equal(retried.json().matched, true)
    assert.equal(threadCreatedEvents(harness).length, 1)
    assert.equal(matchedEvents(harness).length, 1)
  } finally {
    await harness.app.close()
  }
})

test("concurrent reciprocal Discover likes open exactly one chat for the pair", async () => {
  const harness = createHarness()
  try {
    const ada = await createDiscoverableAccount(harness, "+905556100011", "Ada")
    const bora = await createDiscoverableAccount(harness, "+905556100012", "Bora")

    const responses = await Promise.all([like(harness, ada, bora.userId), like(harness, bora, ada.userId)])
    assert.deepEqual(responses.map((response) => response.statusCode), [200, 200])
    assert.ok(responses.some((response) => response.json().matched === true))

    const [match] = await harness.matchService.repository.listMatchesForUser(ada.userId)
    assert.ok(match)
    const threads = (await harness.chatService.listThreadsPage(ada.userId)).threads
    assert.deepEqual(threads.map((thread) => thread.threadId), [`thread_match_${match.matchId}`])
    const announced = threadCreatedEvents(harness)
    assert.equal(announced.length, 1, "only the like that created the match announces it")
    assert.equal(matchedEvents(harness).length, 1)
    for (const entry of announced) {
      assert.deepEqual(entry.userIds, [ada.userId, bora.userId].sort())
      assert.equal(
        (entry.event as Extract<ServerEvent, { type: "chat.thread_created" }>).payload.threadId,
        `thread_match_${match.matchId}`
      )
    }
  } finally {
    await harness.app.close()
  }
})

test("a Discover like answers before the match side effects finish, and a block refuses it like an unavailable profile", async () => {
  const harness = createHarness()
  try {
    const ada = await createDiscoverableAccount(harness, "+905556100031", "Ada")
    const bora = await createDiscoverableAccount(harness, "+905556100032", "Bora")
    assert.equal((await like(harness, bora, ada.userId)).statusCode, 200)
    // Hold the announcement's account read: the response must not wait for it.
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const findAccounts = harness.authService.repository.findAccountsByUserIds.bind(harness.authService.repository)
    harness.authService.repository.findAccountsByUserIds = async (...args) => {
      await held
      return findAccounts(...args)
    }
    const response = await harness.app.inject({
      method: "POST", url: `/v1/discover/${bora.userId}/like`, headers: ada.headers, payload: {}
    })
    assert.equal(response.json().matched, true)
    assert.equal(matchedEvents(harness).length, 0, "answered before the announcement finished")
    release()
    await harness.afterResponseTasks.drain()
    assert.equal(matchedEvents(harness).length, 1)

    const cem = await createDiscoverableAccount(harness, "+905556100033", "Cem")
    await harness.safetyService.blockUser(cem.userId, ada.userId)
    const blocked = await like(harness, ada, cem.userId)
    assert.equal(blocked.statusCode, 400)
    assert.equal(blocked.json().error, "That profile is not available anymore.")
    assert.equal(await harness.matchService.repository.findDecision(ada.userId, cem.userId), null)
  } finally {
    await harness.app.close()
  }
})

test("a block that lands right after the match keeps the new chat closed and silent", async () => {
  const harness = createHarness()
  try {
    const ada = await createDiscoverableAccount(harness, "+905556100021", "Ada")
    const bora = await createDiscoverableAccount(harness, "+905556100022", "Bora")
    assert.equal((await like(harness, bora, ada.userId)).statusCode, 200)

    const decideEligible = harness.matchService.decideEligible.bind(harness.matchService)
    harness.matchService.decideEligible = async (...args) => {
      const result = await decideEligible(...args)
      // Bora blocks Ada while Ada's matching like is still being answered.
      await harness.safetyService.blockUser(bora.userId, ada.userId)
      return result
    }
    const matched = await like(harness, ada, bora.userId)
    assert.equal(matched.statusCode, 200)
    assert.equal(matched.json().matched, true)

    assert.deepEqual(threadCreatedEvents(harness), [])
    assert.deepEqual(matchedEvents(harness), [], "a blocked pair never gets a match moment")
    assert.equal(
      await harness.chatService.repository.findThread(`thread_match_${matched.json().match.matchId}`),
      null
    )
  } finally {
    await harness.app.close()
  }
})
