import { createServer, type IncomingMessage, type Server } from "node:http"
import { randomUUID } from "node:crypto"
import type { Duplex } from "node:stream"
import { WebSocketServer, type RawData, type WebSocket } from "ws"
import proxyAddr from "@fastify/proxy-addr"
import type { ClientEvent, ServerEvent } from "@blumi/contracts"
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
  REALTIME_OUTBOUND_HARD_LIMIT_BYTES,
  type ConnectionManager,
  type RealtimeConnection
} from "./connectionManager"
import {
  authenticateRealtimeRequest,
  type RealtimeSessionActor
} from "./realtimeAuth"
import {
  createRealtimeAuthorizationCache,
  REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS,
  type RealtimeAuthorizationIdentity
} from "./realtimeAuthorizationCache"
import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"
import { createRealtimeRouter, readRealtimeClientMessageId } from "./realtimeRouter"
import { isPublicRequestError } from "../errors/publicRequestError"
import type { RealtimePresenceRoomPolicy } from "./realtimePresencePolicy"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import type { RealtimeTicketService } from "./realtimeTicketService"
import type { CapabilityService } from "../capabilities/capabilityService"
import { classifyRealtimeEvent, createRealtimeEventBudget } from "./realtimeEventBudget"
import { createRealtimeUpgradeLimiter } from "./realtimeUpgradeLimiter"

/**
 * Liveness (2026-10-01). Each interval the server pings every socket and sends
 * it a `realtime.heartbeat` event (mobile WebSocket APIs never surface pings,
 * so the beacon is what lets a phone detect a dead socket). A socket that
 * neither answered the previous ping nor sent anything since is terminated,
 * so a dead or half-open socket is released within 15-30 s (was 30-60 s).
 * The ping (2 bytes) and the beacon (about 60 bytes) leave in the same tick,
 * so a foreground phone's radio wakes at most once per interval for them.
 */
export const REALTIME_HEARTBEAT_INTERVAL_MS = 15_000
/**
 * Connection leases last 90 s. Live sockets renew theirs at most this often,
 * in one batched statement per tick, instead of one transaction per pong.
 */
export const REALTIME_CONNECTION_LEASE_RENEW_MS = 30_000
/**
 * Closed sockets' leases are removed together after this window (one
 * statement per 100). In-memory state, MiniRoom motion included, is released
 * at once; the lease only gates room presence and expires on its own.
 */
const REALTIME_DISCONNECT_BATCH_WINDOW_MS = 50
/** Graceful shutdown close: clients spread their first retry (1012 = restart). */
export const REALTIME_RESTART_CLOSE_CODE = 1012
const RESTART_CLOSE_REASON = "Server restarting"
const CONNECTION_LEASE_CLEANUP_INTERVAL_MS = 60_000
const MAX_REALTIME_MESSAGE_BYTES = 64 * 1024
const RATE_LIMIT_CLOSE_CODE = 4429
const RATE_LIMIT_CLOSE_REASON = "Too many realtime actions"
const MODERATION_CLOSE_CODE = 4403
const MODERATION_CLOSE_REASON = "Account restricted"
const AUTHORIZATION_FAILURE_CLOSE_CODE = 1011
const AUTHORIZATION_FAILURE_CLOSE_REASON = "Realtime authorization unavailable"
const CHAT_MESSAGE_NOT_SENT_MESSAGE = "Your message was not sent. Try again."
const CHAT_RATE_LIMITED_MESSAGE = "You're sending messages too quickly. Try again in a moment."
const HEARTBEAT_FRAME = JSON.stringify({
  type: "realtime.heartbeat",
  payload: { intervalMs: REALTIME_HEARTBEAT_INTERVAL_MS }
} satisfies ServerEvent)

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
  /** Test seams; production uses the realtimeUpgradeLimiter defaults. */
  upgradeAttemptsPerAddressWindow?: number
  /** Resolves the `chat_read_receipts` rollout; without it receipts stay off. */
  capabilityService?: CapabilityService
  failedUpgradesPerAddressWindow?: number
  upgradesPerUserWindow?: number
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
  const eventBudget = createRealtimeEventBudget()
  const upgradeLimiter = createRealtimeUpgradeLimiter({
    attemptsPerAddress: options.upgradeAttemptsPerAddressWindow,
    failuresPerAddress: options.failedUpgradesPerAddressWindow,
    upgradesPerUser: options.upgradesPerUserWindow
  })
  const resolveClientAddress = createClientAddressResolver(options.trustedProxyAddresses ?? [])
  const leaseRenewedAt = new Map<string, number>()
  const pendingDisconnects: RealtimeConnection[] = []
  const movementInFlight = new Set<string>()
  const deferredMovements = new Map<string, ClientEvent>()
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
  // Event-driven authorization: decisions are primed at upgrade, refreshed in
  // batches by the sweep, dropped at once on revocation, and otherwise reused
  // for at most REALTIME_AUTHORIZATION_CACHE_TTL_MS.
  const authorizationCache = createRealtimeAuthorizationCache({
    check: (identity) => options.authService.isRealtimeSessionAllowed(identity),
    checkMany: async (identities) => (await options.authService.areRealtimeSessionsAllowed(identities))
      .map((decision) => ({
        allowed: decision.allowed,
        ...(decision.expiresAt ? { notAfter: Date.parse(decision.expiresAt) } : {})
      })),
    ...(options.authorizationClock ? { now: options.authorizationClock } : {})
  })
  const handleAccessRevocation = (revocation: RealtimeAccessRevocation, origin: "local" | "remote") => {
    authorizationCache.invalidate(revocation)
    // Other instances drop their cached decision too (fanout control channel).
    if (origin === "local") void connectionManager.publishAccessRevocation(revocation)
    if (closing || revocation.kind !== "user") return
    // Close the affected sockets now rather than on their next event or sweep.
    for (const connection of connectionManager.getUserConnections(revocation.userId)) {
      void track(authorizeConnection(connection))
    }
  }
  // Fakes in tests may omit the subscription; the TTL bound still applies.
  const unsubscribeAccessRevocations = [
    options.authService.subscribeRealtimeAccessRevocations?.((revocation) => handleAccessRevocation(revocation, "local")),
    options.safetyService.subscribeRealtimeAccessRevocations?.((revocation) => handleAccessRevocation(revocation, "local")),
    connectionManager.subscribeAccessRevocations((revocation) => handleAccessRevocation(revocation, "remote"))
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
    isPresenceRoomAllowed: options.isPresenceRoomAllowed,
    capabilityService: options.capabilityService
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
    const address = resolveClientAddress(request)
    if (!upgradeLimiter.admitAddress(address, Date.now())) {
      rejectUpgrade(socket, "429 Too Many Requests")
      return
    }
    // Load shedding: the database work of setting up this socket (ticket,
    // session, lease) runs inside a bounded number of slots; the client
    // retries with jittered backoff when none is free.
    const setupGate = options.realtimeTicketService.setupGate
    const releaseSetupSlot = setupGate ? setupGate.tryAcquire() : () => undefined
    if (!releaseSetupSlot) {
      rejectUpgrade(socket, "503 Service Unavailable")
      return
    }
    try {
      await upgradeWithSetupSlot(request, socket, head, address)
    } finally {
      releaseSetupSlot()
    }
  }

  async function upgradeWithSetupSlot(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    address: string
  ): Promise<void> {
    // The ticket check below proves an unexpired, unrotated session token of
    // an eligible, unrestricted account: stricter than the cached decision,
    // so a success primes the cache and the first event costs no query.
    const observation = authorizationCache.observe()
    const actor = await authenticateRealtimeRequest({
      request,
      authService: options.authService,
      realtimeTicketService: options.realtimeTicketService
    })
    if (!actor) {
      upgradeLimiter.recordFailure(address, Date.now())
      rejectUpgrade(socket, "401 Unauthorized")
      return
    }
    if (!upgradeLimiter.admitUser(actor.userId, Date.now())) {
      rejectUpgrade(socket, "429 Too Many Requests")
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
          authorizationCache.recordAllowed(
            { userId: actor.userId, sessionFamilyId: actor.sessionFamilyId },
            observation,
            Date.parse(actor.sessionExpiresAt)
          )
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
    // The lease was registered just before the upgrade.
    leaseRenewedAt.set(connection.connectionId, Date.now())

    socket.on("pong", () => {
      connection.isAlive = true
    })
    socket.on("message", (data) => {
      // Any frame proves the peer is alive, even one the budget drops.
      connection.isAlive = true
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
      leaseRenewedAt.delete(connection.connectionId)
      deferredMovements.delete(connection.connectionId)
      // The user's windows outlive the socket: a reconnect inside a window
      // must not reset the per-user budget. The heartbeat purges them.
      eventBudget.forgetConnection(connection.connectionId)
      if (!removed) return
      router.releaseConnection(removed)
      // Lease cleanup is batched (2026-10-01): a transaction per socket made a
      // deploy or a mass network drop queue thousands of transactions in
      // front of the reconnects. A shutdown flushes the batch in close().
      pendingDisconnects.push(removed)
      if (!closing) scheduleDisconnectFlush()
    })
  }

  let disconnectFlushTimer: ReturnType<typeof setTimeout> | undefined
  let disconnectFlushRunning = false
  function scheduleDisconnectFlush(): void {
    if (disconnectFlushTimer || disconnectFlushRunning) return
    disconnectFlushTimer = setTimeout(() => {
      disconnectFlushTimer = undefined
      disconnectFlushRunning = true
      void track(flushDisconnects()).finally(() => {
        disconnectFlushRunning = false
        // Closes that arrived during the flush form the next batch.
        if (pendingDisconnects.length > 0 && !closing) scheduleDisconnectFlush()
      })
    }, REALTIME_DISCONNECT_BATCH_WINDOW_MS)
    disconnectFlushTimer.unref?.()
  }

  let leaseRenewalPending = false
  const heartbeat = setInterval(() => {
    const now = Date.now()
    eventBudget.purgeExpired(now)
    upgradeLimiter.purgeExpired(now)
    const dueForRenewal: RealtimeConnection[] = []
    for (const connection of connectionManager.listConnections()) {
      const socket = connection.socket
      if (!connection.isAlive) {
        socket.terminate()
        continue
      }
      connection.isAlive = false
      if (socket.readyState !== 1) continue
      socket.ping()
      if ((socket.bufferedAmount ?? 0) <= REALTIME_OUTBOUND_HARD_LIMIT_BYTES) socket.send(HEARTBEAT_FRAME)
      if (now - (leaseRenewedAt.get(connection.connectionId) ?? 0) >= REALTIME_CONNECTION_LEASE_RENEW_MS) {
        dueForRenewal.push(connection)
      }
    }
    if (dueForRenewal.length > 0 && !leaseRenewalPending) {
      leaseRenewalPending = true
      void track(renewConnectionLeases(dueForRenewal)).finally(() => { leaseRenewalPending = false })
    }
  }, REALTIME_HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()
  let authorizationSweepPending = false
  const authorizationSweep = setInterval(() => {
    if (authorizationSweepPending) return
    authorizationSweepPending = true
    void track(closeRestrictedConnections()).finally(() => { authorizationSweepPending = false })
  }, REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS)
  authorizationSweep.unref()
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

  async function flushDisconnects(): Promise<void> {
    const batch = pendingDisconnects.splice(0)
    if (batch.length === 0) return
    // A room.join is the only client operation that can create room presence.
    // Joins already dispatched finish first, so a late join cannot recreate
    // presence after the cleanup.
    await Promise.all(batch.map((connection) => waitForConnectionRoomJoins(connection.connectionId)))
    try {
      await router.handleDisconnects(batch)
    } catch (error) {
      // Leases expire on their own (90 s) and are purged by any instance.
      console.error("Realtime disconnect cleanup failed", safeOperationalErrorKind(error))
    }
  }

  /**
   * Renews the leases of live sockets in batches. A failed round is retried on
   * the next tick (the 90 s lease outlives several); a lease that no longer
   * exists closes its socket so the client reconnects and registers anew. An
   * UPDATE never recreates a lease, so a renewal cannot outlive a disconnect.
   */
  async function renewConnectionLeases(connections: readonly RealtimeConnection[]): Promise<void> {
    const startedAt = Date.now()
    let renewed: ReadonlySet<string>
    try {
      renewed = await options.presenceService.heartbeatConnections(
        connections.map((connection) => ({ connectionId: connection.connectionId, userId: connection.userId }))
      )
    } catch (error) {
      console.error("Realtime connection lease renewal failed", safeOperationalErrorKind(error))
      return
    }
    for (const connection of connections) {
      if (connectionManager.getConnection(connection.connectionId) !== connection) continue
      if (renewed.has(connection.connectionId)) {
        leaseRenewedAt.set(connection.connectionId, startedAt)
      } else if (connection.socket.readyState === 1) {
        connection.socket.close(AUTHORIZATION_FAILURE_CLOSE_CODE, AUTHORIZATION_FAILURE_CLOSE_REASON)
      }
    }
  }

  /**
   * Re-checks every live socket in batches (one session and one account query
   * per 500 sockets) and refreshes their cached decisions. A batch failure
   * closes nothing: decisions then expire within the TTL and the next event or
   * delivery fails closed on its own check.
   */
  async function closeRestrictedConnections(): Promise<void> {
    authorizationCache.purgeExpired()
    const identified: RealtimeConnection[] = []
    for (const connection of connectionManager.listConnections()) {
      if (connection.sessionFamilyId) identified.push(connection)
      else if (connection.socket.readyState === 1) connection.socket.close(MODERATION_CLOSE_CODE, MODERATION_CLOSE_REASON)
    }
    let denied: RealtimeAuthorizationIdentity[]
    try {
      denied = await authorizationCache.refresh(identified.map((connection) => ({
        userId: connection.userId,
        sessionFamilyId: connection.sessionFamilyId!
      })))
    } catch (error) {
      console.error("Realtime authorization sweep failed", safeOperationalErrorKind(error))
      return
    }
    const deniedFamilies = new Set(denied.map((identity) => `${identity.userId}\u0000${identity.sessionFamilyId}`))
    for (const connection of identified) {
      if (!deniedFamilies.has(`${connection.userId}\u0000${connection.sessionFamilyId}`)) continue
      if (connection.socket.readyState === 1) connection.socket.close(MODERATION_CLOSE_CODE, MODERATION_CLOSE_REASON)
    }
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
    let frame: unknown
    try { frame = JSON.parse(data.toString()) } catch { frame = undefined }
    const event = isClientEvent(frame) ? frame : undefined
    const eventClass = classifyRealtimeEvent(event?.type ?? "")
    const admission = eventBudget.admit({
      connectionId: connection.connectionId,
      userId: connection.userId,
      eventClass,
      now: Date.now()
    })
    if (admission.kind === "drop") return
    if (eventClass === "motion" && event && admission.kind === "admit") {
      // Movement counts against its own window only: a step is never dropped
      // for being busy. handleMovement keeps one step in flight per socket and
      // replaces a pending one with the latest, so the slot is not held here.
      admission.release()
      await handleMovement(connection, event)
      return
    }
    if (admission.kind === "refuse_chat") {
      // Over the chat budget: the sender retries the bubble; other traffic and
      // the socket are unaffected. Older clients without a retry id keep the
      // previous close, as they cannot mark a bubble failed.
      const clientMessageId = readRealtimeClientMessageId(event?.payload)
      if (clientMessageId) {
        reportChatNotSent(connection, clientMessageId, CHAT_RATE_LIMITED_MESSAGE)
        return
      }
    }
    if (admission.kind !== "admit") {
      if (connection.socket.readyState === 1) {
        connection.socket.close(RATE_LIMIT_CLOSE_CODE, RATE_LIMIT_CLOSE_REASON)
      }
      return
    }
    try {
      if (!event) return
      if (!await authorizeConnection(connection) || connection.socket.readyState !== 1) return
      if (event.type === "room.join" || event.type === "mini_room.scene_enter") {
        await trackConnectionRoomJoin(connection.connectionId, () => {
          if (!connectionManager.getConnection(connection.connectionId)) return Promise.resolve()
          return router.handleClientEvent(connection, event)
        })
      } else {
        await router.handleClientEvent(connection, event)
      }
    } catch (error) {
      reportRefusedChatSend(connection, event, error)
      return
    } finally {
      admission.release()
    }
  }

  /**
   * Movement is a stream of targets in which only the newest matters. Each
   * socket handles one step at a time, in order; a step that arrives while one
   * is pending (for example on an expired authorization check) replaces a
   * single deferred slot rather than being dropped, so the final target always
   * reaches the partner and an older one can never be applied after it.
   */
  async function handleMovement(connection: RealtimeConnection, frame: ClientEvent): Promise<void> {
    if (movementInFlight.has(connection.connectionId)) {
      deferredMovements.set(connection.connectionId, frame)
      return
    }
    movementInFlight.add(connection.connectionId)
    try {
      if (!await authorizeConnection(connection) || connection.socket.readyState !== 1) return
      await router.handleClientEvent(connection, frame)
    } catch {
      // A refused step is dropped; the client keeps walking locally and its next
      // target or the scene snapshot re-synchronizes the partner.
    } finally {
      movementInFlight.delete(connection.connectionId)
      const next = deferredMovements.get(connection.connectionId)
      deferredMovements.delete(connection.connectionId)
      if (next && !closing && connectionManager.getConnection(connection.connectionId) === connection) {
        void track(handleMovement(connection, next))
      }
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
    if (!clientMessageId) return
    reportChatNotSent(
      connection,
      clientMessageId,
      isPublicRequestError(error) ? error.message : CHAT_MESSAGE_NOT_SENT_MESSAGE
    )
  }

  function reportChatNotSent(connection: RealtimeConnection, clientMessageId: string, message: string): void {
    if (connection.socket.readyState !== 1) return
    connectionManager.sendToConnection(connection.connectionId, {
      type: "realtime.error",
      payload: {
        code: "CHAT_MESSAGE_NOT_SENT",
        requestType: "chat.send_message",
        message,
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
      clearInterval(authorizationSweep)
      clearInterval(connectionLeaseCleanup)
      const socketsClosed = new Promise<void>((resolve) => {
        wsServer.close(() => resolve())
        // 1012: the clients reconnect, spreading their first retry over a few
        // seconds, instead of all at the instant the next instance is ready.
        for (const client of wsServer.clients) {
          client.close(REALTIME_RESTART_CLOSE_CODE, RESTART_CLOSE_REASON)
        }
      })
      await socketsClosed
      clearTimeout(disconnectFlushTimer)
      disconnectFlushTimer = undefined
      await track(flushDisconnects())
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

function rejectUpgrade(socket: Duplex, status: string): void {
  if (socket.destroyed) return
  socket.write(
    `HTTP/1.1 ${status}\r\n` +
    "Connection: close\r\n" +
    "Content-Length: 0\r\n\r\n"
  )
  socket.destroy()
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
