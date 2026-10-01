import type { ChatPreferences } from "@blumi/contracts"
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
      // Same SQL before and after 070: only the unread cursor moves.
      if (input.upToMessageId === undefined) return readAtInstant(pool, input.threadId, input.userId, input.readAt)
      return await schema.isReady()
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
                receipt.sent_at AS read_receipt_sent_at, receipt.message_id AS read_receipt_message_id,
                COALESCE(preference.read_receipts_enabled, false) AS read_receipts_enabled
           FROM blumi_chat_thread_participants AS participant
           LEFT JOIN blumi_chat_messages AS receipt
             ON receipt.thread_id = participant.thread_id
            AND receipt.message_id = participant.last_read_message_id
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
        // The read receipt is the named message's own position, never
        // last_read_at (which an instant read can move past unshown messages).
        ...(row.read_receipt_message_id
          ? { readUpTo: { sentAt: toIso(row.read_receipt_sent_at), messageId: String(row.read_receipt_message_id) } }
          : {}),
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

/**
 * A read without a message (older app builds, or no partner message on
 * screen) moves only the unread cursor, last_read_at. It never moves or
 * publishes the read receipt: sent_at is assigned before a send commits, so
 * an instant can cover a partner message that was not yet visible, let alone
 * shown, and the partner would see a false read tick.
 * Same SQL before and after 070.
 */
async function readAtInstant(pool: QueryExecutor, threadId: string, userId: string, readAt: string): Promise<ChatReadAdvance | null> {
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

/**
 * A read up to a shown partner message. The unread cursor moves to
 * GREATEST(last_read_at, message time); the read receipt is the message named
 * by last_read_message_id and moves only forward in (sent_at, message_id)
 * order, compared with that message's own position. An instant read may have
 * put last_read_at past a message that is read by id later; the receipt still
 * advances to it. Both comparisons read the participant row being updated, so
 * a concurrent read that committed first is re-checked (never moved back).
 */
async function readUpToMessage(pool: QueryExecutor, threadId: string, userId: string, messageId: string): Promise<ChatReadAdvance | null> {
  const receiptMovesForward = `(participant.last_read_message_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM blumi_chat_messages AS receipt
          WHERE receipt.thread_id = participant.thread_id
            AND receipt.message_id = participant.last_read_message_id
            AND (receipt.sent_at, receipt.message_id) >= (target.sent_at, target.message_id)))`
  const result = await pool.query(
    `WITH target AS (
       SELECT sent_at, message_id FROM blumi_chat_messages
        WHERE thread_id = $1 AND message_id = $3 AND sender_user_id <> $2
     ), current AS (
       SELECT last_read_at, last_read_message_id FROM blumi_chat_thread_participants
        WHERE thread_id = $1 AND user_id = $2
     ), advanced AS (
       UPDATE blumi_chat_thread_participants AS participant
          SET last_read_at = GREATEST(participant.last_read_at, target.sent_at),
              last_read_message_id = CASE WHEN ${receiptMovesForward}
                                          THEN target.message_id
                                          ELSE participant.last_read_message_id END
         FROM target
        WHERE participant.thread_id = $1 AND participant.user_id = $2
          AND (participant.last_read_at IS NULL OR participant.last_read_at < target.sent_at OR
               ${receiptMovesForward})
       RETURNING participant.last_read_at, participant.last_read_message_id
     )
     SELECT EXISTS (SELECT 1 FROM target) AS found,
            EXISTS (SELECT 1 FROM current) AS participant,
            (SELECT last_read_at FROM advanced) AS advanced_at,
            (SELECT last_read_at FROM current) AS current_at,
            ((SELECT last_read_message_id FROM advanced) = (SELECT message_id FROM target) AND
             (SELECT last_read_message_id FROM current) IS DISTINCT FROM (SELECT message_id FROM target)) AS receipt_advances,
            (SELECT sent_at FROM target) AS target_sent_at,
            (SELECT message_id FROM target) AS target_message_id`,
    [threadId, userId, messageId]
  )
  const row = result.rows[0]
  if (!row?.found || !row.participant) return null
  const readAt = toIso(row.advanced_at ?? row.current_at)
  return row.receipt_advances === true
    ? { readAt, readUpTo: { sentAt: toIso(row.target_sent_at), messageId: String(row.target_message_id) } }
    : { readAt }
}

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString()
}
