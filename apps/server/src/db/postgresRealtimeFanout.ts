import type { Pool } from "pg"
import { randomUUID } from "node:crypto"
import {
  MAX_REALTIME_FANOUT_BYTES,
  type RealtimeFanout,
  validateRealtimeFanoutMessage
} from "../realtime/realtimeFanout"

export const REALTIME_FANOUT_CHANNEL = "blumi_realtime"

interface NotificationClient {
  query(text: string): Promise<unknown>
  on(event: "notification", listener: (notification: {
    channel: string
    payload?: string
  }) => void): this
  on(event: "error", listener: (error: unknown) => void): this
  on(event: "end", listener: () => void): this
  off(event: "notification", listener: (notification: {
    channel: string
    payload?: string
  }) => void): this
  off(event: "error", listener: (error: unknown) => void): this
  off(event: "end", listener: () => void): this
  release(error?: Error | boolean): void
}

interface FanoutPool {
  query(text: string, values: readonly unknown[]): Promise<unknown>
  connect(): Promise<NotificationClient>
}

export interface PostgresRealtimeFanoutOptions {
  reportError?: (error: unknown) => void
  reconnectDelayMs?: number
}

export function createPostgresRealtimeFanout(
  pool: Pool | FanoutPool,
  options: PostgresRealtimeFanoutOptions = {}
): RealtimeFanout {
  let healthySubscriptions = 0
  return {
    isHealthy: () => healthySubscriptions > 0,
    async publish(message) {
      const payload = JSON.stringify(message)
      const bytes = Buffer.byteLength(payload, "utf8")
      if (bytes > 2_000_000) {
        throw new Error("Realtime fanout payload is too large.")
      }
      if (bytes > MAX_REALTIME_FANOUT_BYTES) {
        await pool.query(`WITH stored AS (
          INSERT INTO blumi_realtime_payload_refs(payload_id, payload) VALUES($1, $2::jsonb)
          RETURNING payload_id
        ) SELECT pg_notify($3, json_build_object('payloadRef', payload_id, 'version', 1)::text) FROM stored`,
        [randomUUID(), payload, REALTIME_FANOUT_CHANNEL])
        return
      }
      await pool.query("SELECT pg_notify($1, $2)", [
        REALTIME_FANOUT_CHANNEL,
        payload
      ])
    },
    async subscribe(handler) {
      const reconnectDelayMs = Math.max(0, options.reconnectDelayMs ?? 1_000)
      let activeClient: NotificationClient | undefined
      let activeCleanup: (() => void) | undefined
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined
      let connecting: Promise<void> | undefined
      let stopped = false
      let incoming = Promise.resolve()
      let purging: Promise<void> | undefined
      const cleanupTimer = setInterval(() => {
        if (purging) return
        purging = purgeExpiredRealtimePayloads(pool).catch((error) => options.reportError?.(error))
          .finally(() => { purging = undefined })
      }, 60_000)
      cleanupTimer.unref()

      const establishClient = async (): Promise<void> => {
        const client = await pool.connect()
        let detached = false
        let healthy = false
        const listener = (notification: {
          channel: string
          payload?: string
        }) => {
          if (
            notification.channel !== REALTIME_FANOUT_CHANNEL ||
            !notification.payload
          ) {
            return
          }
          let value: unknown
          try {
            value = JSON.parse(notification.payload)
          } catch {
            return
          }
          const reference = value as { payloadRef?: unknown; version?: unknown } | null
          const referenceId = reference && reference.version === 1 && typeof reference.payloadRef === "string" &&
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(reference.payloadRef)
              ? reference.payloadRef : null
          if (!referenceId && !validateRealtimeFanoutMessage(value)) return
          incoming = incoming.then(async () => {
            if (stopped) return
            if (referenceId) {
              const result = await pool.query("SELECT payload FROM blumi_realtime_payload_refs WHERE payload_id = $1 AND expires_at > NOW()", [referenceId]) as { rows?: { payload?: unknown }[] }
              value = result.rows?.[0]?.payload
            }
            if (!stopped && validateRealtimeFanoutMessage(value)) await handler(value)
          }).catch((error) => { options.reportError?.(error) })
        }
        const detach = (releaseArgument?: Error | boolean): void => {
          if (detached) return
          detached = true
          if (healthy) { healthy = false; healthySubscriptions -= 1 }
          client.off("notification", listener)
          client.off("error", onError)
          client.off("end", onEnd)
          client.release(releaseArgument)
        }
        const onError = (error: unknown): void => {
          if (activeClient !== client) return
          activeClient = undefined
          activeCleanup = undefined
          detach(error instanceof Error ? error : new Error("Notification client failed."))
          options.reportError?.(error)
          scheduleReconnect()
        }
        const onEnd = (): void => {
          if (activeClient !== client) return
          activeClient = undefined
          activeCleanup = undefined
          detach(true)
          scheduleReconnect()
        }

        client.on("notification", listener)
        client.on("error", onError)
        client.on("end", onEnd)
        try {
          await client.query(`LISTEN ${REALTIME_FANOUT_CHANNEL}`)
          if (stopped) {
            detach()
            return
          }
          activeClient = client
          healthy = true
          healthySubscriptions += 1
          activeCleanup = detach
        } catch (error) {
          detach(error instanceof Error ? error : new Error("LISTEN failed."))
          throw error
        }
      }

      const connect = async (): Promise<void> => {
        if (stopped || activeClient) return
        if (connecting) return connecting

        const attempt = establishClient()
        connecting = attempt
        try {
          await attempt
        } finally {
          if (connecting === attempt) connecting = undefined
        }
      }

      const scheduleReconnect = (): void => {
        if (stopped || activeClient || reconnectTimer || connecting) return
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          void connect().catch((error) => {
            options.reportError?.(error)
            scheduleReconnect()
          })
        }, reconnectDelayMs)
      }

      try { await connect() } catch (error) { clearInterval(cleanupTimer); throw error }

      return async () => {
        stopped = true
        clearInterval(cleanupTimer)
        await incoming
        await purging
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = undefined
        }
        const pendingConnection = connecting
        if (pendingConnection) await pendingConnection.catch(() => undefined)
        const client = activeClient
        const cleanup = activeCleanup
        activeClient = undefined
        activeCleanup = undefined
        if (client) {
          try {
            await client.query(`UNLISTEN ${REALTIME_FANOUT_CHANNEL}`)
          } catch (error) {
            options.reportError?.(error)
          } finally {
            cleanup?.()
          }
        }
      }
    }
  }
}

export async function purgeExpiredRealtimePayloads(pool: Pick<FanoutPool, "query">): Promise<void> {
  await pool.query(`WITH expired AS (
    SELECT payload_id FROM blumi_realtime_payload_refs WHERE expires_at <= NOW()
    ORDER BY expires_at LIMIT 1000
  ) DELETE FROM blumi_realtime_payload_refs AS refs USING expired WHERE refs.payload_id = expired.payload_id`, [])
}
