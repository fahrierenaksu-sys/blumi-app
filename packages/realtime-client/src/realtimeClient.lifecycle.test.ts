import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import {
  RealtimeClient,
  REALTIME_CONNECT_TIMEOUT_MS,
  REALTIME_FAST_RECONNECT_ATTEMPTS,
  REALTIME_LIVENESS_CLOSE_CODE,
  REALTIME_LIVENESS_GRACE_MS,
  type RealtimeConnectionStatus,
  type RealtimeSocket
} from "./realtimeClient"

// App lifecycle (background/foreground) behaviour of the realtime client.
// iOS suspends a backgrounded app: its socket can no longer answer the
// server's pings, so the server keeps treating the user as connected (and
// suppresses chat push notifications) until the heartbeat terminates it.
// On return the client must reconnect at once instead of waiting on a
// backoff that was scheduled before the app left the foreground.

class FakeSocket implements RealtimeSocket {
  public readyState = 0
  public closed = false
  public onopen: (() => void) | null = null
  public onmessage: ((event: { data: unknown }) => void) | null = null
  public onclose: ((event: { code: number }) => void) | null = null
  public onerror: (() => void) | null = null

  public constructor(public readonly protocols: string[]) {}

  public closeCode: number | undefined
  public send(): void {}
  public close(code?: number): void {
    this.closed = true
    this.closeCode = code
    this.readyState = 3
  }

  public message(data: string): void {
    this.onmessage?.({ data })
  }

  public open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  public drop(code = 1006): void {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

interface Harness {
  client: RealtimeClient
  sockets: FakeSocket[]
  statuses: RealtimeConnectionStatus[]
  ticketRequests: () => number
}

function createHarness(
  options: {
    random?: () => number
    ticketProvider?: () => Promise<string>
    now?: () => number
  } = {}
): Harness {
  const sockets: FakeSocket[] = []
  const statuses: RealtimeConnectionStatus[] = []
  let requests = 0
  const client = new RealtimeClient(
    "wss://realtime.example",
    options.ticketProvider ?? (async () => `lifecycle-ticket-${++requests}`),
    {
      random: options.random ?? (() => 1 - Number.EPSILON),
      ...(options.now ? { now: options.now } : {}),
      createSocket: (_url, protocols) => {
        const socket = new FakeSocket(protocols)
        sockets.push(socket)
        return socket
      }
    }
  )
  client.onConnectionStatus((status) => { statuses.push(status) })
  return { client, sockets, statuses, ticketRequests: () => requests }
}

async function flushTicketRequest(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function useFakeTimers(context: TestContext): void {
  context.mock.timers.enable({ apis: ["setTimeout"] })
}

/** Drops the current socket and lets its backoff elapse, `count` times. */
async function failAttempts(
  context: TestContext,
  harness: Harness,
  count: number
): Promise<void> {
  for (let attempt = 0; attempt < count; attempt += 1) {
    harness.sockets.at(-1)?.drop()
    context.mock.timers.tick(60_000)
    await flushTicketRequest()
  }
}

test("backgrounding closes the live socket so the server releases the connection at once", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-background")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  assert.equal(harness.statuses.at(-1), "connected")

  harness.client.suspend()

  assert.equal(harness.sockets[0]?.closed, true, "the server sees the close instead of waiting for missed pings")
  assert.equal(harness.statuses.at(-1), "disconnected")
  context.mock.timers.tick(10 * 60_000)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 1, "nothing reconnects while backgrounded")
  harness.client.disconnect()
})

test("returning to the foreground reconnects at once with a fresh ticket", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-resume")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  harness.client.suspend()

  harness.client.setAppActive(true)
  assert.equal(harness.statuses.at(-1), "reconnecting")
  await flushTicketRequest()

  assert.equal(harness.sockets.length, 2, "no backoff wait on resume")
  assert.deepEqual(harness.sockets[1]?.protocols, ["ticket-lifecycle-ticket-2"])
  harness.sockets[1]?.open()
  assert.equal(harness.statuses.at(-1), "connected")
  harness.client.disconnect()
})

test("foreground cancels a pending backoff and starts the fast attempts over", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-backoff")
  await flushTicketRequest()
  // Four failures: the pending fifth attempt waits up to 16 s.
  await failAttempts(context, harness, 4)
  harness.sockets.at(-1)?.drop()
  const socketsBeforeResume = harness.sockets.length

  harness.client.setAppActive(false)
  harness.client.setAppActive(true)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, socketsBeforeResume + 1, "retried at once, not after 16 s")

  // The backoff was reset: the next failure retries within the first
  // attempt's one-second window (the harness picks its latest point).
  harness.sockets.at(-1)?.drop()
  context.mock.timers.tick(998)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, socketsBeforeResume + 1)
  context.mock.timers.tick(1)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, socketsBeforeResume + 2)
  harness.client.disconnect()
})

test("foreground replaces a socket that died without delivering its close event", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-silent-close")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  harness.client.setAppActive(false)
  // The OS tore the socket down while the app was inactive; no onclose yet.
  if (harness.sockets[0]) harness.sockets[0].readyState = 3

  harness.client.setAppActive(true)
  await flushTicketRequest()

  assert.equal(harness.sockets.length, 2)
  assert.equal(harness.statuses.at(-1), "reconnecting")
  // A late close from the replaced socket cannot publish stale status.
  harness.sockets[0]?.drop()
  assert.equal(harness.statuses.at(-1), "reconnecting")
  harness.client.disconnect()
})

test("a live or opening socket is kept on foreground and never doubled", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-live")
  await flushTicketRequest()
  harness.client.setAppActive(false)
  harness.client.setAppActive(true)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 1, "an opening socket is kept")

  harness.sockets[0]?.open()
  harness.client.setAppActive(false)
  harness.client.setAppActive(true)
  harness.client.setAppActive(true)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 1, "an open socket is kept")

  harness.client.suspend()
  harness.client.setAppActive(true)
  harness.client.setAppActive(true)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 2, "one reconnect per resume")
  assert.equal(harness.ticketRequests(), 2)
  harness.client.disconnect()
})

test("a ticket that arrives after backgrounding opens nothing", async (context) => {
  useFakeTimers(context)
  const resolvers: ((ticket: string) => void)[] = []
  const harness = createHarness({
    ticketProvider: () => new Promise<string>((resolve) => { resolvers.push(resolve) })
  })
  harness.client.connect("token-late-ticket")
  harness.client.suspend()
  resolvers[0]?.("late-ticket-1")
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 0)

  harness.client.setAppActive(true)
  assert.equal(resolvers.length, 2, "resume requests a new ticket")
  resolvers[1]?.("fresh-ticket-2")
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 1)
  harness.client.disconnect()
})

test("connecting while backgrounded waits for the foreground", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.suspend()
  harness.client.connect("token-background-launch")
  await flushTicketRequest()
  assert.equal(harness.ticketRequests(), 0)
  assert.equal(harness.sockets.length, 0)

  harness.client.setAppActive(true)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 1)
  harness.client.disconnect()
})

test("an unreachable server is still reported unreachable after the foreground retry", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-unreachable")
  await flushTicketRequest()
  await failAttempts(context, harness, REALTIME_FAST_RECONNECT_ATTEMPTS)
  harness.sockets.at(-1)?.drop()
  assert.equal(harness.statuses.at(-1), "unreachable")
  const socketsBeforeResume = harness.sockets.length

  harness.client.suspend()
  harness.client.setAppActive(true)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, socketsBeforeResume + 1, "resume still tries at once")
  harness.sockets.at(-1)?.drop()
  assert.equal(harness.statuses.at(-1), "unreachable")
  harness.client.disconnect()
})

test("a refused session stays refused across background and foreground", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-refused")
  await flushTicketRequest()
  harness.sockets[0]?.drop(1008)
  const statusCount = harness.statuses.length

  harness.client.suspend()
  harness.client.setAppActive(true)
  await flushTicketRequest()

  assert.equal(harness.sockets.length, 1)
  assert.equal(harness.statuses.length, statusCount, "no status noise for a refused session")
})

test("a socket that never opens is abandoned after the connect timeout", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-stalled-handshake")
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 1)

  context.mock.timers.tick(REALTIME_CONNECT_TIMEOUT_MS - 1)
  assert.equal(harness.sockets[0]?.closed, false)
  context.mock.timers.tick(1)
  assert.equal(harness.sockets[0]?.closed, true)
  assert.equal(harness.statuses.at(-1), "reconnecting")

  context.mock.timers.tick(1_000)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 2)
  harness.sockets[1]?.open()
  context.mock.timers.tick(REALTIME_CONNECT_TIMEOUT_MS * 2)
  assert.equal(harness.sockets[1]?.closed, false, "an open socket is never timed out")
  harness.client.disconnect()
})

// ── Liveness (2026-10-01) ──────────────────────────────────────────────────
// Mobile WebSocket APIs never surface ping frames, so a half-open socket (a
// Wi-Fi to cellular handover, a NAT timeout) used to look connected until the
// platform gave up minutes later. The server now sends a heartbeat event every
// intervalMs; a client that has seen one treats silence as a dead socket.

function useFakeClock(context: TestContext): () => number {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  return () => Date.now()
}

const HEARTBEAT = JSON.stringify({ type: "realtime.heartbeat", payload: { intervalMs: 15_000 } })

test("a socket silent past the heartbeat interval plus grace is replaced at once", async (context) => {
  const now = useFakeClock(context)
  const harness = createHarness({ now })
  const events: unknown[] = []
  harness.client.onServerEvent((event) => { events.push(event) })
  harness.client.connect("token-liveness")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  harness.sockets[0]?.message(HEARTBEAT)
  assert.deepEqual(events, [], "heartbeats are a transport signal, not an app event")

  context.mock.timers.tick(15_000 + REALTIME_LIVENESS_GRACE_MS - 1)
  assert.equal(harness.sockets[0]?.closed, false)
  context.mock.timers.tick(1)
  assert.equal(harness.sockets[0]?.closed, true)
  assert.equal(harness.sockets[0]?.closeCode, REALTIME_LIVENESS_CLOSE_CODE)
  context.mock.timers.tick(0)
  await flushTicketRequest()
  assert.equal(harness.sockets.length, 2, "reconnected without waiting for a backoff")
  assert.deepEqual(harness.sockets[1]?.protocols, ["ticket-lifecycle-ticket-2"])
  harness.client.disconnect()
})

test("any inbound frame keeps a socket alive and heartbeats keep re-arming it", async (context) => {
  const now = useFakeClock(context)
  const harness = createHarness({ now })
  harness.client.connect("token-liveness-traffic")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  harness.sockets[0]?.message(HEARTBEAT)
  for (let second = 0; second < 120; second += 5) {
    context.mock.timers.tick(5_000)
    // Even a frame this build cannot parse proves the socket is alive.
    harness.sockets[0]?.message(second % 15 === 0 ? HEARTBEAT : "{not json")
  }
  assert.equal(harness.sockets[0]?.closed, false)
  assert.equal(harness.sockets.length, 1)
  harness.client.disconnect()
})

test("liveness is never enforced against a server that sends no heartbeats", async (context) => {
  const now = useFakeClock(context)
  const harness = createHarness({ now })
  harness.client.connect("token-old-server")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  context.mock.timers.tick(10 * 60_000)
  assert.equal(harness.sockets[0]?.closed, false)
  assert.equal(harness.sockets.length, 1)
  harness.client.disconnect()
})

test("returning to the foreground replaces an open socket that went silent while suspended", async (context) => {
  let clock = 1_000_000
  const harness = createHarness({ now: () => clock })
  useFakeTimers(context)
  harness.client.connect("token-silent-resume")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  harness.sockets[0]?.message(HEARTBEAT)
  // An inactive app keeps its socket; timers stall while iOS freezes it.
  harness.client.setAppActive(false)
  clock += 15_000 + REALTIME_LIVENESS_GRACE_MS
  harness.client.setAppActive(true)
  await flushTicketRequest()
  assert.equal(harness.sockets[0]?.closed, true)
  assert.equal(harness.sockets[0]?.closeCode, REALTIME_LIVENESS_CLOSE_CODE)
  assert.equal(harness.sockets.length, 2)
  harness.client.disconnect()
})

test("background and sign-out send a normal close frame so the server releases the socket at once", async (context) => {
  useFakeTimers(context)
  const harness = createHarness()
  harness.client.connect("token-close-codes")
  await flushTicketRequest()
  harness.sockets[0]?.open()
  harness.client.suspend()
  assert.equal(harness.sockets[0]?.closeCode, 1000)
  harness.client.setAppActive(true)
  await flushTicketRequest()
  harness.sockets[1]?.open()
  harness.client.disconnect()
  assert.equal(harness.sockets[1]?.closeCode, 1000)
})
