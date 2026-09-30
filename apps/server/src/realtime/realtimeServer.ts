import { createServer, type IncomingMessage, type Server } from "node:http"
import { randomUUID } from "node:crypto"
import type { Duplex } from "node:stream"
import { WebSocketServer, type RawData, type WebSocket } from "ws"
import proxyAddr from "@fastify/proxy-addr"
import type { ClientEvent } from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { ChatService } from "../chat/chatService"
import type { ConnectionService } from "../connections/connectionService"
import type { MiniRoomService } from "../miniRooms/miniRoomService"
import {
  createNotificationService,
  type NotificationService
} from "../notifications/notificationService"
import type { PresenceService } from "../presence/presenceService"
import type { ReactionService } from "../reactions/reactionService"
import type { SafetyService } from "../safety/safetyService"
import {
  createConnectionManager,
  type ConnectionManager,
  type RealtimeConnection
} from "./connectionManager"
import {
  authenticateRealtimeRequest,
  type RealtimeSessionActor
} from "./realtimeAuth"
import {
  createRealtimeAuthorizationCache,
  forEachWithConcurrency,
  REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY
} from "./realtimeAuthorizationCache"
import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"
import { createRealtimeRouter, readRealtimeClientMessageId } from "./realtimeRouter"
import { isPublicRequestError } from "../errors/publicRequestError"
import type { RealtimePresenceRoomPolicy } from "./realtimePresencePolicy"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import type { RealtimeTicketService } from "./realtimeTicketService"

const HEARTBEAT_INTERVAL_MS = 30_000
const CONNECTION_LEASE_CLEANUP_INTERVAL_MS = 60_000
const MAX_REALTIME_MESSAGE_BYTES = 64 * 1024
const REALTIME_EVENT_WINDOW_MS = 10_000
const MAX_CONNECTION_EVENTS_PER_WINDOW = 60
const MAX_USER_EVENTS_PER_WINDOW = 100
const MAX_CONNECTION_IN_FLIGHT = 8
const MAX_USER_IN_FLIGHT = 16
const RATE_LIMIT_CLOSE_CODE = 4429
const RATE_LIMIT_CLOSE_REASON = "Too many realtime actions"
const MODERATION_CLOSE_CODE = 4403
const MODERATION_CLOSE_REASON = "Account restricted"
const AUTHORIZATION_FAILURE_CLOSE_CODE = 1011
const AUTHORIZATION_FAILURE_CLOSE_REASON = "Realtime authorization unavailable"
/**
 * Upgrade attempts per client address per event window, counted before the
 * ticket is consumed: a well-formed fake ticket costs a store lookup and
 * delete, so unauthenticated attempts need their own bound. Generous enough
 * for a carrier NAT reconnecting after an instance restart.
 */
const MAX_UPGRADE_ATTEMPTS_PER_ADDRESS_PER_WINDOW = 40
/** Memory bound for tracked addresses; the oldest window is evicted first. */
const MAX_TRACKED_UPGRADE_ADDRESSES = 10_000
const CHAT_MESSAGE_NOT_SENT_MESSAGE = "Your message was not sent. Try again."

interface EventRateWindow {
  startedAt: number
  count: number
}

export interface RealtimeServer {
  connectionManager: ConnectionManager
  listen(input: { port: number; host?: string }): Promise<void>
  close(options?: { preserveFanout?: boolean }): Promise<void>
  address(): ReturnType<Server["address"]>
}

export interface CreateRealtimeServerOptions {
  authService: AuthService
  chatService: ChatService
  safetyService: SafetyService
  presenceService: PresenceService
  miniRoomService: MiniRoomService
  connectionService: ConnectionService
  reactionService: ReactionService
  notificationService?: NotificationService
  connectionManager?: ConnectionManager
  realtimeTicketService: RealtimeTicketService
  httpServer?: Server
  /** Test seam; production always uses the deny-all presence-room policy. */
  isPresenceRoomAllowed?: RealtimePresenceRoomPolicy
  /** Test seam for the authorization cache clock; production uses Date.now. */
  authorizationClock?: () => number
  /**
   * Same list as the HTTP server's `trustProxy` (BLUMI_TRUST_PROXY), so the
   * upgrade limit keys on the address Fastify reports as `request.ip`.
   */
  trustedProxyAddresses?: string[]
  /** Test seam; production uses MAX_UPGRADE_ATTEMPTS_PER_ADDRESS_PER_WINDOW. */
  upgradeAttemptsPerAddressWindow?: number
}

export function createRealtimeServer(
  options: CreateRealtimeServerOptions
): RealtimeServer {
  const ownsHttpServer = !options.httpServer
  const httpServer = options.httpServer ?? createServer()
  const wsServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_REALTIME_MESSAGE_BYTES,
    perMessageDeflate: false
  })
  const connectionManager = options.connectionManager ?? createConnectionManager()
  const connectionEventWindows = new Map<string, EventRateWindow>()
  const userEventWindows = new Map<string, EventRateWindow>()
  const movementEventWindows = new Map<string, EventRateWindow>()
  const upgradeAddressWindows = new Map<string, EventRateWindow>()
  const upgradeAttemptLimit = options.upgradeAttemptsPerAddressWindow ?? MAX_UPGRADE_ATTEMPTS_PER_ADDRESS_PER_WINDOW
  const resolveClientAddress = createClientAddressResolver(options.trustedProxyAddresses ?? [])
  const connectionInFlight = new Map<string, number>()
  const userInFlight = new Map<string, number>()
  const connectionMovementInFlight = new Map<string, number>()
  const userMovementInFlight = new Map<string, number>()
  let closing = false
  const activeOperations = new Set<Promise<unknown>>()
  const connectionLifecycleOperations = new Map<string, Promise<void>>()
  const connectionRoomJoinOperations = new Map<string, Set<Promise<void>>>()
  function track<T>(operation: Promise<T>): Promise<T> {
    activeOperations.add(operation)
    void operation.then(() => activeOperations.delete(operation), () => activeOperations.delete(operation))
    return operation
  }
  function enqueueConnectionLifecycleOperation(
    connectionId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    const previous = connectionLifecycleOperations.get(connectionId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    connectionLifecycleOperations.set(connectionId, current)
    const clear = () => {
      if (connectionLifecycleOperations.get(connectionId) === current) {
        connectionLifecycleOperations.delete(connectionId)
      }
    }
    void current.then(clear, clear)
    return current
  }
  function trackConnectionRoomJoin(
    connectionId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    let pending = connectionRoomJoinOperations.get(connectionId)
    if (!pending) {
      pending = new Set()
      connectionRoomJoinOperations.set(connectionId, pending)
    }
    const pendingOperations = pending
    const current = Promise.resolve().then(operation)
    pendingOperations.add(current)
    const clear = () => {
      pendingOperations.delete(current)
      if (pendingOperations.size === 0 && connectionRoomJoinOperations.get(connectionId) === pendingOperations) {
        connectionRoomJoinOperations.delete(connectionId)
      }
    }
    void current.then(clear, clear)
    return current
  }
  async function waitForConnectionRoomJoins(connectionId: string): Promise<void> {
    while (true) {
      const pending = connectionRoomJoinOperations.get(connectionId)
      if (!pending?.size) return
      await Promise.allSettled([...pending])
    }
  }
  // Positive decisions are reused for at most REALTIME_AUTHORIZATION_CACHE_TTL_MS
  // per session family; concurrent checks for one family share one query.
  const authorizationCache = createRealtimeAuthorizationCache({
    check: (identity) => options.authService.isRealtimeSessionAllowed(identity),
    ...(options.authorizationClock ? { now: options.authorizationClock } : {})
  })
  const handleAccessRevocation = (revocation: RealtimeAccessRevocation) => {
    authorizationCache.invalidate(revocation)
    if (closing || revocation.kind !== "user") return
    // Close the affected sockets now rather than on their next event or sweep.
    for (const connection of connectionManager.getUserConnections(revocation.userId)) {
      void track(authorizeConnection(connection))
    }
  }
  // Fakes in tests may omit the subscription; the TTL bound still applies.
  const unsubscribeAccessRevocations = [
    options.authService.subscribeRealtimeAccessRevocations?.(handleAccessRevocation),
    options.safetyService.subscribeRealtimeAccessRevocations?.(handleAccessRevocation)
  ]
  connectionManager.setDeliveryAuthorization(authorizeConnection)
  const notificationService =
    options.notificationService ?? createNotificationService()
  const router = createRealtimeRouter({
    connectionManager,
    presenceService: options.presenceService,
    miniRoomService: options.miniRoomService,
    connectionService: options.connectionService,
    reactionService: options.reactionService,
    chatService: options.chatService,
    safetyService: options.safetyService,
    notificationService,
    isPresenceRoomAllowed: options.isPresenceRoomAllowed
  })

  const handleUpgradeRequest = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (closing) { rejectUpgrade(socket, "503 Service Unavailable"); return }
    void track(authorizeAndUpgrade(request, socket, head)).catch(() => {
      rejectUpgrade(socket, "503 Service Unavailable")
    })
  }
  httpServer.on("upgrade", handleUpgradeRequest)

  async function authorizeAndUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://blumi.local")
    if (url.pathname !== "/ws") {
      socket.destroy()
      return
    }
    const now = Date.now()
    if (upgradeAddressWindows.size >= MAX_TRACKED_UPGRADE_ADDRESSES) {
      purgeExpiredEventWindows(upgradeAddressWindows, now)
      const oldest = upgradeAddressWindows.keys().next()
      if (!oldest.done && upgradeAddressWindows.size >= MAX_TRACKED_UPGRADE_ADDRESSES) {
        upgradeAddressWindows.delete(oldest.value)
      }
    }
    if (!consumeEventAllowance({
      windows: upgradeAddressWindows,
      key: resolveClientAddress(request),
      now,
      limit: upgradeAttemptLimit
    })) {
      rejectUpgrade(socket, "429 Too Many Requests")
      return
    }

    const actor = await authenticateRealtimeRequest({
      request,
      authService: options.authService,
      realtimeTicketService: options.realtimeTicketService
    })
    if (!actor) {
      rejectUpgrade(socket, "401 Unauthorized")
      return
    }
    if (closing) { rejectUpgrade(socket, "503 Service Unavailable"); return }

    const connectionId = `connection_${randomUUID()}`
    let leaseRegistered = false
    let connectionEstablished = false
    let peerClosedBeforeUpgrade = false
    let preUpgradeDisconnect: Promise<void> | undefined
    const disconnectBeforeUpgrade = () => {
      preUpgradeDisconnect ??= enqueueConnectionLifecycleOperation(
        connectionId,
        async () => {
          await options.presenceService.disconnectConnection(
            connectionId,
            actor.profile.userId
          )
        }
      )
      return preUpgradeDisconnect
    }
    const onRawSocketClose = () => {
      if (connectionEstablished) return
      peerClosedBeforeUpgrade = true
      if (leaseRegistered) {
        void track(disconnectBeforeUpgrade()).catch((error) => {
          console.error("Realtime pre-upgrade disconnect cleanup failed", safeOperationalErrorKind(error))
        })
      }
    }
    socket.once("close", onRawSocketClose)

    await options.presenceService.registerConnection(connectionId, actor.profile.userId)
    leaseRegistered = true
    if (peerClosedBeforeUpgrade || socket.destroyed || closing) {
      socket.off("close", onRawSocketClose)
      await track(disconnectBeforeUpgrade())
      if (closing && !socket.destroyed) rejectUpgrade(socket, "503 Service Unavailable")
      return
    }

    try {
      wsServer.handleUpgrade(request, socket, head, (webSocket) => {
        if (peerClosedBeforeUpgrade || socket.destroyed) {
          socket.off("close", onRawSocketClose)
          void track(disconnectBeforeUpgrade()).catch((error) => {
            console.error("Realtime closed-handshake lease cleanup failed", safeOperationalErrorKind(error))
          })
          webSocket.terminate()
          return
        }
        connectionEstablished = true
        socket.off("close", onRawSocketClose)
        try {
          establishConnection(webSocket, actor, connectionId)
        } catch (error) {
          void track(disconnectBeforeUpgrade()).catch((cleanupError) => {
            console.error("Realtime failed-upgrade lease cleanup failed", safeOperationalErrorKind(cleanupError))
          })
          throw error
        }
      })
    } catch (error) {
      socket.off("close", onRawSocketClose)
      await track(disconnectBeforeUpgrade()).catch((cleanupError) => {
        console.error("Realtime failed-upgrade lease cleanup failed", safeOperationalErrorKind(cleanupError))
      })
      throw error
    }
  }

  function establishConnection(
    socket: WebSocket,
    actor: RealtimeSessionActor,
    connectionId: string
  ): void {
    socket.on("error", () => {
      // Protocol and payload violations are closed by ws. Keep them isolated
      // from the process so a hostile client cannot crash the realtime server.
    })
    const connection = connectionManager.addConnection({
      socket,
      profile: actor.profile,
      sessionFamilyId: actor.sessionFamilyId,
      connectionId
    })

    socket.on("pong", () => {
      const current = connectionManager.getConnection(connection.connectionId)
      if (!current) return
      current.isAlive = true
      void track(enqueueConnectionLifecycleOperation(connection.connectionId, async () => {
        const renewed = await options.presenceService.heartbeatConnection(
          connection.connectionId,
          connection.userId
        )
        if (!renewed) throw new Error("Realtime connection lease is no longer registered.")
      })).catch((error) => {
        console.error("Realtime connection lease heartbeat failed", safeOperationalErrorKind(error))
        if (current.socket.readyState === 1) {
          current.socket.close(AUTHORIZATION_FAILURE_CLOSE_CODE, AUTHORIZATION_FAILURE_CLOSE_REASON)
        }
      })
    })
    socket.on("message", (data) => {
      if (closing) return
      void track(handleMessage(connection, data)).catch(() => {
        if (connection.socket.readyState === 1) {
          connection.socket.close(
            AUTHORIZATION_FAILURE_CLOSE_CODE,
            AUTHORIZATION_FAILURE_CLOSE_REASON
          )
        }
      })
    })
    socket.on("close", () => {
      const removed = connectionManager.removeConnection(connection.connectionId)
      connectionEventWindows.delete(connection.connectionId)
      // The user's window outlives the socket: a reconnect inside the window must
      // not reset the per-user budget. The heartbeat purges expired windows.
      if (removed) {
        void track(enqueueConnectionLifecycleOperation(removed.connectionId, async () => {
          // A room.join is the only client operation that can create room presence.
          // Let those already dispatched finish before removing this connection's
          // lease, so a late join cannot recreate presence after disconnect cleanup.
          await waitForConnectionRoomJoins(removed.connectionId)
          await router.handleDisconnect(removed)
        })).catch((error) => console.error("Realtime disconnect cleanup failed", safeOperationalErrorKind(error)))
      }
    })
  }

  let heartbeatAuthorizationPending = false
  const heartbeat = setInterval(() => {
    purgeExpiredEventWindows(userEventWindows, Date.now())
    purgeExpiredEventWindows(upgradeAddressWindows, Date.now())
    if (!heartbeatAuthorizationPending) {
      heartbeatAuthorizationPending = true
      void track(closeRestrictedConnections()).finally(() => { heartbeatAuthorizationPending = false })
    }
    for (const connection of collectConnections(connectionManager)) {
      if (!connection.isAlive) {
        connection.socket.terminate()
        continue
      }
      connection.isAlive = false
      connection.socket.ping()
    }
  }, HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()
  const connectionLeaseCleanup = setInterval(() => {
    void track(options.presenceService.purgeExpiredConnectionLeases()).catch((error) => {
      console.error("Realtime connection lease cleanup failed", safeOperationalErrorKind(error))
    })
    // Expired room presence is invisible to reads; purge it here in bounded
    // batches rather than with a global DELETE on every presence read.
    void track(options.presenceService.purgeExpiredPresence()).catch((error) => {
      console.error("Realtime presence cleanup failed", safeOperationalErrorKind(error))
    })
  }, CONNECTION_LEASE_CLEANUP_INTERVAL_MS)
  connectionLeaseCleanup.unref()

  async function closeRestrictedConnections(): Promise<void> {
    authorizationCache.purgeExpired()
    // Bounded so a large instance does not burst every check at the pool at once.
    await forEachWithConcurrency(
      collectConnections(connectionManager),
      REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY,
      async (connection) => {
        try {
          await authorizeConnection(connection)
        } catch {
          if (connection.socket.readyState === 1) {
            connection.socket.close(
              AUTHORIZATION_FAILURE_CLOSE_CODE,
              AUTHORIZATION_FAILURE_CLOSE_REASON
            )
          }
        }
      }
    )
  }

  async function handleMessage(
    connection: RealtimeConnection,
    data: RawData
  ): Promise<void> {
    if (typeof data !== "string" && !Buffer.isBuffer(data)) return
    if (connection.socket.readyState !== 1) return
    if (Buffer.byteLength(data) > MAX_REALTIME_MESSAGE_BYTES) {
      connection.socket.close(1009, "Realtime message too large")
      return
    }
    const now = Date.now()
    let frame: unknown
    try { frame = JSON.parse(data.toString()) } catch { frame = undefined }
    const movement = isClientEvent(frame) && frame.type === "mini_room.move"
    if (movement) {
      purgeExpiredEventWindows(movementEventWindows, now)
      if (!consumeEventAllowance({ windows: movementEventWindows, key: connection.userId, now, limit: 60 }) ||
        (connectionMovementInFlight.get(connection.connectionId) ?? 0) >= 2 ||
        (userMovementInFlight.get(connection.userId) ?? 0) >= 4) return
    }
    const connectionAllowed = movement || consumeEventAllowance({
      windows: connectionEventWindows,
      key: connection.connectionId,
      now,
      limit: MAX_CONNECTION_EVENTS_PER_WINDOW
    })
    const userAllowed = movement || consumeEventAllowance({
      windows: userEventWindows,
      key: connection.userId,
      now,
      limit: MAX_USER_EVENTS_PER_WINDOW
    })
    if (!movement && (!connectionAllowed || !userAllowed ||
      (connectionInFlight.get(connection.connectionId) ?? 0) >= MAX_CONNECTION_IN_FLIGHT ||
      (userInFlight.get(connection.userId) ?? 0) >= MAX_USER_IN_FLIGHT)) {
      if (connection.socket.readyState === 1) {
        connection.socket.close(RATE_LIMIT_CLOSE_CODE, RATE_LIMIT_CLOSE_REASON)
      }
      return
    }
    const connectionSlots = movement ? connectionMovementInFlight : connectionInFlight
    const userSlots = movement ? userMovementInFlight : userInFlight
    connectionSlots.set(connection.connectionId, (connectionSlots.get(connection.connectionId) ?? 0) + 1)
    userSlots.set(connection.userId, (userSlots.get(connection.userId) ?? 0) + 1)
    let received: ClientEvent | undefined
    try {
      const parsed = frame
      if (!isClientEvent(parsed)) return
      received = parsed
      if (!await authorizeConnection(connection) || connection.socket.readyState !== 1) return
      if (parsed.type === "room.join" || parsed.type === "mini_room.scene_enter") {
        await trackConnectionRoomJoin(connection.connectionId, () => {
          if (!connectionManager.getConnection(connection.connectionId)) return Promise.resolve()
          return router.handleClientEvent(connection, parsed)
        })
      } else {
        await router.handleClientEvent(connection, parsed)
      }
    } catch (error) {
      reportRefusedChatSend(connection, received, error)
      return
    } finally {
      releaseInFlight(connectionSlots, connection.connectionId)
      releaseInFlight(userSlots, connection.userId)
    }
  }

  /**
   * A failed in-room send that carried a clientMessageId is reported to the
   * requesting socket only, so the client can mark that bubble failed and
   * offer a retry. Sends without an id (older clients, which do not know the
   * error code) keep the previous silent behaviour. Only public error text
   * is echoed; never the message body.
   */
  function reportRefusedChatSend(
    connection: RealtimeConnection,
    event: ClientEvent | undefined,
    error: unknown
  ): void {
    if (event?.type !== "chat.send_message") return
    const clientMessageId = readRealtimeClientMessageId(event.payload)
    if (!clientMessageId || connection.socket.readyState !== 1) return
    connectionManager.sendToConnection(connection.connectionId, {
      type: "realtime.error",
      payload: {
        code: "CHAT_MESSAGE_NOT_SENT",
        requestType: "chat.send_message",
        message: isPublicRequestError(error) ? error.message : CHAT_MESSAGE_NOT_SENT_MESSAGE,
        clientMessageId
      }
    })
  }

  async function authorizeConnection(connection: RealtimeConnection): Promise<boolean> {
    try {
      const allowed = Boolean(connection.sessionFamilyId) && await authorizationCache.authorize({
        userId: connection.userId,
        sessionFamilyId: connection.sessionFamilyId!
      })
      if (!allowed && connection.socket.readyState === 1) {
        connection.socket.close(MODERATION_CLOSE_CODE, MODERATION_CLOSE_REASON)
      }
      return allowed
    } catch {
      if (connection.socket.readyState === 1) connection.socket.close(AUTHORIZATION_FAILURE_CLOSE_CODE, AUTHORIZATION_FAILURE_CLOSE_REASON)
      return false
    }
  }

  return {
    connectionManager,
    async listen({ port, host }) {
      await connectionManager.startFanout()
      if (!ownsHttpServer && !httpServer.listening) {
        await connectionManager.closeFanout()
        throw new Error("The shared HTTP server must be listening before realtime starts.")
      }
      if (httpServer.listening) return
      try {
        await new Promise<void>((resolve, reject) => {
          httpServer.once("error", reject)
          httpServer.listen({ port, host }, () => {
            httpServer.off("error", reject)
            resolve()
          })
        })
      } catch (error) {
        await connectionManager.closeFanout()
        throw error
      }
    },
    async close(closeOptions = {}) {
      closing = true
      for (const unsubscribe of unsubscribeAccessRevocations) unsubscribe?.()
      clearInterval(heartbeat)
      clearInterval(connectionLeaseCleanup)
      const socketsClosed = new Promise<void>((resolve) => {
        wsServer.close(() => resolve())
        for (const client of wsServer.clients) {
          client.close()
        }
      })
      await socketsClosed
      await Promise.allSettled([...activeOperations])
      if (!closeOptions.preserveFanout) await connectionManager.closeFanout()
      httpServer.off("upgrade", handleUpgradeRequest)
      if (ownsHttpServer && httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) reject(error)
            else resolve()
          })
        })
      }
    },
    address() {
      return httpServer.address()
    }
  }
}

function releaseInFlight(counts: Map<string, number>, key: string): void {
  const remaining = (counts.get(key) ?? 1) - 1
  if (remaining <= 0) counts.delete(key)
  else counts.set(key, remaining)
}

function rejectUpgrade(socket: Duplex, status: string): void {
  if (socket.destroyed) return
  socket.write(
    `HTTP/1.1 ${status}\r\n` +
    "Connection: close\r\n" +
    "Content-Length: 0\r\n\r\n"
  )
  socket.destroy()
}

function consumeEventAllowance(input: {
  windows: Map<string, EventRateWindow>
  key: string
  now: number
  limit: number
}): boolean {
  const current = input.windows.get(input.key)
  if (!current || current.startedAt + REALTIME_EVENT_WINDOW_MS <= input.now) {
    input.windows.set(input.key, { startedAt: input.now, count: 1 })
    return true
  }
  if (current.count >= input.limit) return false
  input.windows.set(input.key, {
    startedAt: current.startedAt,
    count: current.count + 1
  })
  return true
}

function purgeExpiredEventWindows(windows: Map<string, EventRateWindow>, now: number): void {
  for (const [key, window] of windows) {
    if (window.startedAt + REALTIME_EVENT_WINDOW_MS <= now) windows.delete(key)
  }
}

function collectConnections(
  connectionManager: ConnectionManager
): RealtimeConnection[] {
  return connectionManager.listConnections()
}

/**
 * `request.ip` semantics for raw upgrade requests: the socket address, or,
 * with trusted proxies configured, the nearest untrusted address from
 * X-Forwarded-For, computed by the same library Fastify uses.
 */
function createClientAddressResolver(trustedProxyAddresses: string[]): (request: IncomingMessage) => string {
  if (trustedProxyAddresses.length === 0) {
    return (request) => request.socket.remoteAddress ?? "unknown"
  }
  const trust = proxyAddr.compile(trustedProxyAddresses)
  return (request) => {
    try {
      return proxyAddr(request, trust)
    } catch {
      return request.socket.remoteAddress ?? "unknown"
    }
  }
}

function isClientEvent(value: unknown): value is ClientEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).type === "string" &&
    "payload" in (value as Record<string, unknown>)
  )
}
