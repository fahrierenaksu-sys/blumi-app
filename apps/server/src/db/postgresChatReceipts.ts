import type { ChatPreferences, ChatReceiptCursor } from "@blumi/contracts"
import type { QueryResultRow } from "pg"
import {
  DEFAULT_CHAT_PREFERENCES,
  type ChatDeliveredAdvance,
  type ChatReadAdvance,
  type ChatReadTarget,
  type ChatReceiptParticipant
} from "../chat/chatRepository"
import type { ChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
}

/**
 * Receipt persistence for the PostgreSQL chat repository. Every statement
 * that names a migration 070 object runs only after `schema.isReady()`;
 * before that the read cursor keeps its pre-070 SQL and the receipt-only
 * methods answer without a query. Cursor moves are single statements whose
 * WHERE clause compares `(sent_at, message_id)` rows, so concurrent acks and
 * reads can only move a cursor forward.
 */
export function createPostgresChatReceipts(pool: QueryExecutor, schema: ChatReceiptSchemaProbe) {
  return {
    supportsReceipts: () => schema.isReady(),

    async advanceReadCursor(input: { threadId: string; userId: string } & ChatReadTarget): Promise<ChatReadAdvance | null> {
      const ready = await schema.isReady()
      if (input.upToMessageId === undefined) {
        return ready
          ? readAtInstant(pool, input.threadId, input.userId, input.readAt)
          : legacyReadAtInstant(pool, input.threadId, input.userId, input.readAt)
      }
      return ready
        ? readUpToMessage(pool, input.threadId, input.userId, input.upToMessageId)
        : legacyReadUpToMessage(pool, input.threadId, input.userId, input.upToMessageId)
    },

    async advanceDeliveredCursor(input: { threadId: string; userId: string; upToMessageId: string }): Promise<ChatDeliveredAdvance | null> {
      if (!await schema.isReady()) return null
      const result = await pool.query(
        `WITH target AS (
           SELECT sent_at, message_id, sender_user_id
             FROM blumi_chat_messages
            WHERE thread_id = $1 AND message_id = $3 AND sender_user_id <> $2
         ), advanced AS (
           UPDATE blumi_chat_thread_participants AS participant
              SET last_delivered_at = target.sent_at,
                  last_delivered_message_id = target.message_id
             FROM target
            WHERE participant.thread_id = $1 AND participant.user_id = $2
              AND (participant.last_delivered_at IS NULL OR
                   (participant.last_delivered_at, participant.last_delivered_message_id)
                     < (target.sent_at, target.message_id))
           RETURNING participant.last_delivered_at, participant.last_delivered_message_id
         )
         SELECT advanced.last_delivered_at, advanced.last_delivered_message_id,
                target.sender_user_id AS partner_user_id
           FROM advanced CROSS JOIN target`,
        [input.threadId, input.userId, input.upToMessageId]
      )
      const row = result.rows[0]
      return row
        ? {
            partnerUserId: String(row.partner_user_id),
            deliveredUpTo: {
              sentAt: toIso(row.last_delivered_at),
              messageId: String(row.last_delivered_message_id)
            }
          }
        : null
    },

    async listReceiptParticipants(threadIds: readonly string[]): Promise<ChatReceiptParticipant[]> {
      if (threadIds.length === 0 || !await schema.isReady()) return []
      const result = await pool.query(
        `SELECT participant.thread_id, participant.user_id,
                participant.last_delivered_at, participant.last_delivered_message_id,
                participant.last_read_at, participant.last_read_message_id,
                COALESCE(preference.read_receipts_enabled, false) AS read_receipts_enabled
           FROM blumi_chat_thread_participants AS participant
           LEFT JOIN blumi_chat_privacy_preferences AS preference
             ON preference.user_id = participant.user_id
          WHERE participant.thread_id = ANY($1::text[])
          ORDER BY participant.thread_id, participant.participant_order`,
        [[...new Set(threadIds)]]
      )
      return result.rows.map((row) => ({
        threadId: String(row.thread_id),
        userId: String(row.user_id),
        ...(row.last_delivered_at && row.last_delivered_message_id
          ? { deliveredUpTo: { sentAt: toIso(row.last_delivered_at), messageId: String(row.last_delivered_message_id) } }
          : {}),
        ...(row.last_read_at ? { readUpTo: readCursor(row.last_read_at, row.last_read_message_id) } : {}),
        readReceiptsEnabled: row.read_receipts_enabled === true
      }))
    },

    async getChatPreferences(userId: string): Promise<ChatPreferences> {
      if (!await schema.isReady()) return { ...DEFAULT_CHAT_PREFERENCES }
      const result = await pool.query(
        "SELECT read_receipts_enabled FROM blumi_chat_privacy_preferences WHERE user_id = $1",
        [userId]
      )
      return { readReceiptsEnabled: result.rows[0]?.read_receipts_enabled === true }
    },

    async saveChatPreferences(userId: string, preferences: ChatPreferences, now: Date): Promise<ChatPreferences> {
      if (!await schema.isReady()) throw new Error("Chat preferences need migration 070.")
      const result = await pool.query(
        `INSERT INTO blumi_chat_privacy_preferences (user_id, read_receipts_enabled, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET read_receipts_enabled = EXCLUDED.read_receipts_enabled,
               updated_at = EXCLUDED.updated_at
         RETURNING read_receipts_enabled`,
        [userId, preferences.readReceiptsEnabled, now]
      )
      return { readReceiptsEnabled: result.rows[0]?.read_receipts_enabled === true }
    }
  }
}

/** Pre-070 read (unchanged semantics): the unread cursor only moves forward. */
async function legacyReadAtInstant(pool: QueryExecutor, threadId: string, userId: string, readAt: string) {
  const result = await pool.query(
    `UPDATE blumi_chat_thread_participants
        SET last_read_at = GREATEST(last_read_at, $3::timestamptz)
      WHERE thread_id = $1 AND user_id = $2
      RETURNING last_read_at`,
    [threadId, userId, new Date(readAt)]
  )
  const row = result.rows[0]
  if (!row) return null
  // GREATEST with a non-null argument is never null; the fallback is defensive.
  return { readAt: row.last_read_at ? toIso(row.last_read_at) : new Date(readAt).toISOString() }
}

/** Pre-070 read up to a message: the same cursor, at that message's time. */
async function legacyReadUpToMessage(pool: QueryExecutor, threadId: string, userId: string, messageId: string) {
  const result = await pool.query(
    `WITH target AS (
       SELECT sent_at FROM blumi_chat_messages
        WHERE thread_id = $1 AND message_id = $3 AND sender_user_id <> $2
     )
     UPDATE blumi_chat_thread_participants AS participant
        SET last_read_at = GREATEST(participant.last_read_at, target.sent_at)
       FROM target
      WHERE participant.thread_id = $1 AND participant.user_id = $2
      RETURNING participant.last_read_at`,
    [threadId, userId, messageId]
  )
  return result.rows[0] ? { readAt: toIso(result.rows[0].last_read_at) } : null
}

/** A read without a message covers the whole instant: the message id is cleared. */
async function readAtInstant(pool: QueryExecutor, threadId: string, userId: string, readAt: string): Promise<ChatReadAdvance | null> {
  const result = await pool.query(
    `WITH current AS (
       SELECT last_read_at FROM blumi_chat_thread_participants
        WHERE thread_id = $1 AND user_id = $2
     ), advanced AS (
       UPDATE blumi_chat_thread_participants AS participant
          SET last_read_at = $3::timestamptz, last_read_message_id = NULL
        WHERE participant.thread_id = $1 AND participant.user_id = $2
          AND (participant.last_read_at IS NULL OR participant.last_read_at < $3::timestamptz OR
               (participant.last_read_at = $3::timestamptz AND participant.last_read_message_id IS NOT NULL))
       RETURNING participant.last_read_at
     )
     SELECT EXISTS (SELECT 1 FROM current) AS participant,
            (SELECT last_read_at FROM advanced) AS advanced_at,
            (SELECT last_read_at FROM current) AS current_at`,
    [threadId, userId, new Date(readAt)]
  )
  const row = result.rows[0]
  if (!row?.participant) return null
  if (row.advanced_at) {
    const sentAt = toIso(row.advanced_at)
    return { readAt: sentAt, readUpTo: { sentAt } }
  }
  return { readAt: toIso(row.current_at) }
}

async function readUpToMessage(pool: QueryExecutor, threadId: string, userId: string, messageId: string): Promise<ChatReadAdvance | null> {
  const result = await pool.query(
    `WITH target AS (
       SELECT sent_at, message_id FROM blumi_chat_messages
        WHERE thread_id = $1 AND message_id = $3 AND sender_user_id <> $2
     ), current AS (
       SELECT last_read_at FROM blumi_chat_thread_participants
        WHERE thread_id = $1 AND user_id = $2
     ), advanced AS (
       UPDATE blumi_chat_thread_participants AS participant
          SET last_read_at = target.sent_at, last_read_message_id = target.message_id
         FROM target
        WHERE participant.thread_id = $1 AND participant.user_id = $2
          AND (participant.last_read_at IS NULL OR participant.last_read_at < target.sent_at OR
               (participant.last_read_at = target.sent_at AND participant.last_read_message_id IS NOT NULL AND
                participant.last_read_message_id < target.message_id))
       RETURNING participant.last_read_at, participant.last_read_message_id
     )
     SELECT EXISTS (SELECT 1 FROM target) AS found,
            EXISTS (SELECT 1 FROM current) AS participant,
            (SELECT last_read_at FROM advanced) AS advanced_at,
            (SELECT last_read_message_id FROM advanced) AS advanced_message_id,
            (SELECT last_read_at FROM current) AS current_at`,
    [threadId, userId, messageId]
  )
  const row = result.rows[0]
  if (!row?.found || !row.participant) return null
  if (row.advanced_at) {
    const sentAt = toIso(row.advanced_at)
    return { readAt: sentAt, readUpTo: { sentAt, messageId: String(row.advanced_message_id) } }
  }
  return { readAt: toIso(row.current_at) }
}

function readCursor(readAt: unknown, messageId: unknown): ChatReceiptCursor {
  return messageId
    ? { sentAt: toIso(readAt), messageId: String(messageId) }
    : { sentAt: toIso(readAt) }
}

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString()
}
