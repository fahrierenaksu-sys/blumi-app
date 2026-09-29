import { createServer, type IncomingMessage, type Server } from "node:http"
import { randomUUID } from "node:crypto"
import type { Duplex } from "node:stream"
import { WebSocketServer, type RawData, type WebSocket } from "ws"
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
import { createRealtimeRouter } from "./realtimeRouter"
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
  const connectionInFlight = new Map<string, number>()
  const userInFlight = new Map<string, number>()
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
    notificationService
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
      if (!connectionManager.hasUserConnections(connection.userId)) {
        userEventWindows.delete(connection.userId)
      }
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
  }, CONNECTION_LEASE_CLEANUP_INTERVAL_MS)
  connectionLeaseCleanup.unref()

  async function closeRestrictedConnections(): Promise<void> {
    await Promise.all(
      collectConnections(connectionManager).map(async (connection) => {
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
      })
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
    const connectionAllowed = consumeEventAllowance({
      windows: connectionEventWindows,
      key: connection.connectionId,
      now,
      limit: MAX_CONNECTION_EVENTS_PER_WINDOW
    })
    const userAllowed = consumeEventAllowance({
      windows: userEventWindows,
      key: connection.userId,
      now,
      limit: MAX_USER_EVENTS_PER_WINDOW
    })
    if (!connectionAllowed || !userAllowed ||
      (connectionInFlight.get(connection.connectionId) ?? 0) >= MAX_CONNECTION_IN_FLIGHT ||
      (userInFlight.get(connection.userId) ?? 0) >= MAX_USER_IN_FLIGHT) {
      if (connection.socket.readyState === 1) {
        connection.socket.close(RATE_LIMIT_CLOSE_CODE, RATE_LIMIT_CLOSE_REASON)
      }
      return
    }
    connectionInFlight.set(connection.connectionId, (connectionInFlight.get(connection.connectionId) ?? 0) + 1)
    userInFlight.set(connection.userId, (userInFlight.get(connection.userId) ?? 0) + 1)
    try {
      const parsed = JSON.parse(data.toString()) as unknown
      if (!isClientEvent(parsed)) return
      if (!await authorizeConnection(connection) || connection.socket.readyState !== 1) return
      if (parsed.type === "room.join") {
        await trackConnectionRoomJoin(connection.connectionId, () => {
          if (!connectionManager.getConnection(connection.connectionId)) return Promise.resolve()
          return router.handleClientEvent(connection, parsed)
        })
      } else {
        await router.handleClientEvent(connection, parsed)
      }
    } catch {
      return
    } finally {
      releaseInFlight(connectionInFlight, connection.connectionId)
      releaseInFlight(userInFlight, connection.userId)
    }
  }

  async function authorizeConnection(connection: RealtimeConnection): Promise<boolean> {
    try {
      const allowed = Boolean(connection.sessionFamilyId) && await options.authService.isRealtimeSessionAllowed({
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

function collectConnections(
  connectionManager: ConnectionManager
): RealtimeConnection[] {
  return connectionManager.listConnections()
}

function isClientEvent(value: unknown): value is ClientEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).type === "string" &&
    "payload" in (value as Record<string, unknown>)
  )
}
