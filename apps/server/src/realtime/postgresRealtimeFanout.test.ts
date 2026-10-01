import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import {
  createPostgresRealtimeFanout,
  REALTIME_FANOUT_CHANNEL
} from "../db/postgresRealtimeFanout"
import type { RealtimeFanoutMessage } from "./realtimeFanout"

const EVENT = {
  type: "connection.matched",
  payload: {
    miniRoomId: "room_1",
    participantUserIds: ["user_1", "user_2"],
    matchedAt: "2026-07-22T10:00:00.000Z"
  }
} as unknown as ServerEvent

test("postgres realtime fanout publishes bounded JSON through pg_notify", async () => {
  const pool = createFakePool()
  const fanout = createPostgresRealtimeFanout(pool)
  const message: RealtimeFanoutMessage = {
    origin: "instance_1",
    target: { kind: "user", userId: "user_1" },
    event: EVENT
  }

  await fanout.publish(message)

  assert.deepEqual(pool.queries, [{
    text: "SELECT pg_notify($1, $2)",
    values: [REALTIME_FANOUT_CHANNEL, JSON.stringify(message)]
  }])
})

test("postgres realtime fanout listens, ignores malformed notifications, and releases cleanly", async () => {
  const pool = createFakePool()
  const fanout = createPostgresRealtimeFanout(pool)
  const received: RealtimeFanoutMessage[] = []
  const unsubscribe = await fanout.subscribe((message) => {
    received.push(message)
  })
  const message: RealtimeFanoutMessage = {
    origin: "instance_2",
    target: { kind: "room", roomId: "lobby" },
    event: EVENT
  }

  pool.client.emit("notification", {
    channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify(message)
  })
  pool.client.emit("notification", {
    channel: REALTIME_FANOUT_CHANNEL,
    payload: "not-json"
  })
  pool.client.emit("notification", {
    channel: "other_channel",
    payload: JSON.stringify(message)
  })

  await waitFor(() => received.length === 1)
  assert.deepEqual(received, [message])
  await unsubscribe()
  // The control channel (peer hellos, revocations) shares the LISTEN client;
  // the first hello goes out on it, never through the shared pool.
  assert.deepEqual(pool.client.queries, [
    "SET statement_timeout = '5s'",
    "LISTEN blumi_realtime",
    "LISTEN blumi_realtime_control",
    "SELECT pg_notify($1, $2)"
  ])
  assert.deepEqual(pool.queries, [])
  assert.equal(pool.client.released, true)
})

test("postgres realtime fanout rejects excessive reference payloads before database access", async () => {
  const pool = createFakePool()
  const fanout = createPostgresRealtimeFanout(pool)
  const oversized = {
    origin: "instance_1",
    target: { kind: "user", userId: "user_1" },
    event: {
      type: "chat.message",
      payload: { body: "x".repeat(2_100_000) }
    }
  } as unknown as RealtimeFanoutMessage

  await assert.rejects(
    fanout.publish(oversized),
    /Realtime fanout payload is too large/
  )
  assert.deepEqual(pool.queries, [])
})

test("postgres realtime fanout stores large notifications and publishes a reference atomically", async () => {
  const pool = createFakePool()
  const fanout = createPostgresRealtimeFanout(pool)
  const message = { origin: "instance_1", target: { kind: "user", userId: "user" },
    event: { type: "mini_room.ready", payload: { miniRoom: { decor: "x".repeat(20_000) }, mediaSession: {}, participants: [] } } } as unknown as RealtimeFanoutMessage
  await fanout.publish(message)
  assert.equal(pool.queries.length, 1)
  assert.match(pool.queries[0].text, /INSERT INTO blumi_realtime_payload_refs/)
  assert.match(pool.queries[0].text, /pg_notify/)
  assert.ok(pool.queries[0].values.includes(JSON.stringify(message)))
})

test("postgres realtime fanout releases the client when LISTEN setup fails", async () => {
  const pool = createFakePool({ listenError: new Error("listen failed") })
  const fanout = createPostgresRealtimeFanout(pool)

  await assert.rejects(fanout.subscribe(() => undefined), /listen failed/)
  assert.equal(pool.client.released, true)
})

test("postgres realtime fanout reconnects after the LISTEN client ends", async () => {
  const pool = createReconnectPool()
  const fanout = createPostgresRealtimeFanout(pool, { reconnectDelayMs: 0 })
  assert.equal(fanout.isHealthy?.(), false)
  const received: RealtimeFanoutMessage[] = []
  const unsubscribe = await fanout.subscribe((message) => {
    received.push(message)
  })
  assert.equal(fanout.isHealthy?.(), true)
  const message: RealtimeFanoutMessage = {
    origin: "instance_2",
    target: { kind: "user", userId: "user_1" },
    event: EVENT
  }

  pool.clients[0].emit("end")
  assert.equal(fanout.isHealthy?.(), false)
  await waitFor(() => pool.clients.length === 2)
  assert.equal(fanout.isHealthy?.(), true)
  pool.clients[1].emit("notification", {
    channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify(message)
  })

  await waitFor(() => received.length === 1)
  assert.deepEqual(received, [message])
  await unsubscribe()
  assert.equal(pool.clients[1].released, true)
})

test("postgres realtime fanout destroys a failed notification client", async () => {
  const pool = createReconnectPool()
  const fanout = createPostgresRealtimeFanout(pool, { reconnectDelayMs: 0 })
  const unsubscribe = await fanout.subscribe(() => undefined)

  pool.clients[0].emit("error", new Error("notification connection failed"))
  assert.equal(pool.clients[0].releaseArgument, true)

  await unsubscribe()
})

test("throwing error reporter cannot suppress gap callback or reconnect", async () => {
  const pool = createReconnectPool()
  const gaps: string[] = []
  const fanout = createPostgresRealtimeFanout(pool, {
    reconnectDelayMs: 0,
    reportError() { throw new Error("logger failed") }
  })
  const unsubscribe = await fanout.subscribe(() => {}, (reason) => { gaps.push(reason) })
  pool.clients[0].emit("end")
  assert.deepEqual(gaps, ["disconnect"])
  await waitFor(() => pool.clients.length === 2)
  assert.equal(fanout.isHealthy?.(), true)
  await unsubscribe()
})

test("initial client acquisition times out and destroys a late acquired client", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const pool = createReconnectPool()
  const acquire = pool.connect.bind(pool)
  let resolveConnect!: (client: Awaited<ReturnType<typeof acquire>>) => void
  pool.connect = async () => new Promise((resolve) => { resolveConnect = resolve })
  const fanout = createPostgresRealtimeFanout(pool, { setupTimeoutMs: 6 })
  const subscribing = fanout.subscribe(() => {})
  context.mock.timers.tick(6)
  await assert.rejects(subscribing, /setup timed out/)
  const late = await acquire()
  resolveConnect(late)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(late.releaseArgument, true)
  assert.deepEqual(late.queries, [])
})

test("LISTEN setup query timeout destroys its acquired client", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const pool = createFakePool()
  pool.client.query = async () => new Promise(() => {})
  const fanout = createPostgresRealtimeFanout(pool, { setupTimeoutMs: 6 })
  const subscribing = fanout.subscribe(() => {})
  await Promise.resolve()
  context.mock.timers.tick(6)
  await assert.rejects(subscribing, /setup timed out/)
  assert.equal(pool.client.releaseArgument, true)
})

test("postgres realtime fanout unsubscribe destroys rather than queues UNLISTEN", async () => {
  const reported: unknown[] = []
  const pool = createFakePool({ unlistenError: new Error("unlisten failed") })
  const fanout = createPostgresRealtimeFanout(pool, {
    reportError: (error) => reported.push(error)
  })
  const unsubscribe = await fanout.subscribe(() => undefined)

  await unsubscribe()

  assert.equal(pool.client.released, true)
  assert.equal(reported.length, 0)
  assert.equal(pool.client.releaseArgument, true)
})

test("unsubscribe does not wait for reconnect acquisition and destroys a late client", async () => {
  const pool = createReconnectPool()
  const connect = pool.connect.bind(pool)
  let acquired!: (client: Awaited<ReturnType<typeof connect>>) => void
  const gaps: string[] = []
  const fanout = createPostgresRealtimeFanout(pool, { reconnectDelayMs: 0 })
  const unsubscribe = await fanout.subscribe(() => {}, (reason) => { gaps.push(reason) })
  pool.connect = async () => new Promise((resolve) => { acquired = resolve })
  pool.clients[0].emit("end")
  await waitFor(() => Boolean(acquired))
  await unsubscribe()
  const late = await connect()
  acquired(late)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(late.releaseArgument, true)
  assert.deepEqual(late.queries, [])
  assert.deepEqual(gaps, ["disconnect"])
  assert.equal(fanout.isHealthy?.(), false)
})

test("incoming bound includes active lookup and destroys the generation on overflow", async () => {
  const pool = createFakePool()
  let resolveLookup!: (value: unknown) => void
  pool.client.query = async (text) => text.startsWith("SELECT payload")
    ? new Promise((resolve) => { resolveLookup = resolve }) : undefined
  const gaps: string[] = []
  const received: RealtimeFanoutMessage[] = []
  const fanout = createPostgresRealtimeFanout(pool, { maxPendingNotifications: 2, reconnectDelayMs: 100_000 })
  const unsubscribe = await fanout.subscribe((message) => { received.push(message) }, (reason) => { gaps.push(reason) })
  const notify = () => pool.client.emit("notification", { channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify({ version: 1, payloadRef: "00000000-0000-0000-0000-000000000001" }) })
  notify()
  await Promise.resolve()
  notify()
  assert.equal(fanout.isHealthy?.(), true)
  notify()
  assert.deepEqual(gaps, ["overflow"])
  assert.equal(fanout.isHealthy?.(), false)
  assert.equal(pool.client.releaseArgument, true)
  await unsubscribe()
  resolveLookup({ rows: [{ payload: { origin: "remote", target: { kind: "user", userId: "user" }, event: EVENT } }] })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(received, [])
})

test("default cap admits 256 including active delivery, then signals exactly one gap", async () => {
  const pool = createFakePool()
  let delivered = 0
  const gaps: string[] = []
  let peak = 0
  const fanout = createPostgresRealtimeFanout(pool, { reconnectDelayMs: 100_000,
    onMetrics: (value) => { peak = Math.max(peak, value.pending) } })
  const unsubscribe = await fanout.subscribe(async () => { delivered++; await new Promise(() => {}) },
    (reason) => { gaps.push(reason) })
  const notification = { channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify({ origin: "remote", target: { kind: "user", userId: "user" }, event: EVENT }) }
  for (let index = 0; index < 256; index++) pool.client.emit("notification", notification)
  assert.equal(peak, 256)
  assert.equal(fanout.isHealthy?.(), true)
  pool.client.emit("notification", notification)
  pool.client.emit("notification", notification)
  assert.deepEqual(gaps, ["overflow"])
  assert.equal(delivered, 1)
  await unsubscribe()
})

test("unsubscribe immediately invalidates an active lookup without reporting a gap", async () => {
  const pool = createFakePool()
  pool.client.query = async (text) => text.startsWith("SELECT payload") ? new Promise(() => {}) : undefined
  const gaps: string[] = []
  const fanout = createPostgresRealtimeFanout(pool)
  const unsubscribe = await fanout.subscribe(() => {}, (reason) => { gaps.push(reason) })
  pool.client.emit("notification", { channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify({ version: 1, payloadRef: "00000000-0000-0000-0000-000000000001" }) })
  await unsubscribe()
  assert.equal(fanout.isHealthy?.(), false)
  assert.equal(pool.client.releaseArgument, true)
  assert.deepEqual(gaps, [])
})

test("FIFO preserves inline/reference order and queries refs on the LISTEN client", async () => {
  const pool = createFakePool()
  const first = { origin: "remote", target: { kind: "user" as const, userId: "user" }, event: EVENT }
  const second = { ...first, origin: "second" }
  let resolveLookup!: (value: unknown) => void
  const originalQuery = pool.client.query
  pool.client.query = async (text, values) => {
    if (text.startsWith("SELECT payload")) {
      assert.deepEqual(values, ["00000000-0000-0000-0000-000000000001", 4_000_000])
      return new Promise((resolve) => { resolveLookup = resolve })
    }
    return originalQuery(text, values)
  }
  const received: RealtimeFanoutMessage[] = []
  const counters: number[] = []
  const fanout = createPostgresRealtimeFanout(pool, { onMetrics: (value) => { counters.push(value.pending) } })
  const unsubscribe = await fanout.subscribe((message) => { received.push(message) })
  pool.client.emit("notification", { channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify({ version: 1, payloadRef: "00000000-0000-0000-0000-000000000001" }) })
  pool.client.emit("notification", { channel: REALTIME_FANOUT_CHANNEL, payload: JSON.stringify(second) })
  assert.deepEqual(received, [])
  resolveLookup({ rows: [{ payload: first }] })
  await waitFor(() => received.length === 2)
  assert.deepEqual(received, [first, second])
  assert.deepEqual(pool.queries, [])
  assert.deepEqual(counters, [1, 2, 2, 1, 0])
  await unsubscribe()
})

test("byte admission overflow reports counters without payload data", async () => {
  const pool = createFakePool()
  const gaps: string[] = []
  const metrics: unknown[] = []
  const fanout = createPostgresRealtimeFanout(pool, { maxPendingBytes: 1, reconnectDelayMs: 100_000,
    onMetrics: (value) => { metrics.push(value) } })
  const unsubscribe = await fanout.subscribe(() => {}, (reason) => { gaps.push(reason) })
  pool.client.emit("notification", { channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify({ origin: "remote", target: { kind: "user", userId: "user" }, event: EVENT }) })
  assert.deepEqual(gaps, ["overflow"])
  assert.deepEqual(metrics, [{ pending: 0, pendingBytes: 0, gaps: 1 }])
  await unsubscribe()
})

test("decoded reference payload is charged against the pending byte budget", async () => {
  const pool = createFakePool()
  const gaps: string[] = []
  const referencePayload = JSON.stringify({ version: 1, payloadRef: "00000000-0000-0000-0000-000000000001" })
  const expanded = { origin: "remote", target: { kind: "user", userId: "user" }, event: EVENT }
  pool.client.query = async (text) => text.startsWith("SELECT payload")
    ? { rows: [{ payload: expanded }] } : undefined
  const fanout = createPostgresRealtimeFanout(pool, {
    maxPendingBytes: Buffer.byteLength(referencePayload) + 1,
    reconnectDelayMs: 100_000
  })
  const unsubscribe = await fanout.subscribe(() => {}, (reason) => { gaps.push(reason) })
  pool.client.emit("notification", { channel: REALTIME_FANOUT_CHANNEL, payload: referencePayload })
  await waitFor(() => gaps.length === 1)
  assert.deepEqual(gaps, ["overflow"])
  assert.equal(pool.client.releaseArgument, true)
  await unsubscribe()
})

for (const failure of ["missing_payload", "error"] as const) {
  test(`reference ${failure} signals a gap and reconnects a clean generation`, async () => {
    const pool = createReconnectPool()
    const gaps: string[] = []
    const fanout = createPostgresRealtimeFanout(pool, { reconnectDelayMs: 0 })
    const unsubscribe = await fanout.subscribe(() => {}, (reason) => { gaps.push(reason) })
    pool.clients[0].query = async () => {
      if (failure === "error") throw new Error("lookup failed")
      return { rows: [] }
    }
    pool.clients[0].emit("notification", { channel: REALTIME_FANOUT_CHANNEL,
      payload: JSON.stringify({ version: 1, payloadRef: "00000000-0000-0000-0000-000000000001" }) })
    await waitFor(() => gaps.length === 1)
    assert.deepEqual(gaps, [failure])
    assert.equal(pool.clients[0].releaseArgument, true)
    await waitFor(() => pool.clients.length === 2)
    assert.equal(fanout.isHealthy?.(), true)
    await unsubscribe()
  })
}

test("stalled lookup watchdog signals a gap and unsubscribe does not await it", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const pool = createFakePool()
  pool.client.query = async (text) => text.startsWith("SELECT payload") ? new Promise(() => {}) : undefined
  const gaps: string[] = []
  const fanout = createPostgresRealtimeFanout(pool, { watchdogMs: 6, reconnectDelayMs: 100_000 })
  const unsubscribe = await fanout.subscribe(() => {}, (reason) => { gaps.push(reason) })
  pool.client.emit("notification", { channel: REALTIME_FANOUT_CHANNEL,
    payload: JSON.stringify({ version: 1, payloadRef: "00000000-0000-0000-0000-000000000001" }) })
  context.mock.timers.tick(6)
  assert.deepEqual(gaps, ["deadline"])
  assert.equal(pool.client.releaseArgument, true)
  await unsubscribe()
})

function createFakePool(options: { listenError?: Error; unlistenError?: Error } = {}) {
  const client = new EventEmitter() as EventEmitter & {
    queries: string[]
    released: boolean
    releaseArgument?: Error | boolean
    query: (text: string, values?: readonly unknown[]) => Promise<unknown>
    release: (error?: Error | boolean) => void
  }
  client.queries = []
  client.released = false
  client.query = async (text) => {
    client.queries.push(text)
    if (text.startsWith("LISTEN") && options.listenError) {
      throw options.listenError
    }
    if (text.startsWith("UNLISTEN") && options.unlistenError) {
      throw options.unlistenError
    }
  }
  client.release = (argument) => {
    client.releaseArgument = argument
    client.released = true
  }

  return {
    client,
    queries: [] as Array<{ text: string; values: readonly unknown[] }>,
    async query(text: string, values: readonly unknown[]) {
      this.queries.push({ text, values })
    },
    async connect() {
      return client
    }
  }
}

function createReconnectPool() {
  const clients: Array<EventEmitter & {
    queries: string[]
    released: boolean
    releaseArgument: Error | boolean | undefined
    query: (text: string, values?: readonly unknown[]) => Promise<unknown>
    release: (error?: Error | boolean) => void
  }> = []

  return {
    clients,
    async query(_text: string, _values: readonly unknown[]) {},
    async connect() {
      const client = new EventEmitter() as typeof clients[number]
      client.queries = []
      client.released = false
      client.releaseArgument = undefined
      client.query = async (text) => {
        client.queries.push(text)
      }
      client.release = (error?: Error | boolean) => {
        client.released = true
        client.releaseArgument = error
      }
      clients.push(client)
      return client
    }
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.fail("condition did not become true")
}
