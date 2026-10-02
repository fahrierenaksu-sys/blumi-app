import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import type { ChatThread, CompleteAvatarSelection } from "@blumi/contracts"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createInMemoryAuthRepository, type AuthRepository } from "../auth/authRepository"
import { createAccountRecord, createBlumiBackendStore, type AccountRecord } from "../auth/authStore"
import { createInMemoryChatRepository, type ChatRepository } from "../chat/chatRepository"
import { createChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"
import { createChatHideSchemaProbe } from "../chat/chatHideSchema"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { runRepositoryContract } from "./repositoryContract"

// A chat shows each person's CURRENT name and outfit, whatever was stored
// when the chat was created (owner report 2026-10-02: a renamed user still
// appeared under the registration name). Both implementations owe this.

interface IdentityHarness {
  auth: AuthRepository
  chat: ChatRepository
}

async function account(auth: AuthRepository, displayName: string): Promise<AccountRecord> {
  const record = createAccountRecord(`+1558${String(randomInt(0, 10_000_000)).padStart(7, "0")}`)
  await auth.saveAccount(record)
  const named = await auth.updateAccountProfile({ accountId: record.accountId, profile: { displayName }, now: new Date() })
  return named ?? assert.fail("account was not stored")
}

function chatBetween(id: string, a: AccountRecord, b: AccountRecord, names: [string, string]): ChatThread {
  return {
    threadId: `thread_${id}`,
    miniRoomId: `room_${id}`,
    participantUserIds: [a.userId, b.userId],
    participants: [
      { userId: a.userId, displayName: names[0] },
      { userId: b.userId, displayName: names[1] }
    ],
    createdAt: "2026-10-02T10:00:00.000Z"
  }
}

function partnerOf(thread: ChatThread | null | undefined, userId: string) {
  return thread?.participants.find((participant) => participant.userId === userId)
}

const NEXT_OUTFIT = (revision: number): CompleteAvatarSelection => ({
  presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
  revision,
  loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds] }
})

runRepositoryContract<IdentityHarness>({
  name: "chat participant identity",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => {
      const auth = createInMemoryAuthRepository(createBlumiBackendStore())
      return { auth, chat: createInMemoryChatRepository(undefined, { profileSource: (ids) => auth.findAccountsByUserIds(ids) }) }
    },
    postgres: (pool) => ({
      auth: createPostgresAuthRepository(pool),
      chat: createPostgresChatRepository(pool, {
        receiptSchema: createChatReceiptSchemaProbe(pool),
        hideSchema: createChatHideSchemaProbe(pool)
      })
    })
  },
  cases: {
    "a rename shows in the thread list and the opened thread, not the name stored with the chat": async (backend) => {
      const { auth, chat } = backend.repository
      const eren = await account(auth, "Eren")
      const ada = await account(auth, "Ada")
      const thread = chatBetween(backend.id("rename"), eren, ada, ["Eren", "Ada"])
      await chat.saveThread(thread)

      await auth.updateAccountProfile({ accountId: eren.accountId, profile: { displayName: "Irmak" }, now: new Date() })

      const listed = (await chat.listThreadsPage(ada.userId)).threads.find((entry) => entry.threadId === thread.threadId)
      assert.equal(partnerOf(listed, eren.userId)?.displayName, "Irmak")
      assert.equal(partnerOf(await chat.findThread(thread.threadId), eren.userId)?.displayName, "Irmak")
      assert.equal(partnerOf((await chat.listThreads(eren.userId))[0], ada.userId)?.displayName, "Ada")
    },

    "a newly saved outfit shows in the chat": async (backend) => {
      const { auth, chat } = backend.repository
      const eren = await account(auth, "Eren")
      const ada = await account(auth, "Ada")
      const thread = chatBetween(backend.id("outfit"), eren, ada, ["Eren", "Ada"])
      await chat.saveThread(thread)
      const stored = await auth.findAccountByUserId(eren.userId)
      const revision = (stored?.profile.avatar.revision ?? 0) + 1
      const saved = await auth.updateAvatarSelection({
        accountId: eren.accountId, expectedRevision: revision - 1, selection: NEXT_OUTFIT(revision), now: new Date()
      })
      assert.equal(saved.kind, "updated")

      const avatar = partnerOf(await chat.findThread(thread.threadId), eren.userId)?.avatar
      assert.equal(avatar?.revision, revision)
      assert.deepEqual(avatar?.loadout, NEXT_OUTFIT(revision).loadout)
    },

    "an account without a name keeps the name stored with the chat": async (backend) => {
      const { auth, chat } = backend.repository
      const unnamed = createAccountRecord(`+1558${String(randomInt(0, 10_000_000)).padStart(7, "0")}`)
      await auth.saveAccount(unnamed)
      const ada = await account(auth, "Ada")
      const thread = chatBetween(backend.id("unnamed"), ada, { ...unnamed }, ["Ada", "Stored"])
      await chat.saveThread(thread)
      assert.equal(partnerOf(await chat.findThread(thread.threadId), unnamed.userId)?.displayName, "Stored")
    }
  }
})
