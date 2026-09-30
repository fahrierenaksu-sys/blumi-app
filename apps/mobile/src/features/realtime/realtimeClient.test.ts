import assert from "node:assert/strict"
import test from "node:test"
import {
  RealtimeClient,
  REALTIME_AUTH_INVALID_CLOSE_CODE,
  isRealtimeAuthInvalidClose,
  RealtimeTicketRequestError,
  type RealtimeConnectionStatus,
  type RealtimeEventDrop
} from "./realtimeClient"
import { SERVER_EVENT_TYPES } from "@blumi/contracts"

class MockWebSocket {
  public static readonly OPEN = 1
  public static instances: MockWebSocket[] = []
  public readyState = 0
  public onopen: (() => void) | null = null
  public onmessage: ((event: { data: unknown }) => void) | null = null
  public onclose: ((event: { code: number }) => void) | null = null
  public onerror: (() => void) | null = null
  public sentMessages: string[] = []
  public sendError: Error | null = null

  public constructor(
    public readonly url: string,
    public readonly protocols?: string | string[]
  ) {
    MockWebSocket.instances.push(this)
  }

  public close(): void {}
  public send(message: string): void {
    if (this.sendError) throw this.sendError
    this.sentMessages.push(message)
  }

  public open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  public message(data: unknown): void {
    this.onmessage?.({ data })
  }

  public fail(): void {
    this.onerror?.()
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

async function openValidatingClient(
  options: ConstructorParameters<typeof RealtimeClient>[2] = {}
): Promise<{
  client: RealtimeClient
  socket: MockWebSocket
  events: unknown[]
  drops: RealtimeEventDrop[]
}> {
  const events: unknown[] = []
  const drops: RealtimeEventDrop[] = []
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider(), {
    onDroppedEvent: (drop) => { drops.push(drop) },
    ...options
  })
  client.onServerEvent((event) => { events.push(event) })
  client.connect("validation-session")
  await flushTicketRequest()
  const socket = MockWebSocket.instances.at(-1)
  assert.ok(socket)
  socket.open()
  return { client, socket, events, drops }
}

const PRIVATE_BODY = "meet me at 5, my number is +905551112233"

function createTicketProvider() {
  let count = 0
  return async () => `opaque-ticket-${++count}`
}

async function flushTicketRequest(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

test("send reports whether an open socket accepted the event", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  const event = {
    type: "room.join",
    payload: {
      roomId: "lobby:public",
      sessionToken: "session-token"
    }
  } as const

  client.connect("token-send")
  await flushTicketRequest()
  assert.equal(client.send(event), false)

  MockWebSocket.instances[0]?.open()
  assert.equal(client.send(event), true)
  assert.deepEqual(MockWebSocket.instances[0]?.sentMessages, [
    JSON.stringify(event)
  ])

  if (MockWebSocket.instances[0]) {
    MockWebSocket.instances[0].sendError = new Error("socket closed")
  }
  assert.equal(client.send(event), false)
})

test("unexpected close reconnects with a fresh opaque ticket", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const statuses: RealtimeConnectionStatus[] = []
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  client.onConnectionStatus((status) => { statuses.push(status) })

  client.connect("token-1")
  await flushTicketRequest()
  assert.deepEqual(MockWebSocket.instances[0]?.protocols, ["ticket-opaque-ticket-1"])
  assert.doesNotMatch(JSON.stringify(MockWebSocket.instances[0]?.protocols), /token-1/)
  MockWebSocket.instances[0]?.drop()

  assert.equal(statuses.at(-1), "reconnecting")
  context.mock.timers.tick(999)
  assert.equal(MockWebSocket.instances.length, 1)
  context.mock.timers.tick(1)
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 2)
  assert.deepEqual(MockWebSocket.instances[1]?.protocols, ["ticket-opaque-ticket-2"])
})

test("remote normal close reconnects with a fresh opaque ticket", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())

  client.connect("token-normal-close")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.drop(1000)

  context.mock.timers.tick(1_000)
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 2)
  assert.deepEqual(MockWebSocket.instances[1]?.protocols, ["ticket-opaque-ticket-2"])
})

test("fanout gap close 1012 reconnects without invalidating authentication", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const statuses: RealtimeConnectionStatus[] = []
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  client.onConnectionStatus((status) => { statuses.push(status) })
  client.connect("token-1")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.open()
  MockWebSocket.instances[0]?.drop(1012)
  assert.equal(isRealtimeAuthInvalidClose(1012), false)
  assert.equal(statuses.at(-1), "reconnecting")
  context.mock.timers.tick(1_000)
  await flushTicketRequest()
  MockWebSocket.instances[1]?.open()
  assert.equal(statuses.at(-1), "connected")
  assert.equal(MockWebSocket.instances.length, 2)
  client.disconnect()
})

test("successful reconnect resets exponential backoff", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())

  client.connect("token-2")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.drop()
  context.mock.timers.tick(1_000)
  await flushTicketRequest()
  MockWebSocket.instances[1]?.open()
  MockWebSocket.instances[1]?.drop()
  context.mock.timers.tick(1_000)
  await flushTicketRequest()

  assert.equal(MockWebSocket.instances.length, 3)
})

test("intentional disconnect cancels pending reconnect", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())

  client.connect("token-3")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.drop()
  client.disconnect()
  context.mock.timers.tick(30_000)

  assert.equal(MockWebSocket.instances.length, 1)
})

test("reconnect stops after ten failed attempts", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const statuses: RealtimeConnectionStatus[] = []
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  client.onConnectionStatus((status) => { statuses.push(status) })

  client.connect("token-4")
  await flushTicketRequest()
  for (let attempt = 0; attempt < 10; attempt += 1) {
    MockWebSocket.instances.at(-1)?.drop()
    context.mock.timers.tick(30_000)
    await flushTicketRequest()
  }
  MockWebSocket.instances.at(-1)?.drop()
  context.mock.timers.tick(30_000)

  assert.equal(MockWebSocket.instances.length, 11)
  assert.equal(statuses.at(-1), "error")
})

test("offline state pauses retries and reconnects immediately when network returns", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())

  client.connect("token-5")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.drop()
  client.setNetworkConnected(false)
  context.mock.timers.tick(30_000)
  assert.equal(MockWebSocket.instances.length, 1)

  client.setNetworkConnected(true)
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 2)
  assert.deepEqual(MockWebSocket.instances[1]?.protocols, ["ticket-opaque-ticket-2"])
})

test("policy close does not retry with the same rejected session", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const statuses: RealtimeConnectionStatus[] = []
  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  client.onConnectionStatus((status) => { statuses.push(status) })

  client.connect("rejected-token")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.drop(1008)
  context.mock.timers.tick(30_000)

  assert.equal(MockWebSocket.instances.length, 1)
  assert.equal(statuses.at(-1), "error")
})

test("disconnect invalidates an in-flight ticket request", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  let resolveTicket: ((ticket: string) => void) | undefined
  const client = new RealtimeClient(
    "wss://realtime.example",
    () => new Promise((resolve) => { resolveTicket = resolve })
  )

  client.connect("token-pending")
  client.disconnect()
  resolveTicket?.("opaque-ticket-pending")
  await flushTicketRequest()

  assert.equal(MockWebSocket.instances.length, 0)
})

test("ticket authorization failure preserves the invalid-session signal", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  const statuses: {
    status: RealtimeConnectionStatus
    closeCode?: number
  }[] = []
  const client = new RealtimeClient(
    "wss://realtime.example",
    async () => { throw new RealtimeTicketRequestError(401) }
  )
  client.onConnectionStatus((status, meta) => {
    statuses.push({ status, closeCode: meta?.closeCode })
  })

  client.connect("expired-token")
  await flushTicketRequest()

  assert.deepEqual(statuses.at(-1), {
    status: "error",
    closeCode: REALTIME_AUTH_INVALID_CLOSE_CODE
  })
  assert.equal(MockWebSocket.instances.length, 0)
})

test("only a confirmed HTTP authentication failure clears the app session", () => {
  assert.equal(isRealtimeAuthInvalidClose(REALTIME_AUTH_INVALID_CLOSE_CODE), true)
  assert.equal(isRealtimeAuthInvalidClose(1008), false)
  assert.equal(isRealtimeAuthInvalidClose(4403), false)
  assert.equal(isRealtimeAuthInvalidClose(4429), false)
  assert.equal(isRealtimeAuthInvalidClose(undefined), false)
})

test("superseded sockets cannot publish stale status or events", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  const statuses: RealtimeConnectionStatus[] = []
  const events: unknown[] = []
  const client = new RealtimeClient(
    "wss://realtime.example",
    createTicketProvider()
  )
  client.onConnectionStatus((status) => { statuses.push(status) })
  client.onServerEvent((event) => { events.push(event) })

  client.connect("first-session")
  await flushTicketRequest()
  const staleSocket = MockWebSocket.instances[0]
  client.connect("second-session")
  await flushTicketRequest()

  staleSocket?.open()
  staleSocket?.fail()
  staleSocket?.message(JSON.stringify({ type: "room.joined", payload: {} }))

  assert.notEqual(statuses.at(-1), "connected")
  assert.notEqual(statuses.at(-1), "error")
  assert.deepEqual(events, [])
  assert.equal(MockWebSocket.instances.length, 2)
})

test("a transient ticket request failure retries with a newly issued ticket", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  let requestCount = 0
  const client = new RealtimeClient(
    "wss://realtime.example",
    async () => {
      requestCount += 1
      if (requestCount === 1) throw new Error("temporary outage")
      return "fresh-ticket-after-retry"
    }
  )

  client.connect("stable-session")
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 0)

  context.mock.timers.tick(1_000)
  await flushTicketRequest()
  assert.equal(requestCount, 2)
  assert.deepEqual(MockWebSocket.instances[0]?.protocols, [
    "ticket-fresh-ticket-after-retry"
  ])
})

test("reconnect delay is jittered below the exponential ceiling", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new RealtimeClient(
    "wss://realtime.example",
    createTicketProvider(),
    { random: () => 0 }
  )

  client.connect("token-jitter-floor")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.drop()
  context.mock.timers.tick(499)
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 1)
  context.mock.timers.tick(1)
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 2)
})

test("clients disconnected together spread their reconnect attempts", async (context) => {
  const restore = installWebSocketMock()
  context.after(restore)
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const early = new RealtimeClient("wss://realtime.example", createTicketProvider(), { random: () => 0 })
  const late = new RealtimeClient("wss://realtime.example", createTicketProvider(), { random: () => 0.99 })

  early.connect("token-early")
  late.connect("token-late")
  await flushTicketRequest()
  MockWebSocket.instances[0]?.drop(1012)
  MockWebSocket.instances[1]?.drop(1012)
  context.mock.timers.tick(500)
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 3)
  context.mock.timers.tick(495)
  await flushTicketRequest()
  assert.equal(MockWebSocket.instances.length, 4)
})

test("valid server events are delivered unchanged", async (context) => {
  context.after(installWebSocketMock())
  const { client, socket, events, drops } = await openValidatingClient()
  const message = {
    type: "chat.message_received",
    payload: {
      messageId: "message-1",
      threadId: "thread-1",
      senderUserId: "ada",
      body: PRIVATE_BODY,
      sentAt: "2026-09-30T12:00:00.000Z"
    }
  }
  const realtimeError = {
    type: "realtime.error",
    payload: {
      code: "PRESENCE_ROOM_UNAVAILABLE",
      requestType: "room.join",
      message: "The shared lobby is no longer available."
    }
  }
  socket.message(JSON.stringify(message))
  socket.message(JSON.stringify(realtimeError))

  assert.deepEqual(events, [message, realtimeError])
  assert.deepEqual(drops, [])
  assert.deepEqual(client.getDroppedEventCounts(), { unparseable: 0, invalid: 0, unknownType: 0 })
})

test("every known event type with a malformed payload is dropped and counted", async (context) => {
  context.after(installWebSocketMock())
  const { client, socket, events, drops } = await openValidatingClient()
  for (const type of SERVER_EVENT_TYPES) {
    socket.message(JSON.stringify({ type, payload: {} }))
  }
  assert.deepEqual(events, [])
  assert.equal(client.getDroppedEventCounts().invalid, SERVER_EVENT_TYPES.length)
  assert.deepEqual(
    drops.map((drop) => drop.reason === "invalid" ? drop.type : null),
    [...SERVER_EVENT_TYPES]
  )
})

test("invalid event diagnostics carry field paths but no payload values", async (context) => {
  context.after(installWebSocketMock())
  const { socket, events, drops } = await openValidatingClient()
  socket.message(JSON.stringify({
    type: "chat.message_received",
    payload: {
      messageId: "message-1",
      threadId: "thread-1",
      senderUserId: "",
      body: PRIVATE_BODY,
      sentAt: "yesterday"
    }
  }))
  assert.deepEqual(events, [])
  assert.equal(drops.length, 1)
  assert.deepEqual(drops[0], {
    reason: "invalid",
    type: "chat.message_received",
    issuePaths: ["senderUserId", "sentAt"]
  })
  assert.equal(JSON.stringify(drops).includes(PRIVATE_BODY), false)
  assert.equal(JSON.stringify(drops).includes("+905551112233"), false)
})

test("unknown event types from a newer server are ignored safely", async (context) => {
  context.after(installWebSocketMock())
  const { client, socket, events, drops } = await openValidatingClient()
  socket.message(JSON.stringify({ type: "room.decor_updated", payload: { body: PRIVATE_BODY } }))
  socket.message(JSON.stringify({ type: "safety.user_blocked", payload: { blockedUserId: "bora" } }))

  assert.deepEqual(events, [{ type: "safety.user_blocked", payload: { blockedUserId: "bora" } }])
  assert.deepEqual(drops, [{ reason: "unknown_type", type: "room.decor_updated" }])
  assert.deepEqual(client.getDroppedEventCounts(), { unparseable: 0, invalid: 0, unknownType: 1 })
})

test("unparseable and malformed envelopes are dropped without reaching listeners", async (context) => {
  context.after(installWebSocketMock())
  const { client, socket, events } = await openValidatingClient()
  socket.message("{not json")
  socket.message(JSON.stringify({ type: "room.left" }))
  socket.message(JSON.stringify([1, 2, 3]))
  socket.message(new ArrayBuffer(4))

  assert.deepEqual(events, [])
  assert.deepEqual(client.getDroppedEventCounts(), { unparseable: 1, invalid: 2, unknownType: 0 })
})

test("listener or diagnostics failures never escape the socket handler", async (context) => {
  context.after(installWebSocketMock())
  const { socket, events } = await openValidatingClient({
    onDroppedEvent: () => { throw new Error("observer failed") }
  })
  assert.doesNotThrow(() => socket.message("{not json"))
  const failing = new RealtimeClient("wss://realtime.example", createTicketProvider())
  failing.onServerEvent(() => { throw new Error("listener failed") })
  failing.connect("listener-session")
  await flushTicketRequest()
  const failingSocket = MockWebSocket.instances.at(-1)
  failingSocket?.open()
  assert.doesNotThrow(() => failingSocket?.message(JSON.stringify({
    type: "room.left",
    payload: { roomId: "lobby" }
  })))
  assert.deepEqual(events, [])
})

test("default diagnostics warn only in development and never include payload values", async (context) => {
  context.after(installWebSocketMock())
  const warnings: unknown[][] = []
  const warn = context.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args) })
  const globals = globalThis as { __DEV__?: unknown }
  const previousDev = globals.__DEV__
  context.after(() => {
    warn.mock.restore()
    if (previousDev === undefined) delete globals.__DEV__
    else globals.__DEV__ = previousDev
  })

  const client = new RealtimeClient("wss://realtime.example", createTicketProvider())
  client.connect("dev-session")
  await flushTicketRequest()
  const socket = MockWebSocket.instances.at(-1)
  socket?.open()
  const invalid = JSON.stringify({
    type: "chat.message_received",
    payload: { body: PRIVATE_BODY }
  })

  globals.__DEV__ = false
  socket?.message(invalid)
  assert.equal(warnings.length, 0)

  globals.__DEV__ = true
  socket?.message(invalid)
  socket?.message(JSON.stringify({ type: "room.decor_updated", payload: {} }))
  assert.equal(warnings.length, 1)
  assert.equal(JSON.stringify(warnings).includes(PRIVATE_BODY), false)
  assert.deepEqual(client.getDroppedEventCounts(), { unparseable: 0, invalid: 2, unknownType: 1 })
})
