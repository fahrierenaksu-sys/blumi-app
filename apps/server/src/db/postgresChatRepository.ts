import type { ChatMessage, ChatThread } from "@blumi/contracts"
import type { QueryResultRow } from "pg"
import type {
  ChatMessagePageOptions,
  ChatRepository
} from "../chat/chatRepository"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import { normalizeThreadPage, encodeThreadCursor } from "../chat/chatThreadPagination"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresChatRepository(
  pool: QueryExecutor
): ChatRepository {
  return {
    async listThreads(userId) {
      return (await this.listThreadsPage(userId)).threads
    },
    async listThreadsPage(userId, options) {
      const { limit, cursor } = normalizeThreadPage(userId, options)
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
      const threads = await Promise.all(rows.map(async (row) => {
        const participants = participantRows.rows.filter((participant) => participant.thread_id === row.thread_id).map(mapParticipant)
        if (participants.length !== 2) throw new Error("Chat thread is missing participants.")
        return { ...await mapThread(pool, row, [participants[0], participants[1]]),
          unreadCount: Number(row.unread_count ?? 0),
          ...(row.viewer_last_read_at ? { lastReadAt: new Date(row.viewer_last_read_at).toISOString() } : {}) }
      }))
      const last = threads.at(-1)!
      return { threads, nextCursor: result.rows.length > limit ? encodeThreadCursor({ userId, threadId: last.threadId, createdAt: String(rows.at(-1)?.cursor_created_at ?? last.createdAt) }) : null }
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

    async saveThread(thread) {
      await pool.query(
        `INSERT INTO blumi_chat_threads (
            thread_id, mini_room_id, created_at, last_message_id
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (thread_id) DO UPDATE SET
            mini_room_id = EXCLUDED.mini_room_id,
            last_message_id = EXCLUDED.last_message_id`,
        [
          thread.threadId,
          thread.miniRoomId,
          new Date(thread.createdAt),
          thread.lastMessage?.messageId ?? null
        ]
      )

      await Promise.all(
        thread.participants.map((participant, index) =>
          pool.query(
            `INSERT INTO blumi_chat_thread_participants (
                thread_id, user_id, display_name, participant_order
              ) VALUES ($1, $2, $3, $4)
              ON CONFLICT (thread_id, user_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                participant_order = EXCLUDED.participant_order`,
            [
              thread.threadId,
              participant.userId,
              participant.displayName ?? null,
              index
            ]
          )
        )
      )
    },

    async listMessages(threadId, options) {
      const result = options
        ? await listMessagesPage(pool, threadId, options)
        : await pool.query(
            `SELECT message_id, thread_id, sender_user_id, body, sent_at,
                    delivered_at, read_at, edited_at
               FROM blumi_chat_messages
              WHERE thread_id = $1
              ORDER BY sent_at ASC`,
            [threadId]
          )
      return result.rows.map(mapMessage)
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
            WHERE thread.thread_id = saved.thread_id AND (
              thread.last_message_sent_at IS NULL OR
              (thread.last_message_sent_at, thread.last_message_id) <= (saved.sent_at, saved.message_id)
            ) RETURNING thread.thread_id
         ), delivery AS (
           INSERT INTO blumi_chat_delivery_outbox(message_id)
           SELECT message_id FROM saved ON CONFLICT (message_id) DO NOTHING
           RETURNING message_id
         ) SELECT saved.* FROM saved`,
        [message.threadId, message.senderUserId, clientMessageId]
      )
      if (!existing.rows[0]) {
        throw new Error("Chat message retry could not be resolved.")
      }
      return { message: mapMessage(existing.rows[0]), created: false }
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

    async markThreadRead(threadId, userId, readAt) {
      await pool.query(
        `UPDATE blumi_chat_thread_participants
            SET last_read_at = GREATEST(last_read_at, $3::timestamptz)
          WHERE thread_id = $1 AND user_id = $2`,
        [threadId, userId, new Date(readAt)]
      )
    },
    async claimDeliveries({ now, limit, leaseMs, messageId }) {
      const result = await pool.query(
        `WITH due AS (
           SELECT message_id FROM blumi_chat_delivery_outbox
            WHERE completed_at IS NULL AND available_at <= $1
              AND ($4::text IS NULL OR message_id = $4)
            ORDER BY available_at, message_id FOR UPDATE SKIP LOCKED LIMIT $2
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
    async retryDelivery(messageId, leaseToken, availableAt) {
      await pool.query(`UPDATE blumi_chat_delivery_outbox SET available_at = $3, lease_token = NULL
        WHERE message_id = $1 AND lease_token = $2 AND completed_at IS NULL`, [messageId, leaseToken, availableAt])
    }
  }
}

async function listMessagesPage(
  pool: QueryExecutor,
  threadId: string,
  options: ChatMessagePageOptions
): Promise<{ rows: QueryResultRow[] }> {
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
            ORDER BY sent_at DESC, message_id DESC
            LIMIT $3
         ) page
        ORDER BY sent_at ASC, message_id ASC`,
      [threadId, options.beforeMessageId, options.limit]
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
          ORDER BY sent_at DESC, message_id DESC
          LIMIT $2
       ) page
      ORDER BY sent_at ASC, message_id ASC`,
    [threadId, options.limit]
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
