import type { Pool } from "pg"
import { randomUUID } from "node:crypto"
import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"
import {
  MAX_REALTIME_FANOUT_BYTES,
  MAX_REALTIME_FANOUT_USER_TARGETS,
  type RealtimeFanout,
  type RealtimeFanoutGapReason,
  validateRealtimeFanoutMessage
} from "../realtime/realtimeFanout"
import {
  parseRemoteAccessRevocation,
  type RealtimeFanoutControl
} from "../realtime/realtimeFanoutControl"

export const REALTIME_FANOUT_CHANNEL = "blumi_realtime"
/**
 * Instance-to-instance control messages (2026-10-01): peer hellos and access
 * revocations. Small, never user content, and sent on the LISTEN connection
 * (hellos) or the pool (revocations, which are rare).
 */
export const REALTIME_CONTROL_CHANNEL = "blumi_realtime_control"
/** Each listening instance announces itself this often. */
export const REALTIME_PEER_HELLO_INTERVAL_MS = 10_000
/**
 * A peer unheard for this long is gone. The same window applies after this
 * instance (re)starts listening: until then it assumes peers exist, so a
 * peer that started first is always discovered before publishing stops.
 */
export const REALTIME_PEER_TTL_MS = 30_000
const MAX_CONTROL_PAYLOAD_BYTES = 1_024
const MAX_REFERENCE_PAYLOAD_BYTES = 2_000_000
// jsonb::text may add separators absent from the publisher's compact JSON.
const MAX_REFERENCE_QUERY_BYTES = 4_000_000

interface NotificationClient {
  query(text: string, values?: readonly unknown[]): Promise<unknown>
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
  maxPendingNotifications?: number
  maxPendingBytes?: number
  watchdogMs?: number
  setupTimeoutMs?: number
  onMetrics?: (counters: { pending: number; pendingBytes: number; gaps: number }) => void
  /** Test seam for peer discovery; production uses Date.now. */
  now?: () => number
}

export function createPostgresRealtimeFanout(
  pool: Pool | FanoutPool,
  options: PostgresRealtimeFanoutOptions = {}
): RealtimeFanout & RealtimeFanoutControl {
  let healthySubscriptions = 0
  const now = options.now ?? Date.now
  const controlId = randomUUID()
  const peers = new Map<string, number>()
  /** When the current LISTEN became healthy; undefined while not listening. */
  let listeningSince: number | undefined
  const revocationListeners = new Set<(revocation: RealtimeAccessRevocation) => void>()
  const knowsRemotePeers = (): boolean => {
    const current = now()
    if (listeningSince === undefined || current - listeningSince < REALTIME_PEER_TTL_MS) return true
    for (const [peer, lastSeen] of peers) {
      if (current - lastSeen >= REALTIME_PEER_TTL_MS) peers.delete(peer)
    }
    return peers.size > 0
  }
  return {
    isHealthy: () => healthySubscriptions > 0,
    hasRemotePeers: knowsRemotePeers,
    async publishAccessRevocation(revocation) {
      await pool.query("SELECT pg_notify($1, $2)", [
        REALTIME_CONTROL_CHANNEL,
        JSON.stringify({ v: 1, kind: "revoke", origin: controlId, revocation })
      ])
    },
    subscribeAccessRevocations(listener) {
      revocationListeners.add(listener)
      return () => { revocationListeners.delete(listener) }
    },
    async publish(message) {
      if (
        message.target.kind === "users" &&
        message.target.userIds.length > MAX_REALTIME_FANOUT_USER_TARGETS
      ) {
        // Receivers would drop this target; fail loudly instead of losing it.
        throw new Error("Realtime fanout users target is too large; split it before publishing.")
      }
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
    async subscribe(handler, onGap) {
      const reconnectDelayMs = Math.max(0, options.reconnectDelayMs ?? 1_000)
      let activeClient: NotificationClient | undefined
      let activeCleanup: (() => void) | undefined
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined
      let connecting: Promise<void> | undefined
      let connectGeneration = 0
      let stopped = false
      let gaps = 0
      let purging: Promise<void> | undefined
      const reportError = (error: unknown): void => {
        try { options.reportError?.(error) }
        catch { /* Reporting must never prevent gap recovery or shutdown. */ }
      }
      const cleanupTimer = setInterval(() => {
        if (purging) return
        purging = purgeExpiredRealtimePayloads(pool).catch(reportError)
          .finally(() => { purging = undefined })
      }, 60_000)
      cleanupTimer.unref()
      let healthyClient: NotificationClient | undefined
      let lastHelloReplyAt = 0
      // Hellos travel on the LISTEN connection, so discovery costs the shared
      // pool nothing.
      const sendHello = (): void => {
        const client = healthyClient
        if (!client || stopped) return
        void client.query("SELECT pg_notify($1, $2)", [
          REALTIME_CONTROL_CHANNEL,
          JSON.stringify({ v: 1, kind: "hello", origin: controlId })
        ]).catch(reportError)
      }
      const helloTimer = setInterval(sendHello, REALTIME_PEER_HELLO_INTERVAL_MS)
      helloTimer.unref()
      const handleControl = (payload: string | undefined): void => {
        if (!payload || Buffer.byteLength(payload, "utf8") > MAX_CONTROL_PAYLOAD_BYTES) return
        let value: unknown
        try { value = JSON.parse(payload) } catch { return }
        const message = value as { v?: unknown; kind?: unknown; origin?: unknown; revocation?: unknown } | null
        if (!message || message.v !== 1 || typeof message.origin !== "string" ||
          message.origin.length === 0 || message.origin.length > 64 || message.origin === controlId) return
        if (message.kind === "hello") {
          const known = peers.has(message.origin)
          peers.set(message.origin, now())
          // Answer a newcomer at once so it learns about this instance too.
          if (!known && now() - lastHelloReplyAt >= 1_000) {
            lastHelloReplyAt = now()
            sendHello()
          }
          return
        }
        if (message.kind !== "revoke") return
        const revocation = parseRemoteAccessRevocation(message.revocation)
        if (!revocation) return
        for (const listener of [...revocationListeners]) {
          try { listener(revocation) } catch { /* One listener cannot block the rest. */ }
        }
      }

      const establishClient = async (generation: number): Promise<void> => {
        const client = await pool.connect()
        if (stopped || generation !== connectGeneration) { client.release(true); return }
        let detached = false
        let healthy = false
        const queue: { value: unknown; referenceId: string | null; bytes: number }[] = []
        let running = false
        let pending = 0
        let pendingBytes = 0
        let watchdog: ReturnType<typeof setTimeout> | undefined
        const metrics = (): void => {
          try { options.onMetrics?.({ pending, pendingBytes, gaps }) }
          catch { /* Observability must not interrupt gap recovery or delivery. */ }
        }
        const fail = (reason: RealtimeFanoutGapReason): void => {
          if (detached || stopped) return
          // Only another instance's events can be missed. With no peer heard
          // from (and past the startup window) the gap lost nothing, so live
          // sockets are kept instead of forcing every client to reconnect.
          const mayHaveMissedEvents = knowsRemotePeers()
          if (activeClient === client) { activeClient = undefined; activeCleanup = undefined }
          detach(true)
          gaps += 1
          metrics()
          reportError(new Error(`Realtime fanout gap: ${reason}`))
          try { if (mayHaveMissedEvents) onGap?.(reason) }
          catch { reportError(new Error("Realtime gap callback failed.")) }
          finally { scheduleReconnect() }
        }
        const drain = async (): Promise<void> => {
          if (running) return
          running = true
          try {
            while (!detached && !stopped && queue.length) {
              const item = queue.shift()!
              watchdog = setTimeout(() => fail("deadline"), Math.max(1, options.watchdogMs ?? 6_000))
              watchdog.unref()
              let value = item.value
              if (item.referenceId) {
                // Bound data returned by other publishers before pg decodes it.
                const result = await client.query(
                  "SELECT payload FROM blumi_realtime_payload_refs WHERE payload_id = $1 AND expires_at > NOW() AND octet_length(payload::text) <= $2",
                  [item.referenceId, MAX_REFERENCE_QUERY_BYTES]
                ) as { rows?: { payload?: unknown }[] }
                if (detached || stopped) return
                value = result.rows?.[0]?.payload
                if (!validateRealtimeFanoutMessage(value)) { fail("missing_payload"); return }
                const decodedBytes = Buffer.byteLength(JSON.stringify(value), "utf8")
                // The reference envelope remains live in the active queue item.
                if (decodedBytes > MAX_REFERENCE_PAYLOAD_BYTES ||
                  pendingBytes + decodedBytes > (options.maxPendingBytes ?? 4 * 1024 * 1024)) {
                  fail("overflow")
                  return
                }
                item.bytes += decodedBytes
                pendingBytes += decodedBytes
                metrics()
              }
              if (detached || stopped) return
              if (validateRealtimeFanoutMessage(value)) await handler(value)
              if (detached || stopped) return
              clearTimeout(watchdog)
              watchdog = undefined
              pending -= 1
              pendingBytes -= item.bytes
              metrics()
            }
          } catch (error) {
            fail("error")
            reportError(error)
          } finally { running = false }
        }
        const listener = (notification: {
          channel: string
          payload?: string
        }) => {
          if (!detached && !stopped && notification.channel === REALTIME_CONTROL_CHANNEL) {
            handleControl(notification.payload)
            return
          }
          if (detached || stopped ||
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
          const bytes = Buffer.byteLength(notification.payload, "utf8")
          if (pending >= (options.maxPendingNotifications ?? 256) ||
            pendingBytes + bytes > (options.maxPendingBytes ?? 4 * 1024 * 1024)) {
            fail("overflow")
            return
          }
          pending += 1
          pendingBytes += bytes
          queue.push({ value, referenceId, bytes })
          metrics()
          void drain()
        }
        const detach = (releaseArgument?: Error | boolean): void => {
          if (detached) return
          detached = true
          clearTimeout(watchdog)
          queue.length = 0
          pending = 0
          pendingBytes = 0
          if (healthy) {
            healthy = false
            healthySubscriptions -= 1
            if (healthyClient === client) healthyClient = undefined
            // Peers announced while this connection was down are unknown.
            if (healthySubscriptions === 0) listeningSince = undefined
          }
          client.off("notification", listener)
          client.off("error", onError)
          client.off("end", onEnd)
          client.release(releaseArgument)
        }
        const onError = (error: unknown): void => {
          if (activeClient !== client) return
          fail("error")
          reportError(error)
        }
        const onEnd = (): void => {
          if (activeClient !== client) return
          fail("disconnect")
        }

        client.on("notification", listener)
        client.on("error", onError)
        client.on("end", onEnd)
        activeClient = client
        activeCleanup = () => detach(true)
        try {
          await client.query("SET statement_timeout = '5s'")
          if (stopped || detached || generation !== connectGeneration) return
          await client.query(`LISTEN ${REALTIME_FANOUT_CHANNEL}`)
          if (stopped || detached || generation !== connectGeneration) {
            detach(true)
            return
          }
          await client.query(`LISTEN ${REALTIME_CONTROL_CHANNEL}`)
          if (stopped || detached || generation !== connectGeneration) {
            detach(true)
            return
          }
          healthy = true
          healthySubscriptions += 1
          healthyClient = client
          listeningSince ??= now()
          sendHello()
        } catch (error) {
          if (activeClient === client) { activeClient = undefined; activeCleanup = undefined }
          detach(true)
          throw error
        }
      }

      const connect = async (): Promise<void> => {
        if (stopped || activeClient) return
        if (connecting) return connecting

        const generation = ++connectGeneration
        let setupTimer: ReturnType<typeof setTimeout> | undefined
        const setupDeadline = new Promise<void>((_resolve, reject) => {
          setupTimer = setTimeout(() => reject(new Error("Realtime fanout setup timed out.")),
            Math.max(1, options.setupTimeoutMs ?? 6_000))
        })
        const attempt = Promise.race([establishClient(generation), setupDeadline])
        connecting = attempt
        try {
          await attempt
        } catch (error) {
          if (generation === connectGeneration) {
            connectGeneration += 1
            const cleanup = activeCleanup
            activeClient = undefined
            activeCleanup = undefined
            cleanup?.()
          }
          throw error
        } finally {
          clearTimeout(setupTimer)
          if (connecting === attempt) connecting = undefined
          if (!stopped && !activeClient) scheduleReconnect()
        }
      }

      const scheduleReconnect = (): void => {
        if (stopped || activeClient || reconnectTimer || connecting) return
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          void connect().catch((error) => {
            reportError(error)
            scheduleReconnect()
          })
        }, reconnectDelayMs)
      }

      try { await connect() } catch (error) {
        stopped = true
        clearInterval(cleanupTimer)
        clearInterval(helloTimer)
        clearTimeout(reconnectTimer)
        throw error
      }

      return async () => {
        stopped = true
        connectGeneration += 1
        clearInterval(cleanupTimer)
        clearInterval(helloTimer)
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = undefined
        }
        const cleanup = activeCleanup
        activeClient = undefined
        activeCleanup = undefined
        // Destroy rather than queue UNLISTEN behind a stuck lookup. No client
        // with session statement_timeout is returned to the shared pool.
        cleanup?.()
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
