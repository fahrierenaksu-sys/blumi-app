import type { ChatMessage, ChatThread } from "@blumi/contracts"
import type { QueryResultRow } from "pg"
import type {
  ChatMessagePageOptions,
  ChatRepository
} from "../chat/chatRepository"
import { CHAT_DELIVERY_DEAD_LETTER } from "../chat/chatRepository"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import { normalizeThreadPage, encodeThreadCursor } from "../chat/chatThreadPagination"
import { createStaticChatReceiptSchema, type ChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"
import type { ChatHideSchemaProbe } from "../chat/chatHideSchema"
import { createPostgresChatReceipts } from "./postgresChatReceipts"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

/**
 * `receiptSchema` says whether migration 070 is applied. Without one the
 * repository assumes it is not (fail closed): receipts stay off and no query
 * names a 070 column or table. `hideSchema` does the same for 071
 * (`hidden_through`, "delete chat for me").
 */
export function createPostgresChatRepository(
  pool: QueryExecutor,
  options: { receiptSchema?: ChatReceiptSchemaProbe; hideSchema?: ChatHideSchemaProbe; testPersonaCacheTtlMs?: number } = {}
): ChatRepository {
  const receipts = createPostgresChatReceipts(
    pool,
    options.receiptSchema ?? createStaticChatReceiptSchema(false)
  )
  const hideSchema = options.hideSchema ?? createStaticChatReceiptSchema(false)
  const testPersonaIds = createTestPersonaIdCache(pool, options.testPersonaCacheTtlMs ?? TEST_PERSONA_CACHE_TTL_MS)
  return {
    ...receipts,
    async findTestPersona(userId) {
      // Almost every caller asks about a real account: answer from the
      // cached persona set without a round trip.
      if (!await testPersonaIds.mayContain(userId)) return null
      const result = await pool.query(
        `SELECT user_id, greeting, replies FROM blumi_test_personas WHERE user_id = $1`,
        [userId]
      )
      const row = result.rows[0]
      return row ? {
        userId: String(row.user_id),
        greeting: String(row.greeting),
        replies: Array.isArray(row.replies) ? row.replies.map(String) : []
      } : null
    },
    async listThreads(userId) {
      return (await this.listThreadsPage(userId)).threads
    },
    async listThreadsPage(userId, options) {
      const { limit, cursor } = normalizeThreadPage(userId, options)
      // After 071 a thread the viewer hid stays listed with its hide point, so
      // links, room invites and room chat still find it; the app hides the
      // row until its newest message is after that point.
      const hiddenColumn = await hideSchema.isReady()
        ? "p.hidden_through AS viewer_hidden_through,"
        : ""
      const result = await pool.query(
        `SELECT
            t.thread_id,
            t.mini_room_id,
            t.created_at,
            to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
            m.message_id AS last_message_id,
            m.sender_user_id AS last_sender_user_id,
            m.body AS last_body,
            m.sent_at AS last_sent_at,
            m.delivered_at AS last_delivered_at,
            m.read_at AS last_read_at,
            m.edited_at AS last_edited_at,
            p.last_read_at AS viewer_last_read_at,
            ${hiddenColumn}
            (SELECT count(*)::int FROM blumi_chat_messages AS unread
              WHERE unread.thread_id = t.thread_id AND unread.sender_user_id <> $1
                AND unread.sent_at > COALESCE(p.last_read_at, '-infinity'::timestamptz)) AS unread_count
           FROM blumi_chat_threads t
           JOIN blumi_chat_thread_participants p
             ON p.thread_id = t.thread_id
           LEFT JOIN blumi_chat_messages m
             ON m.message_id = t.last_message_id
          WHERE p.user_id = $1
            AND ($2::timestamptz IS NULL OR (t.created_at, t.thread_id) < ($2::timestamptz, $3::text))
          ORDER BY t.created_at DESC, t.thread_id DESC LIMIT $4`,
        [userId, cursor?.createdAt ?? null, cursor?.threadId ?? null, limit + 1]
      )
      const rows = result.rows.slice(0, limit)
      if (rows.length === 0) return { threads: [], nextCursor: null }
      const participantRows = await pool.query(
        `SELECT participant.thread_id, participant.user_id, participant.display_name,
                account.avatar_preset_id, account.avatar_selection, account.avatar_revision
           FROM blumi_chat_thread_participants AS participant
           LEFT JOIN blumi_accounts AS account ON account.user_id = participant.user_id
          WHERE participant.thread_id = ANY($1::text[])
          ORDER BY participant.thread_id, participant.participant_order`, [rows.map((row) => String(row.thread_id))])
      const participantsByThread = new Map<string, ChatThread["participants"][number][]>()
      for (const participant of participantRows.rows) {
        const threadId = String(participant.thread_id)
        const grouped = participantsByThread.get(threadId) ?? []
        grouped.push(mapParticipant(participant))
        participantsByThread.set(threadId, grouped)
      }
      const threads = await Promise.all(rows.map(async (row) => {
        const participants = participantsByThread.get(String(row.thread_id)) ?? []
        if (participants.length !== 2) throw new Error("Chat thread is missing participants.")
        return { ...await mapThread(pool, row, [participants[0]!, participants[1]!]),
          unreadCount: Number(row.unread_count ?? 0),
          ...(row.viewer_last_read_at ? { lastReadAt: new Date(row.viewer_last_read_at).toISOString() } : {}),
          ...(row.viewer_hidden_through ? { hiddenThrough: new Date(row.viewer_hidden_through).toISOString() } : {}) }
      }))
      const last = threads.at(-1)!
      return { threads, nextCursor: result.rows.length > limit ? encodeThreadCursor({ userId, threadId: last.threadId, createdAt: String(rows.at(-1)?.cursor_created_at ?? last.createdAt) }) : null }
    },

    async countUnreadMessagesBySender(userId) {
      // Same predicate as listThreadsPage's unread_count; per thread it is an
      // index range scan on blumi_chat_messages(thread_id, sent_at).
      const result = await pool.query(
        `SELECT message.sender_user_id, count(*)::int AS unread_count
           FROM blumi_chat_thread_participants AS viewer
           JOIN blumi_chat_messages AS message
             ON message.thread_id = viewer.thread_id
            AND message.sender_user_id <> viewer.user_id
            AND message.sent_at > COALESCE(viewer.last_read_at, '-infinity'::timestamptz)
          WHERE viewer.user_id = $1
          GROUP BY message.sender_user_id`,
        [userId]
      )
      return result.rows.map((row) => ({ senderUserId: String(row.sender_user_id), unreadCount: Number(row.unread_count) }))
    },

    async findThread(threadId) {
      const result = await pool.query(
        `SELECT
            t.thread_id,
            t.mini_room_id,
            t.created_at,
            m.message_id AS last_message_id,
            m.sender_user_id AS last_sender_user_id,
            m.body AS last_body,
            m.sent_at AS last_sent_at,
            m.delivered_at AS last_delivered_at,
            m.read_at AS last_read_at,
            m.edited_at AS last_edited_at
           FROM blumi_chat_threads t
           LEFT JOIN blumi_chat_messages m
             ON m.message_id = t.last_message_id
          WHERE t.thread_id = $1`,
        [threadId]
      )
      return result.rows[0] ? mapThread(pool, result.rows[0]) : null
    },

    async findExistingThreadIds(threadIds) {
      if (threadIds.length === 0) return new Set<string>()
      const result = await pool.query(
        `SELECT thread_id FROM blumi_chat_threads WHERE thread_id = ANY($1::text[])`,
        [threadIds]
      )
      return new Set(result.rows.map((row) => String(row.thread_id)))
    },

    async saveThread(thread) {
      // One statement: participants are written only when this call created
      // the thread, so a concurrent or repeated save can never add or rename
      // participants of an existing thread (matches the in-memory contract).
      await pool.query(
        `WITH inserted_thread AS (
           INSERT INTO blumi_chat_threads (
             thread_id, mini_room_id, created_at, last_message_id
           ) VALUES ($1, $2, $3, $4)
           ON CONFLICT (thread_id) DO NOTHING
           RETURNING thread_id
         )
         INSERT INTO blumi_chat_thread_participants (
           thread_id, user_id, display_name, participant_order
         )
         SELECT inserted_thread.thread_id, participant.user_id,
                participant.display_name, participant.participant_order - 1
           FROM inserted_thread
          CROSS JOIN unnest($5::text[], $6::text[])
                WITH ORDINALITY AS participant(user_id, display_name, participant_order)`,
        [
          thread.threadId,
          thread.miniRoomId,
          new Date(thread.createdAt),
          thread.lastMessage?.messageId ?? null,
          thread.participants.map((participant) => participant.userId),
          thread.participants.map((participant) => participant.displayName ?? null)
        ]
      )
    },

    async listMessages(threadId, options) {
      const viewerUserId = options?.viewerUserId !== undefined && await hideSchema.isReady()
        ? options.viewerUserId
        : undefined
      const result = options
        ? await listMessagesPage(pool, threadId, options, viewerUserId)
        : await pool.query(
            `SELECT message_id, thread_id, sender_user_id, body, sent_at,
                    delivered_at, read_at, edited_at
               FROM blumi_chat_messages
              WHERE thread_id = $1
              ORDER BY sent_at ASC, message_id ASC`,
            [threadId]
          )
      return result.rows.map(mapMessage)
    },

    async findMessageByClientMessageId(threadId, senderUserId, clientMessageId) {
      const result = await pool.query(
        `SELECT message_id, thread_id, sender_user_id, body, sent_at,
                delivered_at, read_at, edited_at
           FROM blumi_chat_messages
          WHERE thread_id = $1 AND sender_user_id = $2 AND client_message_id = $3
          LIMIT 1`,
        [threadId, senderUserId, clientMessageId]
      )
      return result.rows[0] ? mapMessage(result.rows[0]) : null
    },

    async findMessage(threadId, messageId) {
      const result = await pool.query(
        `SELECT message_id, thread_id, sender_user_id, body, sent_at,
                delivered_at, read_at, edited_at
           FROM blumi_chat_messages
          WHERE thread_id = $1 AND message_id = $2
          LIMIT 1`,
        [threadId, messageId]
      )
      return result.rows[0] ? mapMessage(result.rows[0]) : null
    },

    async createMessage(message, clientMessageId) {
      const inserted = await pool.query(
        `WITH saved AS (INSERT INTO blumi_chat_messages (
            message_id, thread_id, sender_user_id, body, sent_at, client_message_id
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (thread_id, sender_user_id, client_message_id)
            WHERE client_message_id IS NOT NULL DO NOTHING
          RETURNING message_id, thread_id, sender_user_id, body, sent_at,
                    delivered_at, read_at, edited_at
         ), preview AS (
           UPDATE blumi_chat_threads AS thread
              SET last_message_id = saved.message_id, last_message_sent_at = saved.sent_at
             FROM saved
            WHERE thread.thread_id = saved.thread_id AND (
              thread.last_message_sent_at IS NULL OR
              (thread.last_message_sent_at, thread.last_message_id) <= (saved.sent_at, saved.message_id)
            ) RETURNING thread.thread_id
         ), delivery AS (
           INSERT INTO blumi_chat_delivery_outbox(message_id)
           SELECT message_id FROM saved
           RETURNING message_id
         ) SELECT saved.* FROM saved`,
        [
          message.messageId,
          message.threadId,
          message.senderUserId,
          message.body,
          new Date(message.sentAt),
          clientMessageId ?? null
        ]
      )
      if (inserted.rows[0]) {
        return { message: mapMessage(inserted.rows[0]), created: true }
      }
      if (!clientMessageId) {
        throw new Error("Chat message persistence did not return a created message.")
      }
      const existing = await pool.query(
        `WITH saved AS (SELECT message_id, thread_id, sender_user_id, body, sent_at,
                delivered_at, read_at, edited_at
           FROM blumi_chat_messages
          WHERE thread_id = $1 AND sender_user_id = $2 AND client_message_id = $3
         ), preview AS (
            UPDATE blumi_chat_threads AS thread
               SET last_message_id = saved.message_id, last_message_sent_at = saved.sent_at
             FROM saved
            WHERE thread.thread_id = saved.thread_id AND saved.body = $4 AND (
              thread.last_message_sent_at IS NULL OR
              (thread.last_message_sent_at, thread.last_message_id) <= (saved.sent_at, saved.message_id)
            ) RETURNING thread.thread_id
         ), delivery AS (
           INSERT INTO blumi_chat_delivery_outbox(message_id)
           SELECT message_id FROM saved WHERE body = $4 ON CONFLICT (message_id) DO NOTHING
           RETURNING message_id
         ) SELECT saved.* FROM saved`,
        [message.threadId, message.senderUserId, clientMessageId, message.body]
      )
      if (!existing.rows[0]) {
        throw new Error("Chat message retry could not be resolved.")
      }
      const existingMessage = mapMessage(existing.rows[0])
      return {
        message: existingMessage,
        created: false,
        ...(existingMessage.body !== message.body
          ? { idempotencyConflict: true as const }
          : {})
      }
    },

    async sendMessageChecked({ message, clientMessageId, leaseUntil }) {
      // One statement, one snapshot: the gate (thread, participants, blocks in
      // both directions by primary key), the idempotent insert, the preview,
      // the leased outbox job and the recipients' test personas. A committed
      // retry is found in the snapshot (`prior`) and gets createMessage's
      // preview and outbox repair; a concurrent first insert of the same
      // client message ID only shows up as a conflict (`raced`).
      const result = await pool.query(
        `WITH members AS (
           SELECT participant.user_id, participant.participant_order
             FROM blumi_chat_thread_participants AS participant
            WHERE participant.thread_id = $2
         ), gate AS (
           SELECT EXISTS (SELECT 1 FROM blumi_chat_threads WHERE thread_id = $2) AS thread_exists,
                  (SELECT count(*)::int FROM members) AS member_count,
                  EXISTS (SELECT 1 FROM members WHERE user_id = $3) AS is_member,
                  EXISTS (
                    SELECT 1 FROM members AS partner
                     WHERE partner.user_id <> $3 AND (
                       EXISTS (SELECT 1 FROM blumi_safety_blocks AS block
                                WHERE block.actor_user_id = $3 AND block.blocked_user_id = partner.user_id)
                       OR EXISTS (SELECT 1 FROM blumi_safety_blocks AS block
                                   WHERE block.actor_user_id = partner.user_id AND block.blocked_user_id = $3))
                  ) AS blocked
         ), allowed AS (
           SELECT 1 AS allowed FROM gate
            WHERE gate.thread_exists AND gate.member_count = 2 AND gate.is_member AND NOT gate.blocked
         ), prior AS (
           SELECT message_id, thread_id, sender_user_id, body, sent_at, delivered_at, read_at, edited_at
             FROM blumi_chat_messages
            WHERE $6::text IS NOT NULL AND thread_id = $2 AND sender_user_id = $3 AND client_message_id = $6::text
         ), saved AS (
           INSERT INTO blumi_chat_messages (
             message_id, thread_id, sender_user_id, body, sent_at, client_message_id
           )
           SELECT $1::text, $2::text, $3::text, $4::text, $5::timestamptz, $6::text FROM allowed
            WHERE NOT EXISTS (SELECT 1 FROM prior)
           ON CONFLICT (thread_id, sender_user_id, client_message_id)
             WHERE client_message_id IS NOT NULL DO NOTHING
           RETURNING message_id, thread_id, sender_user_id, body, sent_at,
                     delivered_at, read_at, edited_at
         ), repaired AS (
           SELECT prior.* FROM prior JOIN allowed ON true WHERE prior.body = $4
         ), shown AS (
           SELECT message_id, thread_id, sent_at FROM saved
           UNION ALL
           SELECT message_id, thread_id, sent_at FROM repaired
         ), preview AS (
           UPDATE blumi_chat_threads AS thread
              SET last_message_id = shown.message_id, last_message_sent_at = shown.sent_at
             FROM shown
            WHERE thread.thread_id = shown.thread_id AND (
              thread.last_message_sent_at IS NULL OR
              (thread.last_message_sent_at, thread.last_message_id) <= (shown.sent_at, shown.message_id)
            ) RETURNING thread.thread_id
         ), held AS (
           -- An undelivered earlier message of the thread (leased, in retry
           -- backoff or due) keeps this job unleased, so the inline dispatch
           -- cannot overtake it; claims take a thread's jobs in order.
           SELECT EXISTS (
             SELECT 1 FROM blumi_chat_delivery_outbox AS job
               JOIN blumi_chat_messages AS earlier USING (message_id)
              WHERE job.completed_at IS NULL AND earlier.thread_id = $2
                AND (earlier.sent_at, earlier.message_id) < ($5::timestamptz, $1::text)
           ) AS held
         ), delivery AS (
           INSERT INTO blumi_chat_delivery_outbox (message_id, available_at, attempt_count, lease_token)
           SELECT message_id,
                  CASE WHEN held.held THEN NOW() ELSE $7::timestamptz END,
                  CASE WHEN held.held THEN 0 ELSE 1 END,
                  CASE WHEN held.held THEN NULL ELSE md5(random()::text || clock_timestamp()::text) END
             FROM saved CROSS JOIN held
           RETURNING lease_token, attempt_count
         ), repaired_delivery AS (
           INSERT INTO blumi_chat_delivery_outbox (message_id)
           SELECT message_id FROM repaired ON CONFLICT (message_id) DO NOTHING
           RETURNING message_id
         )
         SELECT gate.thread_exists, gate.member_count, gate.is_member, gate.blocked,
                (SELECT array_agg(user_id ORDER BY participant_order) FROM members) AS participant_user_ids,
                saved.message_id, saved.thread_id, saved.sender_user_id, saved.body, saved.sent_at,
                saved.delivered_at, saved.read_at, saved.edited_at,
                delivery.lease_token, delivery.attempt_count,
                prior.message_id AS prior_message_id, prior.thread_id AS prior_thread_id,
                prior.sender_user_id AS prior_sender_user_id, prior.body AS prior_body,
                prior.sent_at AS prior_sent_at, prior.delivered_at AS prior_delivered_at,
                prior.read_at AS prior_read_at, prior.edited_at AS prior_edited_at,
                (SELECT json_agg(json_build_object('userId', persona.user_id, 'greeting', persona.greeting,
                                                   'replies', persona.replies) ORDER BY members.participant_order)
                   FROM blumi_test_personas AS persona
                   JOIN members ON members.user_id = persona.user_id
                  WHERE persona.user_id <> $3 AND EXISTS (SELECT 1 FROM saved)) AS recipient_personas
           FROM gate
           LEFT JOIN saved ON true
           LEFT JOIN delivery ON true
           LEFT JOIN prior ON true`,
        [
          message.messageId,
          message.threadId,
          message.senderUserId,
          message.body,
          new Date(message.sentAt),
          clientMessageId ?? null,
          leaseUntil
        ]
      )
      const row = result.rows[0]
      if (!row?.thread_exists) return { outcome: "unavailable" }
      const participantUserIds = Array.isArray(row.participant_user_ids) ? row.participant_user_ids.map(String) : []
      if (participantUserIds.length !== 2) throw new Error("Chat thread is missing participants.")
      if (!row.is_member) return { outcome: "unavailable" }
      const members = [participantUserIds[0]!, participantUserIds[1]!] as [string, string]
      const prior = row.prior_message_id ? mapMessage(withoutPrefix(row, "prior_")) : null
      if (row.blocked) return prior ? { outcome: "blocked", retryOf: prior } : { outcome: "blocked" }
      if (row.message_id) {
        return {
          outcome: "created",
          message: mapMessage(row),
          participantUserIds: members,
          ...(row.lease_token ? { job: { leaseToken: String(row.lease_token), attempt: Number(row.attempt_count) } } : {}),
          recipientPersonas: Array.isArray(row.recipient_personas)
            ? row.recipient_personas.map((persona: { userId: unknown; greeting: unknown; replies: unknown }) => ({
                userId: String(persona.userId),
                greeting: String(persona.greeting),
                replies: Array.isArray(persona.replies) ? persona.replies.map(String) : []
              }))
            : []
        }
      }
      if (prior) {
        return {
          outcome: "retried",
          message: prior,
          participantUserIds: members,
          ...(prior.body !== message.body ? { idempotencyConflict: true as const } : {})
        }
      }
      if (!clientMessageId) throw new Error("Chat message persistence did not return a created message.")
      return { outcome: "raced" }
    },

    async updateThreadLastMessage(threadId, message) {
      await pool.query(
        `UPDATE blumi_chat_threads AS thread
            SET last_message_id = $2, last_message_sent_at = $3
          WHERE thread.thread_id = $1
            AND (
              thread.last_message_id IS NULL
              OR COALESCE(
                (SELECT sent_at
                   FROM blumi_chat_messages
                  WHERE message_id = thread.last_message_id),
                '-infinity'::timestamptz
              ) <= $3
            )`,
        [threadId, message.messageId, new Date(message.sentAt)]
      )
    },

    async claimDeliveries({ now, limit, leaseMs, messageId }) {
      // available_at defaults to NOW() (microseconds); a sender's own targeted
      // claim right after commit carries a millisecond JS Date that can be
      // earlier, so it also accepts the database clock. Leases (available_at
      // in the future) still exclude claimed jobs.
      const result = await pool.query(
        `WITH due AS (
           SELECT job.message_id FROM blumi_chat_delivery_outbox AS job
             JOIN blumi_chat_messages AS message USING (message_id)
            WHERE job.completed_at IS NULL
              AND job.available_at <= CASE WHEN $4::text IS NULL THEN $1::timestamptz
                                           ELSE GREATEST($1::timestamptz, statement_timestamp()) END
              AND ($4::text IS NULL OR job.message_id = $4)
              -- Only a thread's oldest undelivered job (leased, in retry
              -- backoff or due) is claimable, so a thread is delivered in
              -- message order. Probes the partial outbox index of
              -- undelivered jobs, which stays small.
              AND NOT EXISTS (
                SELECT 1 FROM blumi_chat_delivery_outbox AS earlier_job
                  JOIN blumi_chat_messages AS earlier USING (message_id)
                 WHERE earlier_job.completed_at IS NULL
                   AND earlier.thread_id = message.thread_id
                   AND (earlier.sent_at, earlier.message_id) < (message.sent_at, message.message_id)
              )
            ORDER BY job.available_at, job.message_id FOR UPDATE OF job SKIP LOCKED LIMIT $2
         ), claimed AS (
           UPDATE blumi_chat_delivery_outbox AS job
              SET available_at = $3, attempt_count = job.attempt_count + 1,
                  lease_token = md5(random()::text || clock_timestamp()::text)
             FROM due WHERE job.message_id = due.message_id
           RETURNING job.message_id, job.lease_token, job.attempt_count
         ) SELECT message.*, claimed.lease_token, claimed.attempt_count
             FROM claimed JOIN blumi_chat_messages AS message USING(message_id)`,
        [now, limit, new Date(now.getTime() + leaseMs), messageId ?? null]
      )
      return result.rows.map((row) => ({ message: mapMessage(row), leaseToken: String(row.lease_token), attempt: Number(row.attempt_count) }))
    },
    async completeDelivery(messageId, leaseToken, now) {
      await pool.query(`UPDATE blumi_chat_delivery_outbox SET completed_at = $3
        WHERE message_id = $1 AND lease_token = $2 AND completed_at IS NULL`, [messageId, leaseToken, now])
    },
    async renewDeliveryLease(messageId, leaseToken, leaseUntil) {
      const result = await pool.query(`UPDATE blumi_chat_delivery_outbox SET available_at = $3
        WHERE message_id = $1 AND lease_token = $2 AND completed_at IS NULL RETURNING message_id`,
      [messageId, leaseToken, leaseUntil])
      return result.rows.length > 0
    },
    async retryDelivery(messageId, leaseToken, availableAt, options) {
      await pool.query(`UPDATE blumi_chat_delivery_outbox SET available_at = $3, lease_token = NULL,
          attempt_count = CASE WHEN $4 THEN GREATEST(attempt_count - 1, 0) ELSE attempt_count END
        WHERE message_id = $1 AND lease_token = $2 AND completed_at IS NULL`,
      [messageId, leaseToken, availableAt, options?.refundAttempt === true])
    },
    async deadLetterDelivery(messageId, leaseToken, now) {
      // Terminal like a completed job; the token records why (no schema change).
      await pool.query(`UPDATE blumi_chat_delivery_outbox SET completed_at = $3, lease_token = $4
        WHERE message_id = $1 AND lease_token = $2 AND completed_at IS NULL`,
      [messageId, leaseToken, now, CHAT_DELIVERY_DEAD_LETTER])
    },

    supportsHide: () => hideSchema.isReady(),

    async hideThreadForParticipant({ threadId, userId, throughMessageId }) {
      if (!await hideSchema.isReady()) throw new Error("Hiding a chat needs migration 071.")
      // One statement. GREATEST ignores NULL, so both cursors only move
      // forward. An empty thread hides through its creation. Moving
      // last_read_at keeps unread counts and the push badge free of hidden
      // messages without touching their queries; the read receipt
      // (last_read_message_id) is left alone, like any read without a message.
      const result = await pool.query(
        `WITH viewer AS (
           SELECT thread.created_at
             FROM blumi_chat_thread_participants AS participant
             JOIN blumi_chat_threads AS thread ON thread.thread_id = participant.thread_id
            WHERE participant.thread_id = $1 AND participant.user_id = $2
         ), target AS (
           SELECT CASE WHEN $3::text IS NULL
                    THEN COALESCE((SELECT max(sent_at) FROM blumi_chat_messages WHERE thread_id = $1),
                                  viewer.created_at)
                    ELSE (SELECT sent_at FROM blumi_chat_messages WHERE thread_id = $1 AND message_id = $3::text)
                  END AS through
             FROM viewer
         )
         UPDATE blumi_chat_thread_participants AS participant
            SET hidden_through = GREATEST(participant.hidden_through, target.through),
                last_read_at = GREATEST(participant.last_read_at, target.through)
           FROM target
          WHERE participant.thread_id = $1 AND participant.user_id = $2 AND target.through IS NOT NULL
         RETURNING participant.hidden_through, participant.last_read_at`,
        [threadId, userId, throughMessageId ?? null]
      )
      const row = result.rows[0]
      return row
        ? { hiddenThrough: new Date(row.hidden_through).toISOString(), readAt: new Date(row.last_read_at).toISOString() }
        : null
    }
  }
}

/**
 * `viewerUserId` is set only after 071: the page then starts after that
 * participant's hide point. Before 071 no statement names `hidden_through`.
 */
async function listMessagesPage(
  pool: QueryExecutor,
  threadId: string,
  options: ChatMessagePageOptions,
  viewerUserId: string | undefined
): Promise<{ rows: QueryResultRow[] }> {
  const visible = (parameter: number) => viewerUserId === undefined
    ? ""
    : `AND sent_at > COALESCE((SELECT hidden_through FROM blumi_chat_thread_participants
                                WHERE thread_id = $1 AND user_id = $${parameter}), '-infinity'::timestamptz)`
  const viewer = viewerUserId === undefined ? [] : [viewerUserId]
  if (options.beforeMessageId) {
    return pool.query(
      `SELECT message_id, thread_id, sender_user_id, body, sent_at,
              delivered_at, read_at, edited_at
         FROM (
           SELECT message_id, thread_id, sender_user_id, body, sent_at,
                  delivered_at, read_at, edited_at
             FROM blumi_chat_messages
            WHERE thread_id = $1
              AND (
                sent_at < COALESCE(
                  (
                    SELECT sent_at
                      FROM blumi_chat_messages
                     WHERE thread_id = $1 AND message_id = $2
                  ),
                  'infinity'::timestamptz
                )
                OR (
                  sent_at = (
                    SELECT sent_at
                      FROM blumi_chat_messages
                     WHERE thread_id = $1 AND message_id = $2
                  )
                  AND message_id < $2
                )
              )
              ${visible(4)}
            ORDER BY sent_at DESC, message_id DESC
            LIMIT $3
         ) page
        ORDER BY sent_at ASC, message_id ASC`,
      [threadId, options.beforeMessageId, options.limit, ...viewer]
    )
  }

  return pool.query(
    `SELECT message_id, thread_id, sender_user_id, body, sent_at,
            delivered_at, read_at, edited_at
       FROM (
         SELECT message_id, thread_id, sender_user_id, body, sent_at,
                delivered_at, read_at, edited_at
           FROM blumi_chat_messages
          WHERE thread_id = $1
            ${visible(3)}
          ORDER BY sent_at DESC, message_id DESC
          LIMIT $2
       ) page
      ORDER BY sent_at ASC, message_id ASC`,
    [threadId, options.limit, ...viewer]
  )
}

async function mapThread(
  pool: QueryExecutor,
  row: QueryResultRow,
  loadedParticipants?: ChatThread["participants"]
): Promise<ChatThread> {
  const participants = loadedParticipants ?? await loadParticipants(pool, String(row.thread_id))
  return {
    threadId: String(row.thread_id),
    miniRoomId: String(row.mini_room_id),
    participantUserIds: [
      participants[0].userId,
      participants[1].userId
    ],
    participants,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.last_message_id
      ? {
          lastMessage: {
            messageId: String(row.last_message_id),
            threadId: String(row.thread_id),
            senderUserId: String(row.last_sender_user_id),
            body: String(row.last_body),
            sentAt: new Date(row.last_sent_at).toISOString(),
            ...optionalMessageMetadata({
              delivered_at: row.last_delivered_at,
              read_at: row.last_read_at,
              edited_at: row.last_edited_at
            })
          }
        }
      : {})
  }
}

async function loadParticipants(
  pool: QueryExecutor,
  threadId: string
): Promise<ChatThread["participants"]> {
  const result = await pool.query(
    `SELECT participant.user_id, participant.display_name,
            account.avatar_preset_id, account.avatar_selection, account.avatar_revision
       FROM blumi_chat_thread_participants AS participant
       LEFT JOIN blumi_accounts AS account
         ON account.user_id = participant.user_id
      WHERE participant.thread_id = $1
      ORDER BY participant.participant_order ASC`,
    [threadId]
  )
  if (result.rows.length !== 2) {
    throw new Error("Chat thread is missing participants.")
  }
  return [
    mapParticipant(result.rows[0]),
    mapParticipant(result.rows[1])
  ]
}

function mapParticipant(
  row: QueryResultRow
): ChatThread["participants"][number] {
  const avatar = readOptionalParticipantAvatar(row)
  return {
    userId: String(row.user_id),
    ...(row.display_name ? { displayName: String(row.display_name) } : {}),
    ...(avatar ? { avatar } : {})
  }
}

function readOptionalParticipantAvatar(
  row: QueryResultRow
): ChatThread["participants"][number]["avatar"] {
  if (
    row.avatar_preset_id === null ||
    row.avatar_selection === null ||
    row.avatar_revision === null
  ) {
    return undefined
  }
  try {
    return normalizeStoredAvatarSelection({
      presetId: row.avatar_preset_id,
      loadout: row.avatar_selection,
      revision: row.avatar_revision
    })
  } catch {
    // Display metadata is optional: malformed legacy data must not block chat.
    return undefined
  }
}

function withoutPrefix(row: QueryResultRow, prefix: string): QueryResultRow {
  const stripped: QueryResultRow = {}
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith(prefix)) stripped[key.slice(prefix.length)] = value
  }
  return stripped
}

function mapMessage(row: QueryResultRow): ChatMessage {
  return {
    messageId: String(row.message_id),
    threadId: String(row.thread_id),
    senderUserId: String(row.sender_user_id),
    body: String(row.body),
    sentAt: new Date(row.sent_at).toISOString(),
    ...optionalMessageMetadata(row)
  }
}

function optionalMessageMetadata(row: QueryResultRow): Pick<
  ChatMessage,
  "deliveredAt" | "readAt" | "editedAt"
> {
  return {
    ...(row.delivered_at
      ? { deliveredAt: new Date(row.delivered_at).toISOString() }
      : {}),
    ...(row.read_at ? { readAt: new Date(row.read_at).toISOString() } : {}),
    ...(row.edited_at
      ? { editedAt: new Date(row.edited_at).toISOString() }
      : {})
  }
}

/**
 * Seeded test personas (migration 060) change only when QA seeds staging,
 * so the set of their user IDs is read at most once per TTL. A persona
 * seeded meanwhile is recognised after the TTL; a failed refresh answers
 * "maybe" so the caller falls back to the exact per-user query.
 */
export const TEST_PERSONA_CACHE_TTL_MS = 60_000

function createTestPersonaIdCache(pool: QueryExecutor, ttlMs: number): { mayContain(userId: string): Promise<boolean> } {
  let cached: { ids: ReadonlySet<string>; expiresAt: number } | null = null
  let loading: Promise<ReadonlySet<string> | null> | null = null
  const load = async (): Promise<ReadonlySet<string> | null> => {
    try {
      const result = await pool.query("SELECT user_id FROM blumi_test_personas")
      const ids = new Set(result.rows.map((row) => String(row.user_id)))
      cached = { ids, expiresAt: Date.now() + ttlMs }
      return ids
    } catch {
      return null
    } finally {
      loading = null
    }
  }
  return {
    async mayContain(userId) {
      if (ttlMs <= 0) return true
      const ids = cached && cached.expiresAt > Date.now() ? cached.ids : await (loading ??= load())
      return ids === null || ids.has(userId)
    }
  }
}
