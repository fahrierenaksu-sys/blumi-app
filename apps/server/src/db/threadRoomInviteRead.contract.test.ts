import assert from "node:assert/strict"
import type { Pool } from "pg"
import { createInMemoryAuthRepository, type AuthRepository } from "../auth/authRepository"
import { createAccountRecord, createBlumiBackendStore } from "../auth/authStore"
import { createChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"
import { createInMemoryChatRepository, type ChatRepository } from "../chat/chatRepository"
import { createInMemoryConnectionRepository, type ConnectionRepository } from "../connections/connectionRepository"
import { createInMemoryMatchRepository, type MatchRepository } from "../matches/matchRepository"
import { createInMemoryMiniRoomRepository, type MiniRoomInviteRecord, type MiniRoomRepository } from "../miniRooms/miniRoomRepository"
import {
  createComposedThreadRoomInviteReader,
  isModerationAllowed,
  type ThreadRoomInviteReader
} from "../miniRooms/threadRoomInviteRead"
import { createInMemorySafetyRepository, type SafetyRepository } from "../safety/safetyRepository"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createPostgresConnectionRepository } from "./postgresConnectionRepository"
import { createPostgresMatchRepository } from "./postgresMatchRepository"
import { createPostgresMiniRoomRepository } from "./postgresMiniRoomRepository"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"
import { createPostgresThreadRoomInviteReader } from "./postgresThreadRoomInviteRead"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

interface Repositories {
  reader: ThreadRoomInviteReader
  chat: ChatRepository
  safety: SafetyRepository
  matches: MatchRepository
  connections: ConnectionRepository
  miniRooms: MiniRoomRepository
  /** Creates the account (and sets its moderation) the way each backend stores it. */
  account(userId: string, moderation?: { status: "banned" | "suspended" | "warned"; suspendedUntil?: string }): Promise<void>
  markTestPersona(userId: string): Promise<void>
}

type Backend = RepositoryContractBackend<Repositories>

const NOW = new Date("2026-10-02T12:00:00.000Z")
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000).toISOString()

function inMemory(): Repositories {
  const auth: AuthRepository = createInMemoryAuthRepository(createBlumiBackendStore())
  const chat = createInMemoryChatRepository()
  const personas = new Set<string>()
  chat.findTestPersona = async (userId) => personas.has(userId) ? { userId, greeting: "Hi", replies: [] } : null
  const safety = createInMemorySafetyRepository()
  const matches = createInMemoryMatchRepository()
  const connections = createInMemoryConnectionRepository()
  const miniRooms = createInMemoryMiniRoomRepository()
  return {
    reader: createComposedThreadRoomInviteReader({
      findThread: (threadId) => chat.findThread(threadId),
      hasBlockBetween: async (a, b) => (await safety.listBlockedUserIdsBetween(a, [b])).length > 0,
      findMatchBetween: (a, b) => matches.findMatchBetween(a, b),
      findConnectionBetween: (a, b) => connections.findMatchBetween(a, b),
      isUserAllowed: async (userId, now) => {
        const account = await auth.findAccountByUserId(userId)
        return Boolean(account) && isModerationAllowed(account?.moderation, now)
      },
      isTestPersona: async (userId) => Boolean(await chat.findTestPersona(userId)),
      listInvitesForThread: (threadId, now) => miniRooms.listInvitesForThread(threadId, now)
    }),
    chat, safety, matches, connections, miniRooms,
    async account(userId, moderation) {
      const record = { ...createAccountRecord(`+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, NOW), userId }
      await auth.saveAccount(moderation ? { ...record, moderation: { ...moderation, updatedAt: NOW.toISOString() } } : record)
    },
    async markTestPersona(userId) { personas.add(userId) }
  }
}

function postgres(pool: Pool): Repositories {
  return {
    reader: createPostgresThreadRoomInviteReader(pool),
    chat: createPostgresChatRepository(pool, { receiptSchema: createChatReceiptSchemaProbe(pool) }),
    safety: createPostgresSafetyRepository(pool),
    matches: createPostgresMatchRepository(pool),
    connections: createPostgresConnectionRepository(pool),
    miniRooms: createPostgresMiniRoomRepository(pool),
    async account(userId, moderation) {
      await pool.query(
        `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now()) ON CONFLICT (user_id) DO NOTHING`,
        [`account_${userId}`, userId, `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]
      )
      if (moderation) {
        await pool.query(
          `UPDATE blumi_accounts SET moderation_status = $2, moderation_updated_at = now(), suspended_until = $3
            WHERE user_id = $1`,
          [userId, moderation.status, moderation.suspendedUntil ?? null]
        )
      }
    },
    async markTestPersona(userId) {
      await pool.query(`INSERT INTO blumi_test_personas (user_id, greeting, replies) VALUES ($1, 'Hi', ARRAY['Olur'])`, [userId])
    }
  }
}

async function matchedPair(backend: Backend, options: { partnerModeration?: Parameters<Repositories["account"]>[1] } = {}) {
  const repositories = backend.repository
  const caller = backend.id("caller")
  const partner = backend.id("partner")
  await repositories.account(caller)
  await repositories.account(partner, options.partnerModeration)
  const matchId = backend.id("match")
  await repositories.matches.createMatch({ matchId, participantUserIds: [caller, partner], matchedAt: minutes(-60) })
  const threadId = `thread_match_${matchId}`
  await repositories.chat.saveThread({
    threadId,
    miniRoomId: `match_${matchId}`,
    participantUserIds: [caller, partner],
    participants: [{ userId: caller, displayName: "Ada" }, { userId: partner, displayName: "Bo" }],
    createdAt: minutes(-59)
  })
  return { caller, partner, threadId }
}

function invite(backend: Backend, threadId: string, sender: string, recipient: string, suffix: string,
  status: MiniRoomInviteRecord["status"], createdAt: string, expiresAt: string): MiniRoomInviteRecord {
  return {
    inviteId: backend.id(`invite_${suffix}`), senderUserId: sender, recipientUserId: recipient,
    sourceThreadId: threadId, status, createdAt, expiresAt,
    ...(status === "declined" ? { decidedAt: minutes(-20) } : {})
  }
}

const read = (backend: Backend, threadId: string, userId: string) =>
  backend.repository.reader.readThreadRoomInvites({ threadId, userId, now: NOW })

runRepositoryContract<Repositories>({
  name: "thread room invite read",
  databaseUrl: process.env.DATABASE_URL,
  factories: { inMemory, postgres },
  cases: {
    "a matched member reads the thread's invites in order, with lapsed pending invites expired": async (backend) => {
      const { caller, partner, threadId } = await matchedPair(backend)
      const declined = invite(backend, threadId, caller, partner, "declined", "declined", minutes(-30), minutes(-25))
      const lapsed = invite(backend, threadId, partner, caller, "lapsed", "pending", minutes(-20), minutes(-1))
      // One pending invite per thread at a time (unique index).
      const cancelled = invite(backend, threadId, partner, caller, "cancelled", "cancelled", minutes(-5), minutes(10))
      for (const entry of [cancelled, declined, lapsed]) await backend.repository.miniRooms.saveInvite(entry)

      const first = await read(backend, threadId, caller)
      assert.equal(first.status, "ok")
      assert.ok(first.status === "ok")
      assert.equal(first.partnerUserId, partner)
      assert.equal(first.partnerIsTestPersona, false)
      assert.deepEqual(first.invites.map((entry) => [entry.inviteId, entry.status]), [
        [declined.inviteId, "declined"], [lapsed.inviteId, "expired"], [cancelled.inviteId, "cancelled"]
      ])
      assert.equal(first.invites[1]?.decidedAt, NOW.toISOString())
      assert.equal(first.invites[0]?.decidedAt, declined.decidedAt)
      assert.equal(first.invites[2]?.expiresAt, cancelled.expiresAt)
      assert.equal(first.invites[0]?.senderUserId, caller)

      // The expiry was stored, not only reported.
      const stored = await backend.repository.miniRooms.findInvite(lapsed.inviteId)
      assert.equal(stored?.status, "expired")
      const again = await read(backend, threadId, partner)
      assert.ok(again.status === "ok")
      assert.deepEqual(again.invites.map((entry) => entry.status), ["declined", "expired", "cancelled"])
    },
    "a pending invite that has not expired stays pending": async (backend) => {
      const { caller, partner, threadId } = await matchedPair(backend)
      const pending = invite(backend, threadId, caller, partner, "pending", "pending", minutes(-5), minutes(10))
      await backend.repository.miniRooms.saveInvite(pending)
      const result = await read(backend, threadId, partner)
      assert.ok(result.status === "ok")
      assert.deepEqual(result.invites.map((entry) => [entry.inviteId, entry.status, entry.decidedAt]), [[pending.inviteId, "pending", undefined]])
    },
    "missing threads, non-members and blocks in either direction are hidden": async (backend) => {
      const { caller, partner, threadId } = await matchedPair(backend)
      const stranger = backend.id("stranger")
      await backend.repository.account(stranger)
      assert.deepEqual(await read(backend, backend.id("thread_missing"), caller), { status: "hidden" })
      assert.deepEqual(await read(backend, threadId, stranger), { status: "hidden" })
      await backend.repository.safety.saveBlock({ actorUserId: partner, blockedUserId: caller, createdAt: minutes(-1) })
      assert.deepEqual(await read(backend, threadId, caller), { status: "hidden" })
      assert.deepEqual(await read(backend, threadId, partner), { status: "hidden" })
    },
    "a thread no match or connection authorizes is forbidden": async (backend) => {
      const caller = backend.id("caller")
      const partner = backend.id("partner")
      await backend.repository.account(caller)
      await backend.repository.account(partner)
      const threadId = `thread_match_${backend.id("unmatched")}`
      await backend.repository.chat.saveThread({
        threadId, miniRoomId: `match_${backend.id("unmatched")}`,
        participantUserIds: [caller, partner],
        participants: [{ userId: caller, displayName: "Ada" }, { userId: partner, displayName: "Bo" }],
        createdAt: minutes(-5)
      })
      assert.deepEqual(await read(backend, threadId, caller), { status: "forbidden" })
    },
    "a connection authorizes its own thread": async (backend) => {
      const caller = backend.id("caller")
      const partner = backend.id("partner")
      await backend.repository.account(caller)
      await backend.repository.account(partner)
      const miniRoomId = backend.id("connection_room")
      await backend.repository.connections.saveMatch({ miniRoomId, participantUserIds: [partner, caller], matchedAt: minutes(-10) })
      const threadId = `thread_connection_${miniRoomId}`
      await backend.repository.chat.saveThread({
        threadId, miniRoomId,
        participantUserIds: [caller, partner],
        participants: [{ userId: caller, displayName: "Ada" }, { userId: partner, displayName: "Bo" }],
        createdAt: minutes(-9)
      })
      const result = await read(backend, threadId, caller)
      assert.ok(result.status === "ok")
      assert.deepEqual(result.invites, [])
    },
    "a banned partner forbids invites": async (backend) => {
      const banned = await matchedPair(backend, { partnerModeration: { status: "banned" } })
      assert.deepEqual(await read(backend, banned.threadId, banned.caller), { status: "forbidden" })
    },
    "a suspension that has not ended forbids invites": async (backend) => {
      const suspended = await matchedPair(backend, { partnerModeration: { status: "suspended", suspendedUntil: minutes(60) } })
      assert.deepEqual(await read(backend, suspended.threadId, suspended.caller), { status: "forbidden" })
    },
    "an ended suspension still allows invites": async (backend) => {
      const ended = await matchedPair(backend, { partnerModeration: { status: "suspended", suspendedUntil: minutes(-1) } })
      assert.equal((await read(backend, ended.threadId, ended.caller)).status, "ok")
    },
    "a warned partner still allows invites": async (backend) => {
      const warned = await matchedPair(backend, { partnerModeration: { status: "warned" } })
      assert.equal((await read(backend, warned.threadId, warned.caller)).status, "ok")
    },
    "the read says when the partner is a seeded test persona": async (backend) => {
      const { caller, partner, threadId } = await matchedPair(backend)
      await backend.repository.markTestPersona(partner)
      const result = await read(backend, threadId, caller)
      assert.ok(result.status === "ok")
      assert.equal(result.partnerIsTestPersona, true)
    }
  }
})
