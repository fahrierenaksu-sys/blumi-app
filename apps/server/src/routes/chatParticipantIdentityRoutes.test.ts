import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread, ServerEvent } from "@blumi/contracts"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createAfterResponseTasks } from "../operations/afterResponseTasks"
import { createConnectionManager } from "../realtime/connectionManager"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

// Owner report 2026-10-02: someone who registered as "Eren" and renamed
// themselves still appeared as "Eren" in their partners' chats.

const TERMS = { version: "test-terms-v1", locale: "en" as const }

async function harness() {
  const authService = createAuthService()
  const safetyService = createSafetyService()
  const chatService = createChatService({
    blockPolicy: safetyService,
    profileSource: (userIds) => authService.repository.findAccountsByUserIds(userIds)
  })
  const connectionManager = createConnectionManager()
  const sent: Array<{ userIds: string[]; event: ServerEvent }> = []
  connectionManager.sendToUsers = (userIds, event) => { sent.push({ userIds: [...userIds], event }) }
  const failures: unknown[] = []
  const afterResponseTasks = createAfterResponseTasks({ reportFailure: (_kind, error) => failures.push(error) })
  const app = createServer({ authService, safetyService, chatService, connectionManager, afterResponseTasks })
  await app.ready()
  let phone = 0
  const account = async (displayName: string) => {
    phone += 1
    const signed = await authService.signInWithVerifiedPhone(`+1559${String(4_000_000 + phone)}`, { acceptedTerms: TERMS })
    await authService.updateProfile(signed.sessionToken, { displayName, age: 25, gender: "woman" })
    for (const step of ["profile", "avatar", "room"] as const) await authService.completeOnboardingStep(signed.sessionToken, step)
    return { userId: signed.account.userId, token: signed.sessionToken }
  }
  const chat = async (id: string, a: { userId: string }, b: { userId: string }, names: [string, string]) => {
    await chatService.createThread({
      threadId: `thread_${id}`, miniRoomId: `room_${id}`, participantUserIds: [a.userId, b.userId],
      participants: [{ userId: a.userId, displayName: names[0] }, { userId: b.userId, displayName: names[1] }]
    })
    return `thread_${id}`
  }
  const call = (method: "GET" | "PATCH" | "PUT", url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload: payload as object } : {}) })
  const participantUpdates = () => sent.filter((entry) => entry.event.type === "chat.participant_updated")
  return { app, authService, safetyService, afterResponseTasks, account, chat, call, sent, participantUpdates, failures }
}

function partnerName(threads: ChatThread[], threadId: string, partnerUserId: string): string | undefined {
  return threads.find((thread) => thread.threadId === threadId)
    ?.participants.find((participant) => participant.userId === partnerUserId)?.displayName
}

test("after a rename, partners read the new name and connected partners are told at once", async () => {
  const h = await harness()
  try {
    const eren = await h.account("Eren")
    const ada = await h.account("Ada")
    const bora = await h.account("Bora")
    const blocker = await h.account("Cem")
    const withAda = await h.chat("ada", eren, ada, ["Eren", "Ada"])
    await h.chat("bora", bora, eren, ["Bora", "Eren"])
    await h.chat("cem", eren, blocker, ["Eren", "Cem"])
    await h.safetyService.repository.saveBlock({ actorUserId: blocker.userId, blockedUserId: eren.userId, createdAt: new Date().toISOString() })

    const renamed = await h.call("PATCH", "/v1/users/me", eren.token, { displayName: "Irmak" })
    assert.equal(renamed.statusCode, 200, renamed.body)
    await h.afterResponseTasks.drain()

    const listed = await h.call("GET", "/v1/threads", ada.token)
    assert.equal(listed.statusCode, 200, listed.body)
    assert.equal(partnerName(listed.json().threads, withAda, eren.userId), "Irmak")

    const updates = h.participantUpdates()
    assert.equal(updates.length, 1)
    assert.deepEqual(new Set(updates[0]!.userIds), new Set([ada.userId, bora.userId]), "every visible chat partner, never the blocker")
    assert.equal(updates[0]!.event.type === "chat.participant_updated" && updates[0]!.event.payload.participant.displayName, "Irmak")
    assert.equal(updates[0]!.event.type === "chat.participant_updated" && updates[0]!.event.payload.participant.userId, eren.userId)
    assert.deepEqual(h.failures, [])
  } finally {
    await h.app.close()
  }
})

test("a saved outfit reaches chat partners; a profile save without name or outfit stays quiet", async () => {
  const h = await harness()
  try {
    const eren = await h.account("Eren")
    const ada = await h.account("Ada")
    await h.chat("outfit", eren, ada, ["Eren", "Ada"])

    const bio = await h.call("PATCH", "/v1/users/me", eren.token, { bio: "hello there" })
    assert.equal(bio.statusCode, 200, bio.body)
    await h.afterResponseTasks.drain()
    assert.equal(h.participantUpdates().length, 0)

    const current = await h.call("GET", "/v1/users/me", eren.token)
    const revision = current.json().profile.avatar.revision as number
    const saved = await h.call("PUT", "/v1/users/me/avatar", eren.token, { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision })
    assert.equal(saved.statusCode, 200, saved.body)
    await h.afterResponseTasks.drain()
    const [update] = h.participantUpdates()
    assert.deepEqual(update?.userIds, [ada.userId])
    assert.equal(update?.event.type === "chat.participant_updated" && update.event.payload.participant.avatar?.revision, revision + 1)

    const stale = await h.call("PUT", "/v1/users/me/avatar", eren.token, { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision })
    assert.equal(stale.statusCode, 409)
    await h.afterResponseTasks.drain()
    assert.equal(h.participantUpdates().length, 1, "a refused save announces nothing")
    assert.deepEqual(h.failures, [])
  } finally {
    await h.app.close()
  }
})
