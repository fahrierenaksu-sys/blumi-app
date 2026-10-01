import assert from "node:assert/strict"
import { createServer as createHttpServer, type Server as HttpServer } from "node:http"
import { createConnection as createTcpConnection, type AddressInfo } from "node:net"
import test from "node:test"
import { REPORT_REASONS, type ServerEvent } from "@blumi/contracts"
import WebSocket from "ws"
import { createInMemoryAuthRepository } from "../auth/authRepository"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createGracefulShutdown } from "../operations/serviceLifecycle"
import {
  REALTIME_AUTHORIZATION_CACHE_TTL_MS,
  REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY,
  REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS
} from "./realtimeAuthorizationCache"
import {
  createRealtimeServer,
  REALTIME_CONNECTION_LEASE_RENEW_MS,
  REALTIME_HEARTBEAT_INTERVAL_MS,
  REALTIME_RESTART_CLOSE_CODE
} from "./realtimeServer"
import { createRealtimeTicketService } from "./realtimeTicketService"

const AUTHORIZED_TEST_ROOM_ID = "authorized-test-room"

test("realtime rejects invalid tickets before websocket upgrade", async () => {
  const harness = await createRealtimeHarness()
  try {
    const socket = new WebSocket(`${harness.url}/ws`, ["ticket-missing"])
    await expectUpgradeRejected(socket)
  } finally {
    await harness.close()
  }
})

test("realtime websocket upgrades can share the API HTTP server and port", async () => {
  const harness = await createRealtimeHarness({ shareHttpServer: true })
  try {
    const response = await fetch(harness.httpUrl)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "api-ok")

    const session = await harness.createSession("+905551110091", "Shared Port")
    const socket = await harness.connect(session.sessionToken)
    assert.equal(socket.readyState, WebSocket.OPEN)
    socket.close()
  } finally {
    await harness.close()
  }
})

test("realtime rejects the upgrade when ticket authentication throws", async () => {
  const harness = await createRealtimeHarness({ rejectTicketConsumption: true })
  try {
    const socket = new WebSocket(`${harness.url}/ws`, ["ticket-repository-error"])
    await expectUpgradeRejected(socket, 503)
  } finally {
    await harness.close()
  }
})

test("realtime ignores session tokens exposed in the URL query", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110000", "Query Token")
    const socket = new WebSocket(
      `${harness.url}/ws?sessionToken=${encodeURIComponent(session.sessionToken)}`
    )
    await expectUpgradeRejected(socket)
  } finally {
    await harness.close()
  }
})

test("realtime consumes each opaque ticket once and never accepts a session protocol", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110096", "Single Use")
    const leakedSessionSocket = new WebSocket(
      `${harness.url}/ws`,
      [`session-${session.sessionToken}`]
    )
    await expectUpgradeRejected(leakedSessionSocket)

    const issued = await harness.issueTicket(session.sessionToken)
    const firstSocket = await connectSocket(harness.url, issued)
    firstSocket.close()
    const replaySocket = new WebSocket(`${harness.url}/ws`, [`ticket-${issued}`])
    await expectUpgradeRejected(replaySocket)
  } finally {
    await harness.close()
  }
})

test("realtime does not complete the websocket upgrade before ticket authentication", async () => {
  const harness = await createRealtimeHarness({ pauseTicketConsumption: true })
  try {
    const session = await harness.createSession("+905551110095", "Delayed Auth")
    const ticket = await harness.issueTicket(session.sessionToken)
    const socket = new WebSocket(`${harness.url}/ws`, [`ticket-${ticket}`])

    await harness.ticketConsumptionStarted
    assert.equal(socket.readyState, WebSocket.CONNECTING)

    harness.releaseTicketConsumption()
    await waitForOpen(socket)
    assert.equal(socket.readyState, WebSocket.OPEN)
  } finally {
    harness.releaseTicketConsumption()
    await harness.close()
  }
})

test("realtime persists a connection before upgrade", async () => {
  const harness = await createRealtimeHarness()
  let signalRegistrationStarted!: () => void
  let releaseRegistration!: () => void
  const registrationStarted = new Promise<void>((resolve) => { signalRegistrationStarted = resolve })
  const registrationGate = new Promise<void>((resolve) => { releaseRegistration = resolve })
  const originalRegister = harness.presenceService.registerConnection.bind(harness.presenceService)
  harness.presenceService.registerConnection = async (connectionId, userId) => {
    signalRegistrationStarted()
    await registrationGate
    await originalRegister(connectionId, userId)
  }

  try {
    const session = await harness.createSession("+905551110094", "Lease Ordering")
    const ticket = await harness.issueTicket(session.sessionToken)
    const socket = new WebSocket(`${harness.url}/ws`, [`ticket-${ticket}`])
    const opened = waitForOpen(socket)
    await registrationStarted
    assert.equal(socket.readyState, WebSocket.CONNECTING)
    releaseRegistration()
    await opened

    const connection = harness.connectionManager.listConnections()[0]
    assert.ok(connection)
    assert.match(connection.connectionId, /^connection_[0-9a-f-]{36}$/i)
  } finally {
    releaseRegistration()
    await harness.close()
  }
})

// Lease renewal (2026-10-01): a pong only marks the socket alive. Due leases
// are renewed in one batch per heartbeat tick, which replaced a database
// transaction per pong (four round trips per socket every interval).
test("leases renew in batches on the heartbeat tick and a renewal racing a disconnect never resurrects a lease", async () => {
  const callbacks: { callback: () => void; ms: number }[] = []
  const harness = await createRealtimeHarness({ captureIntervalCallbacks: callbacks })
  const originalNow = Date.now
  let releaseRenewal: () => void = () => {}
  try {
    const a = await harness.createSession("+905551110097", "Lease Batch A")
    const b = await harness.createSession("+905551110098", "Lease Batch B")
    const socketA = await harness.connect(a.sessionToken)
    const socketB = await harness.connect(b.sessionToken)
    const [connectionA, connectionB] = [a.userId, b.userId].map((userId) =>
      harness.connectionManager.getUserConnections(userId)[0]!)
    const batches: string[][] = []
    let singleHeartbeats = 0
    const renewalGate = new Promise<void>((resolve) => { releaseRenewal = resolve })
    let signalRenewalStarted!: () => void
    const renewalStarted = new Promise<void>((resolve) => { signalRenewalStarted = resolve })
    const originalBatch = harness.presenceService.heartbeatConnections.bind(harness.presenceService)
    harness.presenceService.heartbeatConnection = async () => { singleHeartbeats += 1; return true }
    harness.presenceService.heartbeatConnections = async (connections) => {
      batches.push(connections.map((connection) => connection.connectionId).sort())
      signalRenewalStarted()
      await renewalGate
      return originalBatch(connections)
    }

    connectionA.socket.emit("pong")
    connectionB.socket.emit("pong")
    assert.equal(singleHeartbeats, 0, "a pong never touches the database")
    const heartbeat = callbacks.find((entry) => entry.ms === REALTIME_HEARTBEAT_INTERVAL_MS)
    assert.ok(heartbeat)
    Date.now = () => originalNow() + REALTIME_CONNECTION_LEASE_RENEW_MS
    heartbeat.callback()
    Date.now = originalNow
    await renewalStarted
    assert.deepEqual(batches, [[connectionA.connectionId, connectionB.connectionId].sort()])

    // A disconnects while the batch is in flight; its cleanup is not queued
    // behind the renewal, and the renewal cannot bring its lease back.
    const closedA = waitForClose(socketA)
    socketA.close()
    await closedA
    await waitUntil(() => harness.connectionManager.getConnection(connectionA.connectionId) === null)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (!await harness.presenceService.repository
        .heartbeatConnectionLease(connectionA.connectionId, a.userId, 90_000)) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    releaseRenewal()
    await waitUntil(() => batches.length === 1)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(await harness.presenceService.repository
      .heartbeatConnectionLease(connectionA.connectionId, a.userId, 90_000), false)
    assert.equal(socketB.readyState, WebSocket.OPEN)

    // A live socket whose lease vanished (purged elsewhere) must re-register.
    await harness.presenceService.repository.disconnectConnectionLease(connectionB.connectionId, b.userId)
    const closedB = waitForClose(socketB, 1_000)
    Date.now = () => originalNow() + 2 * REALTIME_CONNECTION_LEASE_RENEW_MS
    connectionB.socket.emit("pong")
    heartbeat.callback()
    Date.now = originalNow
    assert.equal(await closedB, 1011)
  } finally {
    Date.now = originalNow
    releaseRenewal()
    await harness.close()
  }
})

test("realtime waits for an in-flight room join before disconnect cleanup", async () => {
  const harness = await createRealtimeHarness({ allowAuthorizedTestRoom: true })
  const joinStarted = deferred<void>()
  const releaseJoin = deferred<void>()
  const joinFinished = deferred<void>()
  const disconnectFinished = deferred<void>()
  const order: string[] = []
  const originalJoin = harness.presenceService.joinRoom.bind(harness.presenceService)
  const originalDisconnect = harness.presenceService.disconnectConnection.bind(harness.presenceService)
  harness.presenceService.joinRoom = async (...args) => {
    order.push("join:start")
    joinStarted.resolve()
    await releaseJoin.promise
    try {
      const result = await originalJoin(...args)
      order.push("join:committed")
      return result
    } finally {
      joinFinished.resolve()
    }
  }
  harness.presenceService.disconnectConnection = async (...args) => {
    order.push("disconnect:start")
    try {
      return await originalDisconnect(...args)
    } finally {
      order.push("disconnect:finished")
      disconnectFinished.resolve()
    }
  }

  try {
    const session = await harness.createSession("+905551110077", "Join Disconnect Race")
    const socket = await harness.connect(session.sessionToken)
    socket.send(JSON.stringify({
      type: "room.join",
      payload: { roomId: AUTHORIZED_TEST_ROOM_ID }
    }))
    await joinStarted.promise

    const closed = waitForClose(socket)
    socket.close()
    await closed
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.deepEqual(order, ["join:start"], "disconnect waits while the room join is unresolved")

    releaseJoin.resolve()
    await Promise.all([joinFinished.promise, disconnectFinished.promise])
    assert.deepEqual(order, ["join:start", "join:committed", "disconnect:start", "disconnect:finished"])
    assert.equal(await harness.presenceService.findUserPresence(AUTHORIZED_TEST_ROOM_ID, session.userId), null)
  } finally {
    releaseJoin.resolve()
    await harness.close()
  }
})

test("a delayed join from a closed socket does not remove presence rejoined on another connection", async () => {
  const harness = await createRealtimeHarness({ allowAuthorizedTestRoom: true })
  const delayedJoinStarted = deferred<void>()
  const releaseDelayedJoin = deferred<void>()
  const disconnectFinished = deferred<void>()
  let joinCalls = 0
  const originalJoin = harness.presenceService.joinRoom.bind(harness.presenceService)
  const originalDisconnect = harness.presenceService.disconnectConnection.bind(harness.presenceService)
  harness.presenceService.joinRoom = async (...args) => {
    joinCalls += 1
    if (joinCalls === 1) {
      delayedJoinStarted.resolve()
      await releaseDelayedJoin.promise
    }
    return originalJoin(...args)
  }
  harness.presenceService.disconnectConnection = async (...args) => {
    try {
      return await originalDisconnect(...args)
    } finally {
      disconnectFinished.resolve()
    }
  }

  try {
    const session = await harness.createSession("+905551110078", "Room Rejoin")
    const closingSocket = await harness.connect(session.sessionToken)

    closingSocket.send(JSON.stringify({
      type: "room.join",
      payload: { roomId: AUTHORIZED_TEST_ROOM_ID }
    }))
    await delayedJoinStarted.promise

    const closed = waitForClose(closingSocket)
    closingSocket.close()
    await closed

    // A replacement connection may establish presence while the old socket's
    // room.join is still awaiting its presence write.
    const rejoinedSocket = await harness.connect(session.sessionToken)
    const rejoinedEvents = collectEvents(rejoinedSocket)
    rejoinedSocket.send(JSON.stringify({
      type: "room.join",
      payload: { roomId: AUTHORIZED_TEST_ROOM_ID }
    }))
    await rejoinedEvents.waitFor("room.joined")

    releaseDelayedJoin.resolve()
    await disconnectFinished.promise
    const presence = await harness.presenceService.findUserPresence(AUTHORIZED_TEST_ROOM_ID, session.userId)
    assert.ok(presence, "the closed connection's cleanup must preserve the other live connection's room presence")
    assert.equal(rejoinedSocket.readyState, WebSocket.OPEN)
  } finally {
    releaseDelayedJoin.resolve()
    await harness.close()
  }
})

test("realtime close waits for websocket lease cleanup before data close and clears timers", { timeout: 5000 }, async () => {
  const intervalHandles: ReturnType<typeof setInterval>[] = []
  const harness = await createRealtimeHarness({ captureIntervals: intervalHandles, allowAuthorizedTestRoom: true })
  const releaseDisconnect = deferred<void>()
  const disconnectStarted = deferred<void>()
  const order: string[] = []
  const session = await harness.createSession("+905551110076", "Realtime shutdown drain")
  const socket = await harness.connect(session.sessionToken)
  const events = collectEvents(socket)
  socket.send(JSON.stringify({ type: "room.join", payload: { roomId: AUTHORIZED_TEST_ROOM_ID } }))
  await events.waitFor("room.joined")

  const connection = harness.connectionManager.listConnections().find((entry) => entry.userId === session.userId)
  assert.ok(connection)
  assert.equal(await harness.presenceService.heartbeatConnection(connection.connectionId, session.userId), true)

  // A shutdown cleans every socket up in one batch (2026-10-01), not one
  // transaction per socket; the drain ordering is unchanged.
  const originalDisconnects = harness.presenceService.disconnectConnections.bind(harness.presenceService)
  harness.presenceService.disconnectConnection = async () => assert.fail("shutdown uses the batched cleanup")
  harness.presenceService.disconnectConnections = async (connections) => {
    order.push("lease:disconnect-start")
    assert.deepEqual(connections, [{ connectionId: connection.connectionId, userId: session.userId }])
    disconnectStarted.resolve()
    await releaseDisconnect.promise
    const rooms = await originalDisconnects(connections)
    order.push("lease:disconnect-finished")
    return rooms
  }

  const originalClearInterval = globalThis.clearInterval
  const clearedIntervals = new Set<unknown>()
  globalThis.clearInterval = ((interval: unknown) => {
    clearedIntervals.add(interval)
    originalClearInterval(interval as Parameters<typeof clearInterval>[0])
  }) as typeof globalThis.clearInterval

  try {
    let dataClosed = false
    const shutdown = createGracefulShutdown({
      markNotReady() {},
      drain: [() => harness.closeRealtime()],
      closeData: async () => {
        order.push("data:close")
        dataClosed = true
      }
    })
    const stopping = shutdown()

    // 1012 (service restart): clients spread their first retry over a few
    // seconds instead of reconnecting in the same instant (2026-10-01).
    assert.equal(await waitForClose(socket), REALTIME_RESTART_CLOSE_CODE,
      "server close completes with a restart code, not an abnormal 1006 termination")
    await disconnectStarted.promise
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(dataClosed, false, "database closure must wait for realtime disconnect cleanup")
    assert.deepEqual(order, ["lease:disconnect-start"])
    assert.equal(intervalHandles.length, 3,
      "the heartbeat, authorization sweep and lease cleanup timers were installed")
    for (const interval of intervalHandles) {
      assert.ok(clearedIntervals.has(interval), "close must clear each realtime maintenance timer")
    }

    releaseDisconnect.resolve()
    await stopping
    assert.deepEqual(order, ["lease:disconnect-start", "lease:disconnect-finished", "data:close"])
    assert.equal(await harness.presenceService.heartbeatConnection(connection.connectionId, session.userId), false)
    assert.equal(await harness.presenceService.findUserPresence(AUTHORIZED_TEST_ROOM_ID, session.userId), null)
    assert.equal(harness.connectionManager.listConnections().some((entry) => entry.connectionId === connection.connectionId), false)
  } finally {
    releaseDisconnect.resolve()
    globalThis.clearInterval = originalClearInterval
    await harness.close()
  }
})

test("realtime close rejects an upgrade whose connection lease registration is still pending", { timeout: 5000 }, async () => {
  const harness = await createRealtimeHarness()
  const registrationStarted = deferred<{ connectionId: string; userId: string }>()
  const releaseRegistration = deferred<void>()
  const originalRegister = harness.presenceService.registerConnection.bind(harness.presenceService)
  const originalDisconnect = harness.presenceService.disconnectConnection.bind(harness.presenceService)
  let disconnectCalls = 0
  harness.presenceService.registerConnection = async (connectionId, userId) => {
    registrationStarted.resolve({ connectionId, userId })
    await releaseRegistration.promise
    await originalRegister(connectionId, userId)
  }
  harness.presenceService.disconnectConnection = async (...args) => {
    disconnectCalls += 1
    return originalDisconnect(...args)
  }

  try {
    const session = await harness.createSession("+905551110075", "Pending realtime admission")
    const ticket = await harness.issueTicket(session.sessionToken)
    const socket = new WebSocket(`${harness.url}/ws`, [`ticket-${ticket}`])
    const rejected = expectUpgradeRejected(socket, 503)
    const registration = await registrationStarted.promise

    let closeFinished = false
    const stopping = harness.closeRealtime().then(() => { closeFinished = true })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(closeFinished, false, "close must wait for the in-flight upgrade and lease rollback")

    releaseRegistration.resolve()
    await rejected
    await stopping
    assert.equal(disconnectCalls, 1)
    assert.equal(await harness.presenceService.heartbeatConnection(registration.connectionId, registration.userId), false)
    assert.equal(harness.connectionManager.listConnections().some((entry) => entry.connectionId === registration.connectionId), false)
  } finally {
    releaseRegistration.resolve()
    await harness.close()
  }
})

test("realtime close timeout terminates an unresponsive websocket and drains its lease", { timeout: 5000 }, async () => {
  const harness = await createRealtimeHarness()
  const session = await harness.createSession("+905551110074", "Unresponsive realtime peer")
  const ticket = await harness.issueTicket(session.sessionToken)
  const socket = await connectUnresponsiveWebSocket(harness.url, ticket)
  const connection = harness.connectionManager.listConnections().find((entry) => entry.userId === session.userId)
  assert.ok(connection)

  const originalSetTimeout = globalThis.setTimeout
  let acceleratedCloseTimeouts = 0
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    const adjustedArgs = [...args] as Parameters<typeof setTimeout>
    if (adjustedArgs[1] === 30_000) {
      adjustedArgs[1] = 15
      acceleratedCloseTimeouts += 1
    }
    return originalSetTimeout(...adjustedArgs)
  }) as typeof globalThis.setTimeout

  try {
    const startedAt = Date.now()
    await harness.closeRealtime()
    assert.equal(acceleratedCloseTimeouts, 1, "the unresponsive peer must use ws's bounded close handshake timeout")
    assert.ok(Date.now() - startedAt < 1000, "the test-only shortened timeout should bound this regression")
    assert.equal(socket.destroyed, true, "a peer that ignores the close frame is forcibly torn down")
    assert.equal(await harness.presenceService.heartbeatConnection(connection.connectionId, session.userId), false)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    socket.destroy()
    await harness.close()
  }
})

test("realtime closes oversized client messages before parsing them", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110099", "Payload Test")
    const socket = await harness.connect(session.sessionToken)
    socket.send("x".repeat(70 * 1024))
    const closeCode = await waitForClose(socket, 1000)
    assert.equal(closeCode, 1009)
  } finally {
    await harness.close()
  }
})

test("realtime closes a connection that floods client events", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110098", "Flood Test")
    const socket = await harness.connect(session.sessionToken)
    for (let index = 0; index < 61; index += 1) {
      socket.send(JSON.stringify({ type: "unknown", payload: { index } }))
    }
    assert.equal(await waitForClose(socket, 1000), 4429)
  } finally {
    await harness.close()
  }
})

test("slow authorization admits at most eight concurrent events before closing a flood", async () => {
  const harness = await createRealtimeHarness()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  harness.authService.isRealtimeUserAllowed = async () => { calls += 1; await gate; return true }
  // The family-aware authorization boundary must have the same admission protection.
  Object.assign(harness.authService, {
    isRealtimeSessionAllowed: async () => { calls += 1; await gate; return true }
  })
  try {
    const session = await harness.createSession("+905551110088", "Slow Auth")
    const socket = await harness.connect(session.sessionToken)
    for (let index = 0; index < 150; index += 1) {
      socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    }
    const closeCode = await waitForClose(socket, 300).catch(() => 0)
    assert.ok(calls <= 8, `authorization admitted ${calls} concurrent events`)
    assert.equal(closeCode, 4429)
  } finally {
    release()
    await harness.close()
  }
})

test("revoked socket cannot read private threads or receive private deliveries", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110087", "Revoked")
    const inbound = await harness.connect(session.sessionToken)
    const outbound = await harness.connect(session.sessionToken)
    const received: unknown[] = []
    outbound.on("message", (data) => received.push(JSON.parse(data.toString())))
    await harness.authService.revokeSession(session.sessionToken)
    const inboundClose = waitForClose(inbound, 500).catch(() => 0)
    const outboundClose = waitForClose(outbound, 500).catch(() => 0)
    inbound.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    harness.connectionManager.sendToUser(session.userId, {
      type: "chat.thread_listed", payload: { userId: session.userId, threads: [] }
    })
    assert.deepEqual(await Promise.all([inboundClose, outboundClose]), [4403, 4403])
    assert.deepEqual(received, [])
  } finally {
    await harness.close()
  }
})

test("token rotation preserves a socket until its session family is revoked", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110086", "Rotated")
    const socket = await harness.connect(session.sessionToken)
    const rotated = await harness.authService.refreshSession(session.sessionToken)
    assert.ok(rotated)
    const events = collectEvents(socket)
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await events.waitFor("chat.thread_listed")
    await harness.authService.revokeSession(rotated.sessionToken)
    const closed = waitForClose(socket, 500).catch(() => 0)
    socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    assert.equal(await closed, 4403)
  } finally {
    await harness.close()
  }
})

test("an expired session family cannot receive a private event", async () => {
  const clock = { now: Date.now() }
  const harness = await createRealtimeHarness({ authorizationClock: () => clock.now })
  try {
    const session = await harness.createSession("+905551110085", "Expired")
    const socket = await harness.connect(session.sessionToken)
    const resolved = await harness.authService.getSession(session.sessionToken)
    assert.ok(resolved)
    const check = harness.authService.isRealtimeSessionAllowed.bind(harness.authService)
    harness.authService.isRealtimeSessionAllowed = (identity) => check(identity, new Date(resolved.session.expiresAt))
    // The decision primed at upgrade never outlives the token's own expiry,
    // even though that is far sooner than the cache TTL here.
    clock.now = Date.parse(resolved.session.expiresAt)
    const received: unknown[] = []
    socket.on("message", (data) => received.push(data))
    const closed = waitForClose(socket, 500)
    harness.connectionManager.sendToUser(session.userId, { type: "chat.thread_listed", payload: { userId: session.userId, threads: [] } })
    assert.equal(await closed, 4403)
    assert.deepEqual(received, [])
  } finally {
    await harness.close()
  }
})

test("revocation leaves another session family for the same user authorized", async () => {
  const harness = await createRealtimeHarness()
  try {
    const first = await harness.createSession("+905551110084", "Two Sessions")
    const second = await harness.createSession("+905551110084", "Two Sessions", new Date(Date.now() + 61_000))
    const firstSocket = await harness.connect(first.sessionToken)
    const secondSocket = await harness.connect(second.sessionToken)
    await harness.authService.revokeSession(first.sessionToken)
    const closed = waitForClose(firstSocket, 500)
    const events = collectEvents(secondSocket)
    harness.connectionManager.sendToUser(first.userId, { type: "chat.thread_listed", payload: { userId: first.userId, threads: [] } })
    assert.equal(await closed, 4403)
    await events.waitFor("chat.thread_listed")
    assert.equal(secondSocket.readyState, WebSocket.OPEN)
  } finally {
    await harness.close()
  }
})

test("realtime closes the socket when authorization becomes unavailable", async () => {
  const clock = { now: 1_000_000 }
  const harness = await createRealtimeHarness({ rejectRealtimeAuthorization: true, authorizationClock: () => clock.now })
  try {
    const session = await harness.createSession("+905551110091", "Auth Failure")
    const socket = await harness.connect(session.sessionToken)
    // The upgrade primed the decision; once it expires, the first event needs
    // a check, and a check that cannot run fails closed.
    clock.now += REALTIME_AUTHORIZATION_CACHE_TTL_MS
    socket.send(JSON.stringify({ type: "unknown", payload: {} }))

    assert.equal(await waitForClose(socket, 1000), 1011)
  } finally {
    await harness.close()
  }
})

test("realtime rate limiting is shared across a user's connections", async () => {
  const harness = await createRealtimeHarness()
  try {
    const session = await harness.createSession("+905551110097", "User Flood")
    const firstSocket = await harness.connect(session.sessionToken)
    const secondSocket = await harness.connect(session.sessionToken)
    const firstClose = waitForClose(firstSocket, 1000).catch(() => 0)
    const secondClose = waitForClose(secondSocket, 1000).catch(() => 0)
    for (let index = 0; index < 50; index += 1) {
      firstSocket.send(JSON.stringify({ type: "unknown", payload: { index } }))
      secondSocket.send(JSON.stringify({ type: "unknown", payload: { index } }))
    }
    secondSocket.send(JSON.stringify({ type: "unknown", payload: { index: 100 } }))

    const closeCodes = await Promise.race([
      Promise.all([firstClose, secondClose]),
      new Promise<number[]>((resolve) => setTimeout(() => resolve([0, 0]), 1200))
    ])
    assert.ok(closeCodes.includes(4429))
  } finally {
    await harness.close()
  }
})

// Owner decision 2026-09-30: the legacy public lobby is retired. The former
// "room join emits joined snapshot and nearby presence" and lobby
// "invite accept opens a mini room" tests encoded the removed behaviour; the
// chat-initiated room flow, mini-room reactions and connection matches are
// covered end to end in legacyLobbyRetirement.test.ts.
test("default realtime server rejects the retired public lobby without presence data", async () => {
  const harness = await createRealtimeHarness()
  try {
    const first = await harness.createSession("+905551110001", "Aylin")
    const second = await harness.createSession("+905551110002", "Defne")
    const firstSocket = await harness.connect(first.sessionToken)
    const secondSocket = await harness.connect(second.sessionToken)
    const firstEvents = collectEvents(firstSocket)
    const secondEvents = collectEvents(secondSocket)

    for (const socket of [firstSocket, secondSocket]) {
      socket.send(JSON.stringify({ type: "room.join", payload: { roomId: "public-lobby" } }))
    }
    const rejected = await firstEvents.waitFor("realtime.error")
    assert.deepEqual(rejected.payload, {
      code: "PRESENCE_ROOM_UNAVAILABLE",
      requestType: "room.join",
      message: "That room is not available."
    })
    await secondEvents.waitFor("realtime.error")
    // A no-op round trip proves no later presence event is still in flight.
    firstSocket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await firstEvents.waitFor("chat.thread_listed")
    for (const events of [firstEvents, secondEvents]) {
      assert.deepEqual(
        events.all().filter((event) => event.type !== "chat.thread_listed").map((event) => event.type),
        ["realtime.error"]
      )
    }
    assert.equal(await harness.presenceService.findUserPresence("public-lobby", first.userId), null)
    assert.equal(await harness.presenceService.findUserPresence("public-lobby", second.userId), null)
  } finally {
    await harness.close()
  }
})

const THREAD_LISTED = (userId: string): ServerEvent => ({
  type: "chat.thread_listed", payload: { userId, threads: [] }
})

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition")
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
}

async function primeAuthorization(harness: Awaited<ReturnType<typeof createRealtimeHarness>>, socket: WebSocket) {
  const events = collectEvents(socket)
  socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
  await events.waitFor("chat.thread_listed")
  return events
}

test("realtime authorization costs no check inside the window primed at upgrade, then one per TTL window", async () => {
  const clock = { now: 1_000_000 }
  const harness = await createRealtimeHarness({ authorizationClock: () => clock.now })
  try {
    const session = await harness.createSession("+905551110070", "Query Count")
    const socket = await harness.connect(session.sessionToken)
    let received = 0
    socket.on("message", () => { received += 1 })
    harness.authorizationQueries.count = 0
    const inbound = 10
    const outbound = 10
    for (let index = 0; index < inbound; index += 1) {
      socket.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
      await waitUntil(() => received === index + 1)
    }
    for (let index = 0; index < outbound; index += 1) {
      harness.connectionManager.sendToUser(session.userId, THREAD_LISTED(session.userId))
    }
    await waitUntil(() => received === inbound + outbound)
    // Before the cache: 2 queries per inbound event, per inbound reply and per
    // outbound event (2 x (10 + 10 + 10) = 60). With the 2 s cache: one shared
    // check. Since 2026-10-01 the upgrade's own ticket check primes it: none.
    assert.equal(harness.authorizationQueries.count, 0,
      `${inbound} inbound + ${outbound} outbound events cost ${harness.authorizationQueries.count} authorization queries`)
    clock.now += REALTIME_AUTHORIZATION_CACHE_TTL_MS
    harness.connectionManager.sendToUser(session.userId, THREAD_LISTED(session.userId))
    await waitUntil(() => received === inbound + outbound + 1)
    assert.equal(harness.authorizationQueries.count, 2, "an expired window re-checks the database")
  } finally {
    await harness.close()
  }
})

test("sign-out closes a socket with a cached authorization immediately, without waiting for traffic", async () => {
  const clock = { now: 1_000_000 }
  const harness = await createRealtimeHarness({ authorizationClock: () => clock.now })
  try {
    const session = await harness.createSession("+905551110071", "Cached Revoke")
    const socket = await harness.connect(session.sessionToken)
    await primeAuthorization(harness, socket)
    const received: unknown[] = []
    socket.on("message", (data) => received.push(data))
    const closed = waitForClose(socket, 500)
    await harness.authService.revokeSession(session.sessionToken)
    harness.connectionManager.sendToUser(session.userId, THREAD_LISTED(session.userId))
    assert.equal(await closed, 4403)
    assert.deepEqual(received, [])
  } finally {
    await harness.close()
  }
})

test("a moderation action closes the reported user's cached socket immediately", async () => {
  const clock = { now: 1_000_000 }
  const harness = await createRealtimeHarness({ authorizationClock: () => clock.now })
  try {
    const reporter = await harness.createSession("+905551110072", "Reporter")
    const reported = await harness.createSession("+905551110073", "Reported")
    const reporterSocket = await harness.connect(reporter.sessionToken)
    const reportedSocket = await harness.connect(reported.sessionToken)
    await primeAuthorization(harness, reporterSocket)
    await primeAuthorization(harness, reportedSocket)
    // The PostgreSQL safety repository writes the ban onto the account; the
    // in-memory one does not, so model the committed ban at the auth boundary.
    const check = harness.authService.isRealtimeSessionAllowed.bind(harness.authService)
    harness.authService.isRealtimeSessionAllowed = async (identity, now) =>
      identity.userId === reported.userId ? false : check(identity, now)
    const closed = waitForClose(reportedSocket, 500)
    const { report } = await harness.safetyService.reportUser(reporter.userId, {
      reportedUserId: reported.userId,
      reason: REPORT_REASONS[0]
    })
    await harness.safetyService.resolveReport(report.reportId, {
      action: "ban",
      admin: { operatorId: "operator_1", tokenId: "token_1" }
    })
    assert.equal(await closed, 4403)
    assert.equal(reporterSocket.readyState, WebSocket.OPEN)
  } finally {
    await harness.close()
  }
})

test("a revocation without a local signal is enforced once the bounded TTL window ends", async () => {
  const clock = { now: 1_000_000 }
  const harness = await createRealtimeHarness({ authorizationClock: () => clock.now })
  try {
    const session = await harness.createSession("+905551110074", "Remote Revoke")
    const socket = await harness.connect(session.sessionToken)
    const events = await primeAuthorization(harness, socket)
    // Another instance or a session expiry: the database says no, but this
    // process received no invalidation.
    harness.authService.isRealtimeSessionAllowed = async () => false
    clock.now += REALTIME_AUTHORIZATION_CACHE_TTL_MS - 1
    harness.connectionManager.sendToUser(session.userId, THREAD_LISTED(session.userId))
    await waitUntil(() => events.all().length === 2)
    clock.now += 1
    const closed = waitForClose(socket, 500)
    harness.connectionManager.sendToUser(session.userId, THREAD_LISTED(session.userId))
    assert.equal(await closed, 4403)
    assert.equal(events.all().length, 2, "no delivery after the staleness window")
  } finally {
    await harness.close()
  }
})

// Batched sweep (2026-10-01): one session query and one account query per 500
// sockets replaced two queries per socket every 30 s (333 queries/s at 5,000).
test("the periodic authorization sweep checks every socket in one batch and closes the denied ones", async () => {
  const callbacks: { callback: () => void; ms: number }[] = []
  const harness = await createRealtimeHarness({ captureIntervalCallbacks: callbacks })
  try {
    const sockets: { userId: string; socket: WebSocket }[] = []
    for (let index = 0; index < REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY + 4; index += 1) {
      const session = await harness.createSession(`+9055522200${String(index).padStart(2, "0")}`, `Sweep ${index}`)
      sockets.push({ userId: session.userId, socket: await harness.connect(session.sessionToken) })
    }
    const denied = sockets[0]!
    const batches: number[] = []
    let singleChecks = 0
    harness.authService.isRealtimeSessionAllowed = async () => { singleChecks += 1; return true }
    harness.authService.areRealtimeSessionsAllowed = async (identities) => {
      batches.push(identities.length)
      return identities.map((identity) => ({
        allowed: identity.userId !== denied.userId,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString()
      }))
    }
    const closed = waitForClose(denied.socket, 1000)
    const sweep = callbacks.find((entry) => entry.ms === REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS)
    assert.ok(sweep)
    sweep.callback()
    assert.equal(await closed, 4403)
    assert.deepEqual(batches, [sockets.length])
    assert.equal(singleChecks, 0)
    for (const entry of sockets.slice(1)) assert.equal(entry.socket.readyState, WebSocket.OPEN)
  } finally {
    await harness.close()
  }
})

test("a failed sweep closes nothing at once, and the next check after the TTL fails closed", async () => {
  const callbacks: { callback: () => void; ms: number }[] = []
  const clock = { now: 1_000_000 }
  const harness = await createRealtimeHarness({ captureIntervalCallbacks: callbacks, authorizationClock: () => clock.now })
  try {
    const session = await harness.createSession("+905552220099", "Sweep Outage")
    const socket = await harness.connect(session.sessionToken)
    let sweeps = 0
    harness.authService.areRealtimeSessionsAllowed = async () => {
      sweeps += 1
      throw new Error("authorization store unavailable")
    }
    harness.authService.isRealtimeSessionAllowed = async () => {
      throw new Error("authorization store unavailable")
    }
    const sweep = callbacks.find((entry) => entry.ms === REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS)
    assert.ok(sweep)
    sweep.callback()
    await waitUntil(() => sweeps === 1)
    // A database blip must not disconnect every user at once (a reconnect storm).
    const events = await primeAuthorization(harness, socket)
    assert.equal(socket.readyState, WebSocket.OPEN)
    clock.now += REALTIME_AUTHORIZATION_CACHE_TTL_MS
    const closed = waitForClose(socket, 1000)
    harness.connectionManager.sendToUser(session.userId, THREAD_LISTED(session.userId))
    assert.equal(await closed, 1011)
    assert.equal(events.all().length, 1, "nothing is delivered once the decision cannot be renewed")
  } finally {
    await harness.close()
  }
})

test("two room sockets share motion immediately, reconnect at the accepted target, and chat survives movement bursts", async () => {
  const harness = await createRealtimeHarness()
  try {
    const a = await harness.createSession("+905551110121", "Motion A")
    const b = await harness.createSession("+905551110122", "Motion B")
    const startedAt = new Date().toISOString()
    await harness.miniRoomService.repository.saveInvite({ inviteId: "motion-invite", senderUserId: a.userId,
      recipientUserId: b.userId, status: "pending", createdAt: startedAt })
    assert.equal(await harness.miniRoomService.repository.acceptPendingInvite({ inviteId: "motion-invite",
      decidedAt: startedAt, miniRoom: { miniRoomId: "motion-room", lobbyRoomId: "retired",
        livekitRoomName: "motion-test", participantUserIds: [a.userId, b.userId], startedAt } }), "accepted")
    const sa = await harness.connect(a.sessionToken), sb = await harness.connect(b.sessionToken)
    const ea = collectEvents(sa), eb = collectEvents(sb)
    const enter = (socket: WebSocket) => socket.send(JSON.stringify({ type: "mini_room.scene_enter", payload: { miniRoomId: "motion-room" } }))
    enter(sa); enter(sb)
    await eb.waitForMatching("mini_room.motion_snapshot", event => event.payload.avatars.every(avatar => avatar.present))
    const began = performance.now()
    sa.send(JSON.stringify({ type: "mini_room.move", payload: { miniRoomId: "motion-room", sequence: 1, x: .5, y: .7 } }))
    const received = await eb.waitFor("mini_room.avatar_moved")
    assert.equal(received.payload.avatar.userId, a.userId)
    assert.equal(received.payload.avatar.x, .5)
    assert.ok(performance.now() - began < 1000, "no four-second queue or polling")
    for (let sequence = 2; sequence <= 100; sequence++) sa.send(JSON.stringify({ type: "mini_room.move",
      payload: { miniRoomId: "motion-room", sequence, x: .5, y: .7 } }))
    sa.send(JSON.stringify({ type: "chat.list_threads", payload: {} }))
    await ea.waitFor("chat.thread_listed")
    assert.equal(sa.readyState, WebSocket.OPEN, "movement never consumes or closes the chat budget")
    const revision = received.payload.avatar.revision
    sa.close()
    await eb.waitForMatching("mini_room.motion_snapshot", event =>
      event.payload.avatars.some(avatar => avatar.userId === a.userId && !avatar.present && avatar.revision > revision))
    const reconnected = await harness.connect(a.sessionToken), er = collectEvents(reconnected)
    enter(reconnected)
    const snapshot = await er.waitForMatching("mini_room.motion_snapshot", event => event.payload.avatars.every(avatar => avatar.present))
    assert.equal(snapshot.payload.avatars.find(avatar => avatar.userId === a.userId)?.x, .5)
    await harness.miniRoomService.leaveMiniRoom("motion-room", a.userId)
    const count = eb.all().filter(event => event.type === "mini_room.avatar_moved").length
    reconnected.send(JSON.stringify({ type: "mini_room.move", payload: { miniRoomId: "motion-room", sequence: 1, x: .6, y: .7 } }))
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(eb.all().filter(event => event.type === "mini_room.avatar_moved").length, count)
  } finally { await harness.close() }
})

async function createRealtimeHarness(options: {
  pauseTicketConsumption?: boolean
  rejectTicketConsumption?: boolean
  rejectRealtimeAuthorization?: boolean
  shareHttpServer?: boolean
  captureIntervals?: ReturnType<typeof setInterval>[]
  allowAuthorizedTestRoom?: boolean
  captureIntervalCallbacks?: { callback: () => void; ms: number }[]
  authorizationClock?: () => number
} = {}) {
  // Each realtime authorization check costs these two queries in PostgreSQL.
  const authorizationQueries = { count: 0 }
  const authStore = createBlumiBackendStore()
  const baseAuthRepository = createInMemoryAuthRepository(authStore)
  const authService = createAuthService({
    codeFactory: () => "123456",
    store: authStore,
    repository: {
      ...baseAuthRepository,
      async hasActiveSessionFamily(input) {
        authorizationQueries.count += 1
        return baseAuthRepository.hasActiveSessionFamily(input)
      },
      async findAccountByUserId(userId) {
        authorizationQueries.count += 1
        return baseAuthRepository.findAccountByUserId(userId)
      }
    }
  })
  if (options.rejectRealtimeAuthorization) {
    authService.isRealtimeSessionAllowed = async () => {
      throw new Error("authorization store unavailable")
    }
  }
  const baseRealtimeTicketService = createRealtimeTicketService({ authService })
  let signalTicketConsumptionStarted: (() => void) | undefined
  let releaseTicketConsumption: (() => void) | undefined
  const ticketConsumptionStarted = new Promise<void>((resolve) => {
    signalTicketConsumptionStarted = resolve
  })
  const ticketConsumptionGate = new Promise<void>((resolve) => {
    releaseTicketConsumption = resolve
  })
  const realtimeTicketService = options.rejectTicketConsumption
    ? {
        issue: baseRealtimeTicketService.issue,
        async consume() {
          throw new Error("ticket repository unavailable")
        }
      }
    : options.pauseTicketConsumption
    ? {
        issue: baseRealtimeTicketService.issue,
        async consume(ticket: string, now?: Date) {
          signalTicketConsumptionStarted?.()
          await ticketConsumptionGate
          return baseRealtimeTicketService.consume(ticket, now)
        }
      }
    : baseRealtimeTicketService
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const roomService = createRoomService()
  await roomService.repository.saveLayout({
    roomId: AUTHORIZED_TEST_ROOM_ID,
    proximityRadius: 180,
    spots: [
      { spotId: "seat-a", kind: "seat", x: 0, y: 0 },
      { spotId: "seat-b", kind: "seat", x: 40, y: 0 }
    ]
  })
  const presenceService = createPresenceService({ roomService })
  const livekitTokenService = createLivekitTokenService()
  const miniRoomService = createMiniRoomService({
    presenceService,
    safetyService,
    chatService,
    livekitTokenService
  })
  const connectionService = createConnectionService({ miniRoomService, safetyService })
  const reactionService = createReactionService()
  const sharedHttpServer: HttpServer | undefined = options.shareHttpServer
    ? createHttpServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/plain" })
        response.end("api-ok")
      })
    : undefined
  if (sharedHttpServer) {
    await new Promise<void>((resolve, reject) => {
      sharedHttpServer.once("error", reject)
      sharedHttpServer.listen(0, "127.0.0.1", () => {
        sharedHttpServer.off("error", reject)
        resolve()
      })
    })
  }
  const createRealtimeServerForHarness = () => createRealtimeServer({
    authService,
    chatService,
    safetyService,
    presenceService,
    miniRoomService,
    connectionService,
    reactionService,
    realtimeTicketService,
    httpServer: sharedHttpServer,
    // The production default denies every presence room. Mechanism tests opt
    // into one synthetic authorized room to keep join/disconnect coverage.
    ...(options.allowAuthorizedTestRoom
      ? { isPresenceRoomAllowed: (_actor: unknown, roomId: string) => roomId === AUTHORIZED_TEST_ROOM_ID }
      : {}),
    ...(options.authorizationClock ? { authorizationClock: options.authorizationClock } : {})
  })
  let realtimeServer: ReturnType<typeof createRealtimeServer>
  if (options.captureIntervals || options.captureIntervalCallbacks) {
    const originalSetInterval = globalThis.setInterval
    globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
      const interval = originalSetInterval(...args)
      options.captureIntervals?.push(interval)
      options.captureIntervalCallbacks?.push({ callback: args[0] as () => void, ms: Number(args[1]) })
      return interval
    }) as typeof globalThis.setInterval
    try {
      realtimeServer = createRealtimeServerForHarness()
    } finally {
      globalThis.setInterval = originalSetInterval
    }
  } else {
    realtimeServer = createRealtimeServerForHarness()
  }
  await realtimeServer.listen({ port: 0, host: "127.0.0.1" })
  const address = realtimeServer.address() as AddressInfo
  let closePromise: Promise<void> | undefined
  const closeRealtime = () => {
    closePromise ??= realtimeServer.close()
    return closePromise
  }

  return {
    authService,
    miniRoomService,
    safetyService,
    authorizationQueries,
    presenceService,
    connectionManager: realtimeServer.connectionManager,
    closeRealtime,
    url: `ws://127.0.0.1:${address.port}`,
    httpUrl: `http://127.0.0.1:${address.port}`,
    ticketConsumptionStarted,
    releaseTicketConsumption() {
      releaseTicketConsumption?.()
    },
    async issueTicket(sessionToken: string) {
      const issued = await realtimeTicketService.issue(sessionToken)
      assert.ok(issued)
      return issued.ticket
    },
    async connect(sessionToken: string) {
      const issued = await realtimeTicketService.issue(sessionToken)
      assert.ok(issued)
      return connectSocket(`ws://127.0.0.1:${address.port}`, issued.ticket)
    },
    async createSession(phoneNumber: string, displayName: string, now = new Date()) {
      await authService.sendCode(phoneNumber, now)
      const verified = await authService.verifyCode(phoneNumber, "123456", now)
      await authService.updateProfile(verified.sessionToken, {
        displayName,
        age: 24,
        gender: "woman",
        avatarPresetId: "avatar_v2_body_default"
      })
      for (const step of ["profile", "avatar", "room"] as const) {
        await authService.completeOnboardingStep(verified.sessionToken, step)
      }
      return {
        userId: verified.account.userId,
        sessionToken: verified.sessionToken
      }
    },
    async close() {
      await closeRealtime()
      if (sharedHttpServer?.listening) {
        await new Promise<void>((resolve, reject) => {
          sharedHttpServer.close((error) => {
            if (error) reject(error)
            else resolve()
          })
        })
      }
    }
  }
}

function collectEvents(socket: WebSocket) {
  const events: ServerEvent[] = []
  const waiters = new Set<{
    type: ServerEvent["type"]
    accepts: (event: ServerEvent) => boolean
    resolve: (event: ServerEvent) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  socket.on("message", (data) => {
    const event = JSON.parse(data.toString()) as ServerEvent
    events.push(event)
    for (const waiter of waiters) {
      if (waiter.type === event.type && waiter.accepts(event)) {
        clearTimeout(waiter.timer)
        waiters.delete(waiter)
        waiter.resolve(event)
      }
    }
  })
  return {
    all(): ServerEvent[] {
      return [...events]
    },
    waitFor<T extends ServerEvent["type"]>(
      type: T
    ): Promise<Extract<ServerEvent, { type: T }>> {
      const existing = events.find((event) => event.type === type)
      if (existing) {
        return Promise.resolve(existing as Extract<ServerEvent, { type: T }>)
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          type,
          accepts: () => true,
          resolve: (event: ServerEvent) =>
            resolve(event as Extract<ServerEvent, { type: T }>),
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter)
            reject(new Error(`Timed out waiting for ${type}`))
          }, 1000)
        }
        waiters.add(waiter)
      })
    },
    waitForMatching<T extends ServerEvent["type"]>(
      type: T,
      predicate: (event: Extract<ServerEvent, { type: T }>) => boolean
    ): Promise<Extract<ServerEvent, { type: T }>> {
      const existing = events.find(
        (event) =>
          event.type === type &&
          predicate(event as Extract<ServerEvent, { type: T }>)
      )
      if (existing) {
        return Promise.resolve(existing as Extract<ServerEvent, { type: T }>)
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          type,
          accepts: (event: ServerEvent) =>
            predicate(event as Extract<ServerEvent, { type: T }>),
          resolve: (event: ServerEvent) => {
            resolve(event as Extract<ServerEvent, { type: T }>)
          },
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter)
            reject(new Error(`Timed out waiting for ${type}`))
          }, 1000)
        }
        waiters.add(waiter)
      })
    }
  }
}

async function connectSocket(baseUrl: string, ticket: string): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl}/ws`, [`ticket-${ticket}`])
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve())
    socket.once("error", reject)
  })
  return socket
}

async function connectUnresponsiveWebSocket(baseUrl: string, ticket: string) {
  const address = new URL(baseUrl)
  const socket = createTcpConnection({ host: address.hostname, port: Number(address.port) })
  await new Promise<void>((resolve, reject) => {
    let response = Buffer.alloc(0)
    const cleanup = () => {
      socket.off("data", onData)
      socket.off("error", onError)
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onData = (chunk: Buffer) => {
      response = Buffer.concat([response, chunk])
      const headerEnd = response.indexOf("\r\n\r\n")
      if (headerEnd < 0) return
      const headers = response.subarray(0, headerEnd).toString("latin1")
      cleanup()
      try {
        assert.match(headers, /^HTTP\/1\.1 101 /)
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    socket.on("data", onData)
    socket.once("error", onError)
    socket.once("connect", () => {
      socket.write(
        `GET /ws HTTP/1.1\r\n` +
        `Host: ${address.host}\r\n` +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
        "Sec-WebSocket-Version: 13\r\n" +
        `Sec-WebSocket-Protocol: ticket-${ticket}\r\n\r\n`
      )
    })
  })
  socket.on("error", () => {})
  return socket
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value?: T) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve: (value) => resolve(value as T) }
}

async function waitForOpen(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve)
    socket.once("error", reject)
  })
}

async function waitForClose(socket: WebSocket, timeoutMs = 1000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket close"))
    }, timeoutMs)
    socket.once("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

async function expectUpgradeRejected(
  socket: WebSocket,
  expectedStatus = 401
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for upgrade rejection")), 1000)
    socket.once("error", (error) => {
      clearTimeout(timer)
      assert.match(error.message, new RegExp(`Unexpected server response: ${expectedStatus}`))
      resolve()
    })
  })
}
