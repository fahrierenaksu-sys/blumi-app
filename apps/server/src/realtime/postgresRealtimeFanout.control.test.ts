// Fanout control channel (2026-10-01): peer discovery and cross-instance
// revocations. Fake clients only; no database.
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"
import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"
import {
  createPostgresRealtimeFanout,
  REALTIME_CONTROL_CHANNEL,
  REALTIME_PEER_TTL_MS
} from "../db/postgresRealtimeFanout"
import { parseRemoteAccessRevocation } from "./realtimeFanoutControl"

type FakeClient = EventEmitter & {
  queries: { text: string; values?: readonly unknown[] }[]
  query(text: string, values?: readonly unknown[]): Promise<unknown>
  release(argument?: Error | boolean): void
}

function createPool() {
  const clients: FakeClient[] = []
  const poolQueries: { text: string; values: readonly unknown[] }[] = []
  return {
    clients,
    poolQueries,
    async query(text: string, values: readonly unknown[]) { poolQueries.push({ text, values }) },
    async connect() {
      const client = new EventEmitter() as FakeClient
      client.queries = []
      client.query = async (text, values) => { client.queries.push({ text, values }) }
      client.release = () => undefined
      clients.push(client)
      return client
    }
  }
}

function control(client: FakeClient, message: unknown): void {
  client.emit("notification", { channel: REALTIME_CONTROL_CHANNEL, payload: JSON.stringify(message) })
}

function hellos(client: FakeClient): string[] {
  return client.queries
    .filter((query) => query.text === "SELECT pg_notify($1, $2)" && query.values?.[0] === REALTIME_CONTROL_CHANNEL)
    .map((query) => JSON.parse(String(query.values?.[1])) as { kind: string; origin: string })
    .filter((message) => message.kind === "hello")
    .map((message) => message.origin)
}

test("a lone instance stops publishing once the startup window passes without a peer", async () => {
  const clock = { now: 1_000_000 }
  const pool = createPool()
  const fanout = createPostgresRealtimeFanout(pool, { now: () => clock.now })
  assert.equal(fanout.hasRemotePeers(), true, "not listening yet: assume peers")
  const unsubscribe = await fanout.subscribe(() => undefined)
  assert.equal(hellos(pool.clients[0]!).length, 1, "announced itself on the LISTEN client")
  assert.deepEqual(pool.poolQueries, [], "discovery costs the shared pool nothing")
  assert.equal(fanout.hasRemotePeers(), true, "inside the startup window")
  clock.now += REALTIME_PEER_TTL_MS
  assert.equal(fanout.hasRemotePeers(), false)
  await unsubscribe()
})

test("a peer's hello is answered at once and keeps it known until its TTL", async () => {
  const clock = { now: 1_000_000 }
  const pool = createPool()
  const fanout = createPostgresRealtimeFanout(pool, { now: () => clock.now })
  const unsubscribe = await fanout.subscribe(() => undefined)
  const client = pool.clients[0]!
  const ownOrigin = hellos(client)[0]!
  clock.now += REALTIME_PEER_TTL_MS
  control(client, { v: 1, kind: "hello", origin: "peer-1" })
  assert.equal(fanout.hasRemotePeers(), true)
  assert.deepEqual(hellos(client), [ownOrigin, ownOrigin], "a newcomer gets an immediate reply")
  control(client, { v: 1, kind: "hello", origin: "peer-1" })
  assert.equal(hellos(client).length, 2, "a known peer is not answered again")
  // Its own hello echoed back by PostgreSQL is not a peer.
  control(client, { v: 1, kind: "hello", origin: ownOrigin })
  clock.now += REALTIME_PEER_TTL_MS - 1
  assert.equal(fanout.hasRemotePeers(), true)
  clock.now += 1
  assert.equal(fanout.hasRemotePeers(), false, "a silent peer is forgotten")
  await unsubscribe()
})

test("a gap without any known peer keeps live sockets; one with a peer forces resynchronization", async () => {
  const clock = { now: 1_000_000 }
  const pool = createPool()
  const gaps: string[] = []
  const fanout = createPostgresRealtimeFanout(pool, { now: () => clock.now, reconnectDelayMs: 0 })
  const unsubscribe = await fanout.subscribe(() => undefined, (reason) => gaps.push(reason))
  clock.now += REALTIME_PEER_TTL_MS
  pool.clients[0]!.emit("end")
  assert.deepEqual(gaps, [], "nothing another instance sent can have been missed")
  await waitFor(() => pool.clients.length === 2 && hellos(pool.clients[1]!).length === 1)
  // After reconnecting, the startup window applies again.
  assert.equal(fanout.hasRemotePeers(), true)
  clock.now += REALTIME_PEER_TTL_MS
  control(pool.clients[1]!, { v: 1, kind: "hello", origin: "peer-2" })
  pool.clients[1]!.emit("end")
  assert.deepEqual(gaps, ["disconnect"])
  await unsubscribe()
})

test("revocations from other instances reach listeners; malformed control messages are ignored", async () => {
  const pool = createPool()
  const fanout = createPostgresRealtimeFanout(pool)
  const received: RealtimeAccessRevocation[] = []
  const stop = fanout.subscribeAccessRevocations((revocation) => received.push(revocation))
  const unsubscribe = await fanout.subscribe(() => undefined)
  const client = pool.clients[0]!
  control(client, { v: 1, kind: "revoke", origin: "peer-1", revocation: { kind: "user", userId: "user_1" } })
  control(client, { v: 1, kind: "revoke", origin: "peer-1", revocation: { kind: "all" } })
  control(client, { v: 1, kind: "revoke", origin: "peer-1", revocation: { kind: "user", userId: "" } })
  control(client, { v: 2, kind: "revoke", origin: "peer-1", revocation: { kind: "all" } })
  control(client, { v: 1, kind: "revoke", revocation: { kind: "all" } })
  client.emit("notification", { channel: REALTIME_CONTROL_CHANNEL, payload: "{not json" })
  client.emit("notification", { channel: REALTIME_CONTROL_CHANNEL, payload: "x".repeat(2_000) })
  assert.deepEqual(received, [{ kind: "user", userId: "user_1" }, { kind: "all" }])
  stop()
  control(client, { v: 1, kind: "revoke", origin: "peer-1", revocation: { kind: "all" } })
  assert.equal(received.length, 2)
  await unsubscribe()
})

test("a local revocation is published on the control channel without user content", async () => {
  const pool = createPool()
  const fanout = createPostgresRealtimeFanout(pool)
  await fanout.publishAccessRevocation({ kind: "user", userId: "user_1" })
  assert.equal(pool.poolQueries.length, 1)
  assert.equal(pool.poolQueries[0]!.values[0], REALTIME_CONTROL_CHANNEL)
  const message = JSON.parse(String(pool.poolQueries[0]!.values[1])) as Record<string, unknown>
  assert.deepEqual(Object.keys(message).sort(), ["kind", "origin", "revocation", "v"])
  assert.deepEqual(message.revocation, { kind: "user", userId: "user_1" })
})

test("remote revocation payloads are strictly decoded", () => {
  assert.deepEqual(parseRemoteAccessRevocation({ kind: "all", extra: 1 }), { kind: "all" })
  assert.deepEqual(parseRemoteAccessRevocation({ kind: "user", userId: "user_1" }), { kind: "user", userId: "user_1" })
  for (const value of [null, "all", { kind: "user" }, { kind: "user", userId: "a\nb" },
    { kind: "user", userId: "x".repeat(257) }, { kind: "everyone" }]) {
    assert.equal(parseRemoteAccessRevocation(value), null)
  }
})

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.fail("condition did not become true")
}
