import assert from "node:assert/strict"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import {
  createInMemoryChatRepository,
  createInMemoryChatStore,
  type ChatCheckedSendResult,
  type ChatRepository
} from "../chat/chatRepository"
import { createChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"
import { createInMemorySafetyRepository, type SafetyRepository } from "../safety/safetyRepository"
import { createSafetyService } from "../safety/safetyService"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

/**
 * `ChatRepository.sendMessageChecked`, the one-statement chat send
 * (2026-10-01), against both implementations. The chat repository reads
 * blocks from its own source: PostgreSQL from blumi_safety_blocks, the
 * in-memory store from the safety service it is given; the safety repository
 * here only writes them.
 */
interface ChatSendBackend { chat: ChatRepository; safety: SafetyRepository }
type Backend = RepositoryContractBackend<ChatSendBackend>

const LEASE_MS = 30_000

function thread(backend: Backend, suffix: string, users = ""): ChatThread {
  const participantUserIds: [string, string] = [backend.id(`user_a${users}`), backend.id(`user_b${users}`)]
  return {
    threadId: backend.id(`thread_${suffix}`),
    miniRoomId: backend.id(`room_${suffix}`),
    participantUserIds,
    participants: [{ userId: participantUserIds[0], displayName: "Ada" }, { userId: participantUserIds[1], displayName: "Bo" }],
    createdAt: "2026-10-01T10:00:00.000Z"
  }
}

function message(chat: ChatThread, id: string, body: string, sender = chat.participantUserIds[0], sentAt = new Date()): ChatMessage {
  return { messageId: `${chat.threadId}_${id}`, threadId: chat.threadId, senderUserId: sender, body, sentAt: sentAt.toISOString() }
}

function send(backend: Backend, value: ChatMessage, clientMessageId?: string, now = new Date()): Promise<ChatCheckedSendResult> {
  return backend.repository.chat.sendMessageChecked({
    message: value,
    ...(clientMessageId ? { clientMessageId } : {}),
    leaseUntil: new Date(now.getTime() + LEASE_MS)
  })
}

runRepositoryContract<ChatSendBackend>({
  name: "chat checked send",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => {
      const safety = createInMemorySafetyRepository()
      return {
        safety,
        chat: createInMemoryChatRepository(createInMemoryChatStore(), { blockSource: createSafetyService({ repository: safety }) })
      }
    },
    postgres: (pool) => ({
      chat: createPostgresChatRepository(pool, { receiptSchema: createChatReceiptSchemaProbe(pool) }),
      safety: createPostgresSafetyRepository(pool)
    })
  },
  cases: {
    "a missing thread or a sender outside it is unavailable and writes nothing": async (backend) => {
      const chat = thread(backend, "gate")
      await backend.repository.chat.saveThread(chat)
      const missing = { ...message(chat, "m0", "hello"), threadId: backend.id("thread_missing") }
      assert.deepEqual(await send(backend, missing), { outcome: "unavailable" })
      assert.deepEqual(await send(backend, message(chat, "m1", "hello", backend.id("intruder")), "client-gate-0001"),
        { outcome: "unavailable" })
      assert.deepEqual(await backend.repository.chat.listMessages(chat.threadId), [])
      assert.equal((await backend.repository.chat.findThread(chat.threadId))?.lastMessage, undefined)
    },

    "a created message comes with its preview and an outbox job leased to the sender": async (backend) => {
      const chat = thread(backend, "created")
      await backend.repository.chat.saveThread(chat)
      const now = new Date()
      const result = await send(backend, message(chat, "m1", "hello", undefined, now), "client-created-01", now)
      assert.equal(result.outcome, "created")
      if (result.outcome !== "created") return
      assert.equal(result.message.body, "hello")
      assert.deepEqual(result.participantUserIds, chat.participantUserIds)
      assert.equal(result.job.attempt, 1)
      assert.deepEqual(result.recipientPersonas, [])
      assert.equal((await backend.repository.chat.findThread(chat.threadId))?.lastMessage?.messageId, result.message.messageId)
      assert.deepEqual((await backend.repository.chat.listMessages(chat.threadId)).map((entry) => entry.messageId), [result.message.messageId])

      // Nobody else can claim the job while the lease runs.
      const claim = (at: number) => backend.repository.chat.claimDeliveries({
        now: new Date(at), limit: 10, leaseMs: LEASE_MS, messageId: result.message.messageId
      })
      assert.deepEqual(await claim(now.getTime() + 1_000), [])
      assert.equal(await backend.repository.chat.renewDeliveryLease(result.message.messageId, "not-the-lease", new Date(now.getTime() + 60_000)), false)
      assert.equal(await backend.repository.chat.renewDeliveryLease(result.message.messageId, result.job.leaseToken, new Date(now.getTime() + 60_000)), true)
      assert.deepEqual(await claim(now.getTime() + LEASE_MS + 1_000), [], "the renewed lease still holds")
      await backend.repository.chat.completeDelivery(result.message.messageId, result.job.leaseToken, now)
      assert.equal(await backend.repository.chat.renewDeliveryLease(result.message.messageId, result.job.leaseToken, new Date(now.getTime() + 90_000)), false,
        "a completed job cannot be renewed")
      assert.deepEqual(await claim(now.getTime() + 120_000), [])
    },

    "an expired send lease is recovered by a claim, after which the sender's lease is lost": async (backend) => {
      const chat = thread(backend, "expired")
      await backend.repository.chat.saveThread(chat)
      const now = new Date()
      const result = await send(backend, message(chat, "m1", "hello", undefined, now), undefined, now)
      assert.equal(result.outcome, "created")
      if (result.outcome !== "created") return
      const [claimed] = await backend.repository.chat.claimDeliveries({
        now: new Date(now.getTime() + LEASE_MS + 1_000), limit: 10, leaseMs: LEASE_MS, messageId: result.message.messageId
      })
      assert.equal(claimed?.attempt, 2)
      assert.notEqual(claimed?.leaseToken, result.job.leaseToken)
      assert.equal(await backend.repository.chat.renewDeliveryLease(result.message.messageId, result.job.leaseToken, new Date(now.getTime() + 90_000)), false)
    },

    "a block in either direction refuses the send, and reports the committed retry": async (backend) => {
      for (const [index, direction] of (["sender", "recipient"] as const).entries()) {
        const chat = thread(backend, `blocked_${direction}`, `_${direction}`)
        await backend.repository.chat.saveThread(chat)
        const [sender, recipient] = chat.participantUserIds
        const committed = await send(backend, message(chat, "m1", "before"), `client-block-${index}01`)
        assert.equal(committed.outcome, "created")
        await backend.repository.safety.saveBlock(direction === "sender"
          ? { actorUserId: sender, blockedUserId: recipient, createdAt: "2026-10-01T10:00:00.000Z" }
          : { actorUserId: recipient, blockedUserId: sender, createdAt: "2026-10-01T10:00:00.000Z" })

        assert.deepEqual(await send(backend, message(chat, "m2", "after"), `client-block-${index}02`), { outcome: "blocked" })
        assert.deepEqual(await send(backend, message(chat, "m3", "after")), { outcome: "blocked" })
        const retry = await send(backend, message(chat, "m1_retry", "before"), `client-block-${index}01`)
        assert.equal(retry.outcome, "blocked")
        assert.equal(retry.outcome === "blocked" ? retry.retryOf?.messageId : undefined,
          committed.outcome === "created" ? committed.message.messageId : "missing")
        assert.equal((await backend.repository.chat.listMessages(chat.threadId)).length, 1)
      }
    },

    "a reused client message ID returns the stored message, flagging a changed body": async (backend) => {
      const chat = thread(backend, "retry")
      await backend.repository.chat.saveThread(chat)
      const first = await send(backend, message(chat, "m1", "hello"), "client-retry-001")
      assert.equal(first.outcome, "created")
      if (first.outcome !== "created") return
      const same = await send(backend, message(chat, "m1_again", "hello"), "client-retry-001")
      assert.deepEqual(same, { outcome: "retried", message: first.message, participantUserIds: chat.participantUserIds })
      const changed = await send(backend, message(chat, "m1_changed", "changed"), "client-retry-001")
      assert.deepEqual(changed, { outcome: "retried", message: first.message, participantUserIds: chat.participantUserIds, idempotencyConflict: true })
      const otherSender = await send(backend, message(chat, "m2", "hello", chat.participantUserIds[1]), "client-retry-001")
      assert.equal(otherSender.outcome, "created", "the key is scoped to the sender")
      assert.equal((await backend.repository.chat.listMessages(chat.threadId)).length, 2)
      assert.equal((await backend.repository.chat.findThread(chat.threadId))?.lastMessage?.messageId,
        otherSender.outcome === "created" ? otherSender.message.messageId : "missing")
    }
  }
})
