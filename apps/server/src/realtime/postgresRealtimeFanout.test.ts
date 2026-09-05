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
  assert.deepEqual(pool.client.queries, [
    "LISTEN blumi_realtime",
    "UNLISTEN blumi_realtime"
  ])
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
  assert.ok(pool.clients[0].releaseArgument instanceof Error)

  await unsubscribe()
})

test("postgres realtime fanout reports UNLISTEN failures and still releases", async () => {
  const reported: unknown[] = []
  const pool = createFakePool({ unlistenError: new Error("unlisten failed") })
  const fanout = createPostgresRealtimeFanout(pool, {
    reportError: (error) => reported.push(error)
  })
  const unsubscribe = await fanout.subscribe(() => undefined)

  await unsubscribe()

  assert.equal(pool.client.released, true)
  assert.equal(reported.length, 1)
  assert.match(String(reported[0]), /unlisten failed/)
})

function createFakePool(options: { listenError?: Error; unlistenError?: Error } = {}) {
  const client = new EventEmitter() as EventEmitter & {
    queries: string[]
    released: boolean
    query: (text: string) => Promise<void>
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
  client.release = () => {
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
    query: (text: string) => Promise<void>
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
