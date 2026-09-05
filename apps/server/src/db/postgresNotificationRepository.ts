import type { QueryResultRow } from "pg"
import { randomUUID } from "node:crypto"
import { discoveryWatchLockSql } from "./discoveryWatchLock"
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../notifications/notificationRepository"
import type {
  DeviceRegistration,
  NotificationPolicyAudit,
  NotificationPolicyDecision,
  NotificationPreferences,
  NotificationRepository,
  NotificationValueType,
  PushDelivery,
  PushDeliveryAudit,
  PendingPushReceipt,
  PushReceiptResult
} from "../notifications/notificationRepository"

interface QueryConnection {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}
interface QueryExecutor extends QueryConnection {
  connect?: () => Promise<QueryConnection & { release(): void }>
}

export function createPostgresNotificationRepository(
  pool: QueryExecutor
): NotificationRepository {
  return {
    async withAuthorizedDelivery(delivery, now, send) {
      if (!pool.connect) throw new Error("Dispatch authorization requires a dedicated database connection.")
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        if (delivery.notification.data?.type === "discovery.watch_match" && !delivery.discoveryWatch) {
          await client.query("COMMIT")
          return { authorized: false }
        }
        if (delivery.discoveryWatch) {
          await client.query(discoveryWatchLockSql, [delivery.userId])
          const watch = await client.query(`SELECT user_id FROM blumi_discovery_watches
            WHERE user_id = $1 AND generation = $2 AND completed_at IS NOT NULL
              AND cancelled_at IS NULL AND expires_at > $3 FOR UPDATE`, [delivery.userId, delivery.discoveryWatch.generation, now])
          if (!watch.rows.length) { await client.query("COMMIT"); return { authorized: false } }
        }
        // Keep ownership and watch locks until the bounded provider call finishes.
        // Cancellation that wins these locks prevents admission; accepted pushes cannot be recalled.
        const device = await client.query(`SELECT registration_id FROM blumi_push_devices
          WHERE user_id = $1 AND push_token = $2 AND registration_id = $3 FOR SHARE`,
        [delivery.userId, delivery.pushToken, delivery.registrationId ?? null])
        const row = await client.query(`SELECT delivery_id FROM blumi_push_delivery_outbox
          WHERE delivery_id = $1 AND lease_token = $2 FOR UPDATE`, [delivery.deliveryId, delivery.leaseToken ?? null])
        if (!device.rows.length || !row.rows.length) { await client.query("COMMIT"); return { authorized: false } }
        const value = await send()
        await client.query("COMMIT")
        return { authorized: true, value }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally { client.release() }
    },
    async claimDueReceipts({ now, limit, leaseMs }) {
      const result = await pool.query(`WITH due AS (
        SELECT ticket_id FROM blumi_push_receipts WHERE outcome IS NULL AND available_at <= $1
        ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT $2
      ) UPDATE blumi_push_receipts AS receipts SET available_at = $3,
        lease_token = md5(random()::text || clock_timestamp()::text)
        FROM due WHERE receipts.ticket_id = due.ticket_id RETURNING receipts.*`,
      [now, limit, new Date(now.getTime() + leaseMs)])
      return result.rows.map((row): PendingPushReceipt => ({
        ticketId: String(row.ticket_id), deliveryId: String(row.delivery_id), userId: String(row.user_id),
        pushToken: String(row.push_token), registrationId: String(row.registration_id),
        createdAt: new Date(row.created_at).toISOString(), availableAt: new Date(row.available_at).toISOString(),
        leaseToken: String(row.lease_token)
      }))
    },
    async finishReceipt({ ticketId, leaseToken, outcome, errorCode }) {
      await pool.query(`UPDATE blumi_push_receipts SET outcome = $3, error_code = $4, lease_token = NULL,
        user_id = '', push_token = '', registration_id = ''
        WHERE ticket_id = $1 AND lease_token = $2 AND outcome IS NULL`, [ticketId, leaseToken, outcome, errorCode ?? null])
    },
    async retryReceipt({ ticketId, leaseToken, availableAt }) {
      await pool.query(`UPDATE blumi_push_receipts SET available_at = $3, lease_token = NULL
        WHERE ticket_id = $1 AND lease_token = $2 AND outcome IS NULL`, [ticketId, leaseToken, availableAt])
    },
    async listReceiptResults() {
      const result = await pool.query("SELECT ticket_id, outcome, error_code FROM blumi_push_receipts WHERE outcome IS NOT NULL ORDER BY created_at")
      return result.rows.map((row): PushReceiptResult => ({ ticketId: String(row.ticket_id), outcome: row.outcome,
        ...(row.error_code ? { errorCode: String(row.error_code) } : {}) }))
    },
    async removeDeviceRegistration({ userId, pushToken, registrationId }) {
      await pool.query(`WITH removed AS (
        DELETE FROM blumi_push_devices WHERE user_id = $1 AND push_token = $2 AND registration_id = $3 RETURNING push_token
      ) DELETE FROM blumi_push_delivery_outbox WHERE user_id = $1 AND push_token IN (SELECT push_token FROM removed) AND registration_id = $3`,
      [userId, pushToken, registrationId])
    },
    async listDevices(userId) {
      const result = await pool.query(
        `SELECT user_id, platform, push_token, registered_at, registration_id
           FROM blumi_push_devices
          WHERE user_id = $1
          ORDER BY registered_at DESC`,
        [userId]
      )
      return result.rows.map(mapDevice)
    },
    async saveDevice(device) {
      await pool.query(
        `INSERT INTO blumi_push_devices (
            user_id, platform, push_token, registered_at, registration_id
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (push_token) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            platform = EXCLUDED.platform,
            registered_at = EXCLUDED.registered_at,
            registration_id = CASE
              WHEN blumi_push_devices.user_id = EXCLUDED.user_id THEN blumi_push_devices.registration_id
              ELSE EXCLUDED.registration_id END`,
        [
          device.userId,
          device.platform,
          device.pushToken,
          new Date(device.registeredAt),
          device.registrationId ?? randomUUID()
        ]
      )
    },
    async removeDevice(userId, pushToken) {
      await pool.query(
        `WITH removed AS (
           DELETE FROM blumi_push_devices WHERE user_id = $1 AND push_token = $2 RETURNING push_token
         ) DELETE FROM blumi_push_delivery_outbox WHERE user_id = $1 AND push_token IN (SELECT push_token FROM removed)`,
        [userId, pushToken]
      )
    },
    async removeAllDevices(userId) {
      await pool.query(
        `WITH removed AS (
           DELETE FROM blumi_push_devices WHERE user_id = $1 RETURNING push_token
         ) DELETE FROM blumi_push_delivery_outbox WHERE user_id = $1 AND push_token IN (SELECT push_token FROM removed)`,
        [userId]
      )
    },
    async getPreferences(userId) {
      const result = await pool.query(
        `SELECT likes_enabled, messages_enabled, matches_enabled,
                discovery_watch_enabled, quiet_hours_start, quiet_hours_end,
                quiet_hours_utc_offset_minutes, max_pushes_per_hour, quiet_hours_time_zone
           FROM blumi_notification_preferences
          WHERE user_id = $1`,
        [userId]
      )
      return result.rows[0]
        ? mapPreferences(result.rows[0])
        : { ...DEFAULT_NOTIFICATION_PREFERENCES }
    },
    async savePreferences(userId, preferences, fields) {
      const columns: Record<keyof NotificationPreferences, readonly string[]> = {
        likesEnabled: ["likes_enabled"], messagesEnabled: ["messages_enabled"], matchesEnabled: ["matches_enabled"],
        discoveryWatchEnabled: ["discovery_watch_enabled"], quietHours: ["quiet_hours_start", "quiet_hours_end"],
        quietHoursUtcOffsetMinutes: ["quiet_hours_utc_offset_minutes"], quietHoursTimeZone: ["quiet_hours_time_zone"],
        maxPushesPerHour: ["max_pushes_per_hour"]
      }
      const assignments = (fields ?? Object.keys(columns) as (keyof NotificationPreferences)[])
        .flatMap((key) => columns[key] ?? []).map((column) => `${column} = EXCLUDED.${column}`)
      await pool.query(
        `INSERT INTO blumi_notification_preferences (
            user_id, likes_enabled, messages_enabled, matches_enabled,
            discovery_watch_enabled, quiet_hours_start, quiet_hours_end,
            quiet_hours_utc_offset_minutes, max_pushes_per_hour, updated_at, quiet_hours_time_zone
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)
          ON CONFLICT (user_id) DO UPDATE SET
            ${assignments.length ? `${assignments.join(", ")},` : ""}
            updated_at = EXCLUDED.updated_at`,
        [
          userId,
          preferences.likesEnabled,
          preferences.messagesEnabled,
          preferences.matchesEnabled,
          preferences.discoveryWatchEnabled,
          preferences.quietHours?.startMinute ?? null,
          preferences.quietHours?.endMinute ?? null,
          preferences.quietHoursUtcOffsetMinutes,
          preferences.maxPushesPerHour,
          preferences.quietHoursTimeZone ?? null
        ]
      )
    },
    async claimPolicyDecision({ userId, notificationType, dedupeKey, now }) {
      const result = await pool.query(
        `WITH account_lock AS MATERIALIZED (
           SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
         ), preference AS (
           INSERT INTO blumi_notification_preferences (user_id)
           SELECT $1 FROM account_lock
           ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
           RETURNING likes_enabled, messages_enabled, matches_enabled,
                     discovery_watch_enabled, quiet_hours_start, quiet_hours_end,
                     quiet_hours_utc_offset_minutes, max_pushes_per_hour, quiet_hours_time_zone
         ), clock AS (
           SELECT preference.*,
                  (EXTRACT(HOUR FROM (($4::timestamptz AT TIME ZONE COALESCE(preference.quiet_hours_time_zone, 'UTC')) +
                    CASE WHEN preference.quiet_hours_time_zone IS NULL THEN preference.quiet_hours_utc_offset_minutes ELSE 0 END * INTERVAL '1 minute'))::integer * 60 +
                   EXTRACT(MINUTE FROM (($4::timestamptz AT TIME ZONE COALESCE(preference.quiet_hours_time_zone, 'UTC')) +
                    CASE WHEN preference.quiet_hours_time_zone IS NULL THEN preference.quiet_hours_utc_offset_minutes ELSE 0 END * INTERVAL '1 minute'))::integer) AS local_minute
             FROM preference
         ), gate AS (
           SELECT CASE
             WHEN ($2 = 'like' AND NOT likes_enabled)
               OR ($2 = 'message' AND NOT messages_enabled)
               OR ($2 = 'match' AND NOT matches_enabled)
               OR ($2 = 'discovery_watch' AND NOT discovery_watch_enabled)
               THEN 'disabled'
             WHEN quiet_hours_start IS NOT NULL AND (
               (quiet_hours_start < quiet_hours_end AND local_minute >= quiet_hours_start AND local_minute < quiet_hours_end)
               OR (quiet_hours_start > quiet_hours_end AND (local_minute >= quiet_hours_start OR local_minute < quiet_hours_end))
             ) THEN 'quiet_hours'
             WHEN EXISTS (
               SELECT 1 FROM blumi_notification_policy_events
                WHERE user_id = $1 AND notification_type = $2 AND dedupe_key = $3
             ) THEN 'duplicate'
             WHEN (
               SELECT count(*) FROM blumi_notification_policy_events
                WHERE user_id = $1 AND created_at > $4::timestamptz - INTERVAL '1 hour'
             ) >= max_pushes_per_hour THEN 'frequency_cap'
             ELSE 'queued'
           END AS reason
             FROM clock
         ), queued AS (
           INSERT INTO blumi_notification_policy_events (
             user_id, notification_type, dedupe_key, created_at
           )
           SELECT $1, $2, $3, $4 FROM gate WHERE reason = 'queued'
           ON CONFLICT (user_id, notification_type, dedupe_key) DO NOTHING
           RETURNING event_id
         ), resolved AS (
           SELECT CASE
             WHEN gate.reason <> 'queued' THEN gate.reason
             WHEN EXISTS (SELECT 1 FROM queued) THEN 'queued'
             ELSE 'duplicate'
           END AS reason
             FROM gate
         )
         INSERT INTO blumi_notification_policy_audit (
           user_id, notification_type, reason, dedupe_key, occurred_at
         )
         SELECT $1, $2, reason, $3, $4 FROM resolved
         RETURNING reason`,
        [userId, notificationType, dedupeKey, now]
      )
      const reason = String(result.rows[0]?.reason ?? "duplicate")
      if (!isPolicyReason(reason)) throw new Error("Invalid notification policy outcome.")
      return { allowed: reason === "queued", reason }
    },
    async claimPolicyAndEnqueueDeliveries({
      userId,
      notificationType,
      dedupeKey,
      now,
      deliveries,
      discoveryWatch
    }) {
      if (discoveryWatch) {
        if (!pool.connect) throw new Error("Discovery Watch enqueue requires a dedicated database connection.")
        const client = await pool.connect()
        try {
          await client.query("BEGIN")
          await client.query(discoveryWatchLockSql, [userId])
          const current = await client.query(`SELECT user_id FROM blumi_discovery_watches
            WHERE user_id = $1 AND generation = $2 AND claim_token = $3
              AND lease_until > $4 AND expires_at > $4 AND completed_at IS NULL AND cancelled_at IS NULL FOR UPDATE`,
          [userId, discoveryWatch.generation, discoveryWatch.claimToken, now])
          if (!current.rows.length) {
            await client.query("COMMIT")
            return { allowed: false, reason: "stale_watch", deliveryCount: 0 }
          }
          const decision = await createPostgresNotificationRepository(client).claimPolicyAndEnqueueDeliveries({
            userId, notificationType, dedupeKey, now, deliveries
          })
          if (decision.allowed) await client.query(`UPDATE blumi_discovery_watches
            SET completed_at = $3, claim_token = NULL, lease_until = NULL WHERE user_id = $1 AND generation = $2`,
          [userId, discoveryWatch.generation, now])
          await client.query("COMMIT")
          return decision
        } catch (error) {
          await client.query("ROLLBACK")
          throw error
        } finally { client.release() }
      }
      if (deliveries.length === 0) {
        throw new Error("Policy deliveries must not be empty.")
      }
      const result = await pool.query(
        `WITH account_lock AS MATERIALIZED (
           SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
         ), preference AS (
           INSERT INTO blumi_notification_preferences (user_id)
           SELECT $1 FROM account_lock
           ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
           RETURNING likes_enabled, messages_enabled, matches_enabled,
                     discovery_watch_enabled, quiet_hours_start, quiet_hours_end,
                     quiet_hours_utc_offset_minutes, max_pushes_per_hour, quiet_hours_time_zone
         ), clock AS (
           SELECT preference.*,
                  (EXTRACT(HOUR FROM (($4::timestamptz AT TIME ZONE COALESCE(preference.quiet_hours_time_zone, 'UTC')) +
                    CASE WHEN preference.quiet_hours_time_zone IS NULL THEN preference.quiet_hours_utc_offset_minutes ELSE 0 END * INTERVAL '1 minute'))::integer * 60 +
                   EXTRACT(MINUTE FROM (($4::timestamptz AT TIME ZONE COALESCE(preference.quiet_hours_time_zone, 'UTC')) +
                    CASE WHEN preference.quiet_hours_time_zone IS NULL THEN preference.quiet_hours_utc_offset_minutes ELSE 0 END * INTERVAL '1 minute'))::integer) AS local_minute
             FROM preference
         ), gate AS (
           SELECT CASE
             WHEN ($2 = 'like' AND NOT likes_enabled)
               OR ($2 = 'message' AND NOT messages_enabled)
               OR ($2 = 'match' AND NOT matches_enabled)
               OR ($2 = 'discovery_watch' AND NOT discovery_watch_enabled)
               THEN 'disabled'
             WHEN quiet_hours_start IS NOT NULL AND (
               (quiet_hours_start < quiet_hours_end AND local_minute >= quiet_hours_start AND local_minute < quiet_hours_end)
               OR (quiet_hours_start > quiet_hours_end AND (local_minute >= quiet_hours_start OR local_minute < quiet_hours_end))
             ) THEN 'quiet_hours'
             WHEN EXISTS (
               SELECT 1 FROM blumi_notification_policy_events
                WHERE user_id = $1 AND notification_type = $2 AND dedupe_key = $3
             ) THEN 'duplicate'
             WHEN (
               SELECT count(*) FROM blumi_notification_policy_events
                WHERE user_id = $1 AND created_at > $4::timestamptz - INTERVAL '1 hour'
             ) >= max_pushes_per_hour THEN 'frequency_cap'
             ELSE 'queued'
           END AS reason
             FROM clock
         ), queued_policy AS (
           INSERT INTO blumi_notification_policy_events (
             user_id, notification_type, dedupe_key, created_at
           )
           SELECT $1, $2, $3, $4 FROM gate WHERE reason = 'queued'
           ON CONFLICT (user_id, notification_type, dedupe_key) DO NOTHING
           RETURNING event_id
         ), resolved AS (
           SELECT CASE
             WHEN gate.reason <> 'queued' THEN gate.reason
             WHEN EXISTS (SELECT 1 FROM queued_policy) THEN 'queued'
             ELSE 'duplicate'
           END AS reason
             FROM gate
         ), deliveries AS (
           INSERT INTO blumi_push_delivery_outbox (
             delivery_id, user_id, push_token, title, body, data,
             attempt_count, available_at, created_at, registration_id, discovery_watch_generation
           )
           SELECT delivery.delivery_id, delivery.user_id, delivery.push_token,
                  delivery.title, delivery.body, delivery.data,
                  delivery.attempt_count, delivery.available_at, delivery.created_at, delivery.registration_id, delivery.discovery_watch_generation
             FROM jsonb_to_recordset($5::jsonb) AS delivery(
               delivery_id TEXT, user_id TEXT, push_token TEXT, title TEXT,
               body TEXT, data JSONB, attempt_count INTEGER,
               available_at TIMESTAMPTZ, created_at TIMESTAMPTZ, registration_id TEXT, discovery_watch_generation TEXT
             )
             CROSS JOIN resolved
            WHERE resolved.reason = 'queued'
           RETURNING delivery_id
         ), audited AS (
           INSERT INTO blumi_notification_policy_audit (
             user_id, notification_type, reason, dedupe_key, occurred_at
           )
           SELECT $1, $2, reason, $3, $4 FROM resolved
           RETURNING reason
         )
         SELECT (SELECT reason FROM audited) AS reason,
                count(deliveries.delivery_id)::integer AS delivery_count
           FROM deliveries`,
        [
          userId,
          notificationType,
          dedupeKey,
          now,
          JSON.stringify(deliveries.map((delivery) => ({
            delivery_id: delivery.deliveryId,
            user_id: delivery.userId,
            push_token: delivery.pushToken,
            registration_id: delivery.registrationId ?? null,
            discovery_watch_generation: delivery.discoveryWatch?.generation ?? null,
            title: delivery.notification.title,
            body: delivery.notification.body,
            data: delivery.notification.data ?? {},
            attempt_count: delivery.attemptCount,
            available_at: delivery.availableAt,
            created_at: delivery.createdAt
          })))
        ]
      )
      const reason = String(result.rows[0]?.reason ?? "duplicate")
      if (!isPolicyReason(reason)) throw new Error("Invalid notification policy outcome.")
      return {
        allowed: reason === "queued",
        reason,
        deliveryCount: Number(result.rows[0]?.delivery_count ?? 0)
      }
    },
    async enqueueDelivery(delivery) {
      await pool.query(
        `INSERT INTO blumi_push_delivery_outbox (
            delivery_id, user_id, push_token, title, body, data,
            attempt_count, available_at, created_at, registration_id
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
        [
          delivery.deliveryId,
          delivery.userId,
          delivery.pushToken,
          delivery.notification.title,
          delivery.notification.body,
          JSON.stringify(delivery.notification.data ?? {}),
          delivery.attemptCount,
          new Date(delivery.availableAt),
          new Date(delivery.createdAt),
          delivery.registrationId ?? null
        ]
      )
    },
    async claimDueDeliveries({ now, limit, leaseMs }) {
      const leaseUntil = new Date(now.getTime() + leaseMs)
      const result = await pool.query(
        `WITH due AS (
           SELECT delivery_id
             FROM blumi_push_delivery_outbox
            WHERE available_at <= $1
            ORDER BY available_at ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         ), claimed AS (
           UPDATE blumi_push_delivery_outbox AS outbox
              SET available_at = $3,
                  lease_token = md5(random()::text || clock_timestamp()::text)
             FROM due
            WHERE outbox.delivery_id = due.delivery_id
          RETURNING outbox.delivery_id, outbox.user_id, outbox.push_token,
                    outbox.title, outbox.body, outbox.data, outbox.attempt_count,
                    outbox.available_at, outbox.created_at, outbox.lease_token, outbox.registration_id, outbox.discovery_watch_generation
         )
         SELECT * FROM claimed`,
        [now, limit, leaseUntil]
      )
      return result.rows.map(mapDelivery)
    },
    async markDeliverySent({ deliveryId, leaseToken, attempt, now, ticketId }) {
      await pool.query(
        `WITH removed AS (
           DELETE FROM blumi_push_delivery_outbox
            WHERE delivery_id = $1 AND lease_token = $2
          RETURNING *
         ), receipt AS (
           INSERT INTO blumi_push_receipts(ticket_id, delivery_id, user_id, push_token, registration_id, created_at, available_at)
           SELECT $5, delivery_id, user_id, push_token, registration_id, $4, $4::timestamptz + INTERVAL '15 minutes'
           FROM removed WHERE $5::text IS NOT NULL AND registration_id IS NOT NULL
           ON CONFLICT(ticket_id) DO NOTHING
         )
         INSERT INTO blumi_push_delivery_audit (
           delivery_id, attempt, outcome, occurred_at
         )
         SELECT delivery_id, $3, 'sent', $4 FROM removed`,
        [deliveryId, leaseToken, attempt, now, ticketId ?? null]
      )
    },
    async markDeliveryRetry({ deliveryId, leaseToken, attempt, availableAt, now, errorCode }) {
      await pool.query(
        `WITH updated AS (
           UPDATE blumi_push_delivery_outbox
              SET attempt_count = $3,
                  available_at = $4,
                  lease_token = NULL
            WHERE delivery_id = $1 AND lease_token = $2
          RETURNING delivery_id
         )
         INSERT INTO blumi_push_delivery_audit (
           delivery_id, attempt, outcome, occurred_at, error_code
         )
         SELECT delivery_id, $3, 'retry_scheduled', $5, $6 FROM updated`,
        [deliveryId, leaseToken, attempt, availableAt, now, errorCode]
      )
    },
    async markDeliveryFailed({ deliveryId, leaseToken, attempt, now, errorCode }) {
      await pool.query(
        `WITH removed AS (
           DELETE FROM blumi_push_delivery_outbox
            WHERE delivery_id = $1 AND lease_token = $2
          RETURNING delivery_id
         )
         INSERT INTO blumi_push_delivery_audit (
           delivery_id, attempt, outcome, occurred_at, error_code
         )
         SELECT delivery_id, $3, 'failed_permanently', $4, $5 FROM removed`,
        [deliveryId, leaseToken, attempt, now, errorCode]
      )
    },
    async listPendingDeliveries() {
      const result = await pool.query(
        `SELECT delivery_id, user_id, push_token, title, body, data,
                attempt_count, available_at, created_at, lease_token, registration_id, discovery_watch_generation
           FROM blumi_push_delivery_outbox
          ORDER BY created_at ASC`
      )
      return result.rows.map(mapDelivery)
    },
    async listDeliveryAudits() {
      const result = await pool.query(
        `SELECT delivery_id, attempt, outcome, occurred_at, error_code
           FROM blumi_push_delivery_audit
          ORDER BY audit_id ASC`
      )
      return result.rows.map(mapAudit)
    },
    async listPolicyAudits() {
      const result = await pool.query(
        `SELECT user_id, notification_type, reason, dedupe_key, occurred_at
           FROM blumi_notification_policy_audit
          ORDER BY audit_id ASC`
      )
      return result.rows.map(mapPolicyAudit)
    }
  }
}

function mapDelivery(row: QueryResultRow): PushDelivery {
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data)
    ? Object.fromEntries(Object.entries(row.data).filter(([, value]) => typeof value === "string")) as Record<string, string>
    : undefined
  return {
    deliveryId: String(row.delivery_id),
    ...(row.discovery_watch_generation ? { discoveryWatch: { generation: String(row.discovery_watch_generation) } } : {}),
    ...(row.registration_id ? { registrationId: String(row.registration_id) } : {}),
    userId: String(row.user_id),
    pushToken: String(row.push_token),
    notification: {
      title: String(row.title),
      body: String(row.body),
      ...(data && Object.keys(data).length > 0 ? { data } : {})
    },
    attemptCount: Number(row.attempt_count),
    availableAt: new Date(row.available_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.lease_token ? { leaseToken: String(row.lease_token) } : {})
  }
}

function mapAudit(row: QueryResultRow): PushDeliveryAudit {
  const outcome = String(row.outcome)
  if (outcome !== "sent" && outcome !== "retry_scheduled" && outcome !== "failed_permanently") {
    throw new Error("Invalid push delivery audit outcome.")
  }
  return {
    deliveryId: String(row.delivery_id),
    attempt: Number(row.attempt),
    outcome,
    occurredAt: new Date(row.occurred_at).toISOString(),
    ...(row.error_code ? { errorCode: String(row.error_code) } : {})
  }
}

function mapDevice(row: QueryResultRow): DeviceRegistration {
  return {
    ...(row.registration_id ? { registrationId: String(row.registration_id) } : {}),
    userId: String(row.user_id),
    platform: String(row.platform) as DeviceRegistration["platform"],
    pushToken: String(row.push_token),
    registeredAt: new Date(row.registered_at).toISOString()
  }
}

function mapPreferences(row: QueryResultRow): NotificationPreferences {
  const start = row.quiet_hours_start === null || row.quiet_hours_start === undefined
    ? null
    : Number(row.quiet_hours_start)
  const end = row.quiet_hours_end === null || row.quiet_hours_end === undefined
    ? null
    : Number(row.quiet_hours_end)
  return {
    likesEnabled: Boolean(row.likes_enabled),
    messagesEnabled: Boolean(row.messages_enabled),
    matchesEnabled: Boolean(row.matches_enabled),
    discoveryWatchEnabled: Boolean(row.discovery_watch_enabled),
    quietHours: start === null || end === null ? null : { startMinute: start, endMinute: end },
    quietHoursUtcOffsetMinutes: Number(row.quiet_hours_utc_offset_minutes),
    ...(row.quiet_hours_time_zone ? { quietHoursTimeZone: String(row.quiet_hours_time_zone) } : {}),
    maxPushesPerHour: Number(row.max_pushes_per_hour)
  }
}

function mapPolicyAudit(row: QueryResultRow): NotificationPolicyAudit {
  const notificationType = String(row.notification_type)
  const reason = String(row.reason)
  if (!isNotificationValueType(notificationType) || !isPolicyReason(reason)) {
    throw new Error("Invalid notification policy audit.")
  }
  return {
    userId: String(row.user_id),
    notificationType,
    reason,
    dedupeKey: String(row.dedupe_key),
    occurredAt: new Date(row.occurred_at).toISOString()
  }
}

function isNotificationValueType(value: string): value is NotificationValueType {
  return value === "like" || value === "message" || value === "match" || value === "discovery_watch"
}

function isPolicyReason(value: string): value is NotificationPolicyDecision["reason"] {
  return value === "queued" || value === "disabled" || value === "quiet_hours" || value === "frequency_cap" || value === "duplicate"
}
