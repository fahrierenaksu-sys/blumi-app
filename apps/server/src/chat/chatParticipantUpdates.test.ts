import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import { DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createChatService } from "./chatService"
import { createSafetyService } from "../safety/safetyService"
import { createConnectionManager } from "../realtime/connectionManager"
import { createAfterResponseTasks } from "../operations/afterResponseTasks"
import { createServer } from "../server"

test("rename and wardrobe saves refresh chat identity, notify all pages, and exclude blocked partners", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const safetyService = createSafetyService()
  const chatService = createChatService({ blockPolicy: safetyService,
    profileSource: async (ids) => (await authService.repository.findAccountsByUserIds(ids)).map((account) => ({ ...account.profile, profileUpdatedAt: account.updatedAt })) })
  const connectionManager = createConnectionManager()
  const events: Array<{ users: string[]; event: ServerEvent }> = []
  connectionManager.sendToUsers = (users, event) => { events.push({ users: [...users], event }) }
  const failures: unknown[] = []
  const afterResponseTasks = createAfterResponseTasks({ reportFailure: (_kind, error) => failures.push(error) })
  const app = createServer({ authService, safetyService, chatService, connectionManager, afterResponseTasks })
  try {
    await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber: "+905551112233" } })
    const registered = await app.inject({ method: "POST", url: "/v1/accounts/register", payload: {
      phoneNumber: "+905551112233", verificationCode: "482931", termsAcceptance: { version: "test-terms-v1", locale: "tr" } } })
    assert.equal(registered.statusCode, 200)
    const { session, profile } = registered.json()
    const userId = profile.userId as string
    const headers = { authorization: `Bearer ${session.sessionToken}` }
    const initial = await app.inject({ method: "PATCH", url: "/v1/users/me", headers, payload: { displayName: "Eren" } })
    assert.equal(initial.statusCode, 200)
    for (let index = 0; index < 52; index++) await chatService.createThread({ threadId: `identity_${index}`, miniRoomId: "room",
      participantUserIds: [userId, `partner_${index}`], participants: [{ userId, displayName: "Eren" }, { userId: `partner_${index}` }] },
      new Date(Date.parse("2026-10-01T10:00:00Z") + index))
    // Hide both directions through the same policy as chat reads.
    await safetyService.repository.saveBlock({ actorUserId: "partner_51", blockedUserId: userId, createdAt: new Date().toISOString() })
    await afterResponseTasks.drain()
    events.length = 0
    const renamed = await app.inject({ method: "PATCH", url: "/v1/users/me", headers, payload: { displayName: "Irmak" } })
    assert.equal(renamed.statusCode, 200)
    await afterResponseTasks.drain()
    assert.equal((await chatService.listThreads(userId))[0].participants[0].displayName, "Irmak")
    const recipients = new Set(events.flatMap((entry) => entry.users))
    assert.ok(recipients.has("partner_0"), "oldest chat beyond page one is notified")
    assert.ok(!recipients.has("partner_51"), "blocked partner receives no identity update")
    assert.ok(events.every(({ event }) => event.type === "chat.participant_updated" && event.payload.participant.displayName === "Irmak"))
    const latestAccount = await authService.repository.findAccountByUserId(userId)
    assert.equal((await chatService.listThreads(userId))[0].participants[0].profileUpdatedAt, latestAccount?.updatedAt)
    assert.ok(events.every(({ event }) => event.type === "chat.participant_updated" && event.payload.participant.profileUpdatedAt === event.payload.updatedAt))
    events.length = 0
    const saved = await app.inject({ method: "PUT", url: "/v1/users/me/avatar", headers, payload: { loadout: DEFAULT_MALE_AVATAR_LOADOUT, revision: 0 } })
    assert.equal(saved.statusCode, 200)
    await afterResponseTasks.drain()
    const participant = (await chatService.repository.findThread("identity_0"))!.participants[0]
    assert.deepEqual(participant.avatar, saved.json().avatar)
    assert.ok(events.some(({ event }) => event.type === "chat.participant_updated" && event.payload.participant.avatar?.revision === 1))
    events.length = 0
    const stale = await app.inject({ method: "PUT", url: "/v1/users/me/avatar", headers, payload: { loadout: DEFAULT_MALE_AVATAR_LOADOUT, revision: 0 } })
    assert.equal(stale.statusCode, 409)
    await afterResponseTasks.drain()
    assert.equal(events.length, 0)
    assert.deepEqual(failures, [])
  } finally { await app.close() }
})
