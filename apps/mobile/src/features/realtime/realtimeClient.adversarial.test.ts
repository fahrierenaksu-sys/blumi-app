// Adversarial realtime client checks (2026-09-30): reconnect storms, giving up,
// lifecycle churn and hostile inbound frames. Sockets are mocked; timers are
// Node mock timers, so nothing touches the network.
import assert from "node:assert/strict"
import test from "node:test"
import { RealtimeClient, type RealtimeConnectionStatus } from "./realtimeClient"
import { resolveConnectionBannerState } from "../../ui/connectionBannerModel"

class MockWebSocket {
  public static readonly OPEN = 1
  public static instances: MockWebSocket[] = []
  public readyState = 0
  public closed = false
  public onopen: (() => void) | null = null
  public onmessage: ((event: { data: unknown }) => void) | null = null
  public onclose: ((event: { code: number }) => void) | null = null
  public onerror: (() => void) | null = null

  public constructor(public readonly url: string, public readonly protocols?: string | string[]) {
    MockWebSocket.instances.push(this)
  }

  public close(): void { this.closed = true }
  public send(): void {}
  public open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }
  public drop(code = 1006): void {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

function installWebSocketMock(): () => void {
  const original = globalThis.WebSocket
  MockWebSocket.instances = []
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
  return () => { globalThis.WebSocket = original }
}

function createTicketProvider() {
  let count = 0
  return async () => `opaque-ticket-${++count}`
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

test("fifty connect, drop and disconnect cycles leave no live socket, timer or retry", async (context) => {
  context.after(installWebSocketMock())
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  const statuses: RealtimeConnectionStatus[] = []
  const unsubscribe = client.onConnectionStatus((status) => { statuses.push(status) })
  for (let cycle = 0; cycle < 50; cycle += 1) {
    client.connect(`token-${cycle}`)
    await flush()
    MockWebSocket.instances.at(-1)?.open()
    MockWebSocket.instances.at(-1)?.drop()
    client.disconnect()
  }
  const created = MockWebSocket.instances.length
  assert.equal(created, 50)
  context.mock.timers.tick(10 * 60_000)
  await flush()
  assert.equal(MockWebSocket.instances.length, created, "no retry survives an intentional disconnect")
  assert.equal(statuses.at(-1), "disconnected")
  unsubscribe()
  client.connect("after-unsubscribe")
  await flush()
  assert.equal(statuses.at(-1), "disconnected", "an unsubscribed listener receives nothing")
  client.disconnect()
})

test("a reconnect storm from an instance restart is spread over the window and backs off", async (context) => {
  context.after(installWebSocketMock())
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const clients = Array.from({ length: 40 }, (_, index) =>
    new RealtimeClient("wss://realtime.example", createTicketProvider(), { random: () => index / 40 }))
  for (const [index, client] of clients.entries()) client.connect(`token-storm-${index}`)
  await flush()
  const firstSockets = [...MockWebSocket.instances]
  for (const socket of firstSockets) socket.open()
  // A fanout gap closes every socket on the instance at the same instant.
  for (const socket of firstSockets) socket.drop(1012)
  const perBucket: number[] = []
  let seen = MockWebSocket.instances.length
  for (let bucket = 0; bucket < 10; bucket += 1) {
    context.mock.timers.tick(100)
    await flush()
    perBucket.push(MockWebSocket.instances.length - seen)
    seen = MockWebSocket.instances.length
  }
  assert.deepEqual(perBucket.slice(0, 4), [0, 0, 0, 0], "no attempt before half the first ceiling")
  assert.equal(perBucket.reduce((sum, count) => sum + count, 0), 40, "every client retried within one second")
  assert.ok(Math.max(...perBucket) <= 10, `attempts per 100 ms: ${perBucket.join(",")}`)

  // The restarted instance is still down: the second attempt waits 1-2 s.
  const secondSockets = MockWebSocket.instances.slice(40)
  for (const socket of secondSockets) socket.drop(1006)
  seen = MockWebSocket.instances.length
  context.mock.timers.tick(999)
  await flush()
  assert.equal(MockWebSocket.instances.length, seen, "the second wave waits at least one second")
  context.mock.timers.tick(1_001)
  await flush()
  assert.equal(MockWebSocket.instances.length, seen + 40)
  for (const client of clients) client.disconnect()
})

test("after the fast reconnect attempts are exhausted the client still recovers without an app restart", async (context) => {
  // Fixed 2026-09-30 (owner decision): the client used to stop forever after
  // ten failed attempts while the banner kept promising a reconnect. It now
  // reports "unreachable" and keeps retrying at most 60 s apart.
  context.after(installWebSocketMock())
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const statuses: RealtimeConnectionStatus[] = []
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  client.onConnectionStatus((status) => { statuses.push(status) })
  client.connect("token-outage")
  await flush()
  // A server outage longer than the fast backoff budget (~1.5 to 3 minutes).
  for (let attempt = 0; attempt < 11; attempt += 1) {
    MockWebSocket.instances.at(-1)?.drop()
    context.mock.timers.tick(30_000)
    await flush()
  }
  assert.equal(statuses.at(-1), "unreachable")
  assert.equal(resolveConnectionBannerState("unreachable", true), "unreachable", "the UI no longer promises a quick reconnect")
  // Slow attempts continue, never more than 60 s apart.
  for (let slow = 0; slow < 10; slow += 1) {
    const before = MockWebSocket.instances.length
    MockWebSocket.instances.at(-1)?.drop()
    context.mock.timers.tick(60_000)
    await flush()
    assert.equal(MockWebSocket.instances.length, before + 1, `slow attempt ${slow} happened within 60 s`)
    assert.equal(statuses.at(-1), "unreachable")
  }
  // The server is back.
  MockWebSocket.instances.at(-1)?.open()
  assert.equal(statuses.at(-1), "connected")
  client.disconnect()
})

test("a server that accepts and immediately closes the socket is retried with growing backoff", async (context) => {
  // Fixed 2026-09-30: backoff used to reset on every onopen, so an
  // accept-then-close loop (4429, 1011, 1013) reconnected every 0.5-1 s.
  context.after(installWebSocketMock())
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider(), { random: () => 1 - Number.EPSILON })
  client.connect("token-flap")
  await flush()
  const delays: number[] = []
  for (const code of [4429, 1011, 1013, 4429, 1011, 1013]) {
    const before = MockWebSocket.instances.length
    MockWebSocket.instances.at(-1)?.open()
    MockWebSocket.instances.at(-1)?.drop(code)
    let waited = 0
    while (MockWebSocket.instances.length === before && waited < 120_000) {
      context.mock.timers.tick(250)
      waited += 250
      await flush()
    }
    delays.push(waited)
  }
  for (let index = 1; index < delays.length; index += 1) {
    assert.ok(delays[index]! >= delays[index - 1]!, `delays grow: ${delays.join(",")}`)
  }
  assert.ok(delays.at(-1)! > 1_000, `the sixth flap waited ${delays.at(-1)} ms`)
  client.disconnect()
})
