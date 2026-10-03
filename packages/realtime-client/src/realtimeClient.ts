import {
  parseServerEvent,
  type ClientEvent,
  type ServerEvent
} from "@blumi/contracts"

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  /**
   * The fast reconnect attempts are exhausted. The client keeps retrying
   * with capped backoff, but the UI must say the service is unreachable
   * rather than promise an imminent reconnect.
   */
  | "unreachable"
  | "connected"
  | "disconnected"
  | "error"

export interface RealtimeConnectionMeta {
  closeCode?: number
}

export const REALTIME_AUTH_INVALID_CLOSE_CODE = 4401
/** Attempts before the status changes from "reconnecting" to "unreachable". */
export const REALTIME_FAST_RECONNECT_ATTEMPTS = 10
/**
 * Ceiling of the fast attempts. With a 1 s base the retries after the first
 * wait 1-2, 2-4, 4-8 and then 7.5-15 s, so a phone that lost the server for a
 * minute is back within seconds of its return instead of up to 30 s later.
 */
export const REALTIME_FAST_RECONNECT_CEILING_MS = 15_000
/** Slow retries continue indefinitely, never more than this far apart. */
export const REALTIME_SLOW_RECONNECT_CEILING_MS = 30_000
/**
 * The first retry after an ordinary drop waits a uniformly random 0-1 s
 * (full jitter): immediate for the user, spread for the server.
 */
export const REALTIME_FIRST_RECONNECT_WINDOW_MS = 1_000
/**
 * The first retry after a server-wide close (restart or deploy 1012, going
 * away 1001, overload 1013) is spread uniformly over 0-5 s, so 5,000 clients
 * reconnect at about 1,000 per second instead of in the same instant.
 */
export const REALTIME_RESTART_RECONNECT_WINDOW_MS = 5_000
const SERVER_WIDE_CLOSE_CODES: ReadonlySet<number> = new Set([1001, 1012, 1013])
/**
 * Silence tolerated after the server's announced heartbeat interval before the
 * socket is declared dead. A half-open socket (Wi-Fi to cellular handover, NAT
 * timeout) otherwise looks connected until the platform gives up minutes later.
 */
export const REALTIME_LIVENESS_GRACE_MS = 10_000
/** Close code this client sends when it abandons a silent socket. */
export const REALTIME_LIVENESS_CLOSE_CODE = 4000
const CLIENT_NORMAL_CLOSE_CODE = 1000
/**
 * A socket must stay open this long (or deliver an authenticated server
 * event) before the backoff resets, so an accept-then-close loop keeps
 * growing its delay instead of reconnecting every second.
 */
export const REALTIME_STABLE_CONNECTION_MS = 10_000
/**
 * A socket that has not opened within this window is abandoned and retried.
 * Without it a stalled handshake (for example on a network that changed while
 * the app was suspended) waits for the platform timeout, about 60 s on iOS.
 */
export const REALTIME_CONNECT_TIMEOUT_MS = 10_000
const REALTIME_TICKET_FORBIDDEN_CLOSE_CODE = 4403

export function isRealtimeAuthInvalidClose(closeCode: number | undefined): boolean {
  return closeCode === REALTIME_AUTH_INVALID_CLOSE_CODE
}

type ServerEventListener = (event: ServerEvent) => void
type StatusListener = (status: RealtimeConnectionStatus, meta?: RealtimeConnectionMeta) => void
export type RealtimeTicketProvider = (sessionToken: string) => Promise<string>

/**
 * The WebSocket surface the client uses. React Native, browsers and Node 22
 * all provide a global `WebSocket` that satisfies it.
 */
export interface RealtimeSocket {
  readonly readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: (() => void) | null
  send(data: string): void
  /** Code 1000 or 3000-4999 and a short reason, as the WebSocket API allows. */
  close(code?: number, reason?: string): void
}

export type RealtimeSocketFactory = (url: string, protocols: string[]) => RealtimeSocket

/** WebSocket.CONNECTING and WebSocket.OPEN in every implementation. */
const SOCKET_CONNECTING = 0
const SOCKET_OPEN = 1

/** Constructs the platform's global WebSocket, read at connect time. */
const createGlobalWebSocket: RealtimeSocketFactory = (url, protocols) => {
  const { WebSocket: GlobalWebSocket } = globalThis as unknown as {
    WebSocket: new (url: string, protocols: string[]) => RealtimeSocket
  }
  return new GlobalWebSocket(url, protocols)
}

export interface RealtimeClientOptions {
  /** Uniform random source in [0, 1); injectable for deterministic tests. */
  random?: () => number
  /** Observer for dropped inbound events; defaults to a development-only warning. */
  onDroppedEvent?: (drop: RealtimeEventDrop) => void
  /** Socket constructor; defaults to the platform's global WebSocket. */
  createSocket?: RealtimeSocketFactory
  /** Millisecond clock for liveness; injectable for deterministic tests. */
  now?: () => number
}

type ReconnectKind = "default" | "server_wide" | "immediate"

export class RealtimeTicketRequestError extends Error {
  public constructor(public readonly statusCode: number) {
    super("Blumi could not authorize realtime right now.")
    this.name = "RealtimeTicketRequestError"
  }
}

function createWebSocketUrl(baseUrl: string): string {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmed}/ws`
}

/**
 * Why an inbound realtime message was not delivered to listeners. It carries
 * only the event type and failing field paths, never payload values, so it
 * is safe to log.
 */
export type RealtimeEventDrop =
  | { reason: "unparseable" }
  | { reason: "invalid"; type: string | null; issuePaths: string[] }
  | { reason: "unknown_type"; type: string }

export interface RealtimeEventDropCounts {
  unparseable: number
  invalid: number
  unknownType: number
}

function reportDroppedEventInDevelopment(drop: RealtimeEventDrop): void {
  // Unknown types are expected from newer servers; only malformed input is
  // worth surfacing, and only in development builds.
  if (drop.reason === "unknown_type") return
  if ((globalThis as { __DEV__?: unknown }).__DEV__ !== true) return
  console.warn("[realtime] dropped inbound event", drop)
}

export class RealtimeClient {
  private socket: RealtimeSocket | null = null
  private sessionToken: string | null = null
  private intentionalDisconnect = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private livenessTimer: ReturnType<typeof setTimeout> | null = null
  /** Set once the current socket's server announced heartbeats; null otherwise. */
  private livenessTimeoutMs: number | null = null
  private lastInboundAt = 0
  private ticketRequestInFlight = false
  /** The server refused this session (401/403 ticket, 1008/4401/4403 close); only connect() retries. */
  private sessionRefused = false
  private networkConnected = true
  private appActive = true
  /** Backgrounded by suspend(): no socket opens until setAppActive(true). */
  private suspended = false
  private connectionGeneration = 0
  private readonly serverEventListeners = new Set<ServerEventListener>()
  private readonly statusListeners = new Set<StatusListener>()

  public constructor(
    private readonly wsBaseUrl: string,
    private readonly ticketProvider: RealtimeTicketProvider,
    options: RealtimeClientOptions = {}
  ) {
    this.random = options.random ?? Math.random
    this.onDroppedEvent = options.onDroppedEvent ?? reportDroppedEventInDevelopment
    this.createSocket = options.createSocket ?? createGlobalWebSocket
    this.now = options.now ?? Date.now
  }

  private readonly random: () => number
  private readonly now: () => number
  private readonly createSocket: RealtimeSocketFactory
  private readonly onDroppedEvent: (drop: RealtimeEventDrop) => void
  private readonly droppedEventCounts: RealtimeEventDropCounts = {
    unparseable: 0,
    invalid: 0,
    unknownType: 0
  }

  /** Snapshot of inbound events dropped by validation for this client. */
  public getDroppedEventCounts(): RealtimeEventDropCounts {
    return { ...this.droppedEventCounts }
  }

  private handleInboundMessage(data: string): void {
    let decoded: unknown
    try {
      decoded = JSON.parse(data) as unknown
    } catch {
      this.recordDrop({ reason: "unparseable" })
      return
    }
    const result = parseServerEvent(decoded)
    if (result.kind === "valid" && result.event.type !== "realtime.error") {
      // The server only sends product events on an authorized socket.
      this.markConnectionHealthy()
    }
    if (result.kind === "valid" && result.event.type === "realtime.heartbeat") {
      // Transport signal only: it arms liveness and never reaches listeners.
      this.livenessTimeoutMs = result.event.payload.intervalMs + REALTIME_LIVENESS_GRACE_MS
      this.armLivenessTimer()
      return
    }
    if (result.kind === "unknown") {
      this.recordDrop({ reason: "unknown_type", type: result.type })
      return
    }
    if (result.kind === "invalid") {
      this.recordDrop({
        reason: "invalid",
        type: result.type,
        issuePaths: result.issuePaths
      })
      return
    }
    try {
      for (const listener of this.serverEventListeners) {
        listener(result.event)
      }
    } catch {
      // Preserve the socket handler contract: a listener failure never
      // escapes into the WebSocket callback.
    }
  }

  private recordDrop(drop: RealtimeEventDrop): void {
    if (drop.reason === "unparseable") this.droppedEventCounts.unparseable += 1
    else if (drop.reason === "invalid") this.droppedEventCounts.invalid += 1
    else this.droppedEventCounts.unknownType += 1
    try {
      this.onDroppedEvent(drop)
    } catch {
      // Diagnostics must never break event delivery.
    }
  }

  public connect(sessionToken: string): void {
    this.intentionalDisconnect = false
    this.sessionRefused = false
    this.sessionToken = sessionToken
    this.connectionGeneration += 1
    this.clearReconnectTimer()
    this.closeCurrentSocket(CLIENT_NORMAL_CLOSE_CODE, "Client reconnecting")
    this.emitStatus("connecting")

    if (!this.networkConnected) {
      this.emitStatus("reconnecting")
      return
    }
    // Backgrounded: setAppActive(true) opens the socket on return.
    if (this.suspended) return
    void this.openSocket(sessionToken, this.connectionGeneration)
  }

  private async openSocket(
    sessionToken: string,
    generation: number
  ): Promise<void> {
    let ticket: string
    this.ticketRequestInFlight = true
    try {
      ticket = await this.ticketProvider(sessionToken)
    } catch (error) {
      if (!this.isCurrentConnectionAttempt(sessionToken, generation)) return
      this.ticketRequestInFlight = false
      if (
        error instanceof RealtimeTicketRequestError &&
        error.statusCode === 401
      ) {
        this.sessionRefused = true
        this.emitStatus("error", { closeCode: REALTIME_AUTH_INVALID_CLOSE_CODE })
        return
      }
      if (
        error instanceof RealtimeTicketRequestError &&
        error.statusCode === 403
      ) {
        this.sessionRefused = true
        this.emitStatus("error", {
          closeCode: REALTIME_TICKET_FORBIDDEN_CLOSE_CODE
        })
        return
      }
      this.emitStatus("error")
      this.scheduleReconnect()
      return
    }
    if (!this.isCurrentConnectionAttempt(sessionToken, generation)) return
    this.ticketRequestInFlight = false
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(ticket)) {
      this.emitStatus("error")
      this.scheduleReconnect()
      return
    }

    const socket = this.createSocket(
      createWebSocketUrl(this.wsBaseUrl),
      [`ticket-${ticket}`]
    )
    this.socket = socket
    this.livenessTimeoutMs = null
    this.clearConnectTimeoutTimer()
    this.connectTimeoutTimer = setTimeout(() => {
      this.connectTimeoutTimer = null
      if (this.socket !== socket || socket.readyState === SOCKET_OPEN) return
      this.closeCurrentSocket()
      this.emitStatus("disconnected")
      this.scheduleReconnect()
    }, REALTIME_CONNECT_TIMEOUT_MS)

    socket.onopen = () => {
      if (this.socket !== socket) return
      this.clearConnectTimeoutTimer()
      this.clearStableConnectionTimer()
      this.stableConnectionTimer = setTimeout(() => {
        this.stableConnectionTimer = null
        if (this.socket === socket) this.markConnectionHealthy()
      }, REALTIME_STABLE_CONNECTION_MS)
      this.emitStatus("connected")
    }

    socket.onmessage = (messageEvent) => {
      if (this.socket !== socket) return
      // Any frame proves the socket is alive, even one this build drops.
      this.lastInboundAt = this.now()
      if (typeof messageEvent.data !== "string") {
        return
      }
      this.handleInboundMessage(messageEvent.data)
    }

    socket.onclose = (closeEvent) => {
      if (this.socket !== socket) return
      this.socket = null
      this.clearStableConnectionTimer()
      this.clearConnectTimeoutTimer()
      this.clearLivenessTimer()
      this.emitStatus("disconnected", { closeCode: closeEvent.code })
      if (
        closeEvent.code === 1008 ||
        closeEvent.code === REALTIME_AUTH_INVALID_CLOSE_CODE ||
        closeEvent.code === REALTIME_TICKET_FORBIDDEN_CLOSE_CODE
      ) {
        this.sessionRefused = true
        this.emitStatus("error", { closeCode: closeEvent.code })
        return
      }
      if (!this.intentionalDisconnect && this.networkConnected) {
        this.scheduleReconnect(
          SERVER_WIDE_CLOSE_CODES.has(closeEvent.code) ? "server_wide" : "default"
        )
      }
    }

    socket.onerror = () => {
      if (this.socket !== socket) return
      this.emitStatus("error")
    }
  }

  /**
   * Sign-out or session change. The socket is closed with a normal close
   * frame, so the server releases the connection (and a MiniRoom partner sees
   * the user leave) at once instead of after the heartbeat timeout.
   */
  public disconnect(): void {
    this.intentionalDisconnect = true
    this.sessionToken = null
    this.connectionGeneration += 1
    this.reconnectAttempts = 0
    this.ticketRequestInFlight = false
    this.clearReconnectTimer()
    this.closeCurrentSocket(CLIENT_NORMAL_CLOSE_CODE, "Client disconnected")
    this.emitStatus("disconnected")
  }

  /**
   * App foreground signal. While inactive no retry is scheduled. Returning to
   * the foreground cancels any pending backoff and reconnects at once when no
   * socket is live or opening, including a socket the OS closed without
   * delivering its close event and an open socket that stayed silent past its
   * liveness window (timers do not run while iOS suspends the app). The fast backoff starts over because the
   * outage began while the app could not retry; a server already classified
   * unreachable keeps that level, so the status stays honest if this attempt
   * fails too.
   */
  public setAppActive(isActive: boolean): void {
    if (this.appActive === isActive && !(isActive && this.suspended)) return
    this.appActive = isActive
    if (!isActive) {
      this.clearReconnectTimer()
      return
    }
    this.suspended = false
    if (
      this.intentionalDisconnect ||
      this.sessionRefused ||
      !this.sessionToken ||
      !this.networkConnected ||
      this.ticketRequestInFlight
    ) return
    if (this.socket) {
      const { readyState } = this.socket
      if (readyState === SOCKET_CONNECTING) return
      if (readyState === SOCKET_OPEN && !this.isSocketSilent()) return
      this.closeCurrentSocket(REALTIME_LIVENESS_CLOSE_CODE, "Realtime liveness timeout")
    }
    this.clearReconnectTimer()
    if (this.reconnectAttempts < REALTIME_FAST_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts = 0
    }
    this.emitStatus("reconnecting")
    this.connectionGeneration += 1
    void this.openSocket(this.sessionToken, this.connectionGeneration)
  }

  /**
   * The app went to the background. A suspended iOS app cannot answer the
   * server's pings, so an open socket would keep the user "connected", and
   * chat push notifications suppressed, until the heartbeat terminates it
   * 15-30 s later. Close it now with a normal close frame and stay closed
   * until setAppActive(true).
   */
  public suspend(): void {
    this.appActive = false
    this.suspended = true
    this.clearReconnectTimer()
    if (this.intentionalDisconnect || !this.sessionToken || this.sessionRefused) return
    const hadConnection = this.socket !== null || this.ticketRequestInFlight
    this.connectionGeneration += 1
    this.ticketRequestInFlight = false
    this.closeCurrentSocket(CLIENT_NORMAL_CLOSE_CODE, "Client suspended")
    if (hadConnection) this.emitStatus("disconnected")
  }

  public setNetworkConnected(isConnected: boolean): void {
    if (this.networkConnected === isConnected) return
    this.networkConnected = isConnected

    if (!isConnected) {
      this.connectionGeneration += 1
      this.ticketRequestInFlight = false
      this.clearReconnectTimer()
      this.closeCurrentSocket()
      if (!this.intentionalDisconnect && this.sessionToken) {
        this.emitStatus("reconnecting")
      }
      return
    }

    if (
      !this.intentionalDisconnect &&
      !this.sessionRefused &&
      !this.suspended &&
      this.sessionToken &&
      !this.socket
    ) {
      // Losing the network, not the server, caused this outage: start again
      // with the fast attempts.
      this.reconnectAttempts = 0
      this.clearReconnectTimer()
      this.emitStatus("reconnecting")
      this.connectionGeneration += 1
      void this.openSocket(this.sessionToken, this.connectionGeneration)
    }
  }

  public send(event: ClientEvent): boolean {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) {
      return false
    }
    try {
      this.socket.send(JSON.stringify(event))
      return true
    } catch {
      return false
    }
  }

  public onServerEvent(listener: ServerEventListener): () => void {
    this.serverEventListeners.add(listener)
    return () => {
      this.serverEventListeners.delete(listener)
    }
  }

  public onConnectionStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private emitStatus(status: RealtimeConnectionStatus, meta?: RealtimeConnectionMeta): void {
    for (const listener of this.statusListeners) {
      listener(status, meta)
    }
  }

  private scheduleReconnect(kind: ReconnectKind = "default"): void {
    if (this.intentionalDisconnect || !this.sessionToken || !this.networkConnected) return

    const fast = this.reconnectAttempts < REALTIME_FAST_RECONNECT_ATTEMPTS
    const delay = this.reconnectDelay(kind, fast)
    this.reconnectAttempts += 1
    this.emitStatus(fast ? "reconnecting" : "unreachable")
    this.clearReconnectTimer()
    // Backgrounded: wait for setAppActive(true), which retries at once.
    if (!this.appActive) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.intentionalDisconnect || !this.sessionToken) return
      this.connectionGeneration += 1
      void this.openSocket(this.sessionToken, this.connectionGeneration)
    }, delay)
  }

  /**
   * The first retry uses full jitter over a short window (a wider one after a
   * server-wide close, none after a liveness failure, whose cause is this
   * device's network). Later retries use equal jitter below an exponential
   * ceiling, so an accept-then-close loop keeps growing its delay while
   * clients dropped together stay spread. After the fast attempts the client
   * never gives up: it keeps retrying at most
   * REALTIME_SLOW_RECONNECT_CEILING_MS apart and says so honestly.
   */
  private reconnectDelay(kind: ReconnectKind, fast: boolean): number {
    if (this.reconnectAttempts === 0) {
      const window = kind === "immediate"
        ? 0
        : kind === "server_wide"
          ? REALTIME_RESTART_RECONNECT_WINDOW_MS
          : REALTIME_FIRST_RECONNECT_WINDOW_MS
      return Math.floor(this.random() * window)
    }
    const exponent = Math.min(this.reconnectAttempts, 16)
    const ceiling = Math.min(
      1_000 * 2 ** exponent,
      fast ? REALTIME_FAST_RECONNECT_CEILING_MS : REALTIME_SLOW_RECONNECT_CEILING_MS
    )
    return Math.round(ceiling / 2 + this.random() * (ceiling / 2))
  }

  private isSocketSilent(): boolean {
    return this.livenessTimeoutMs !== null &&
      this.now() - this.lastInboundAt >= this.livenessTimeoutMs
  }

  private armLivenessTimer(): void {
    const socket = this.socket
    const timeoutMs = this.livenessTimeoutMs
    if (!socket || timeoutMs === null || this.livenessTimer) return
    const remaining = Math.max(1, this.lastInboundAt + timeoutMs - this.now())
    this.livenessTimer = setTimeout(() => {
      this.livenessTimer = null
      if (this.socket !== socket) return
      if (!this.isSocketSilent()) {
        // Traffic arrived since arming: check again when it would expire.
        this.armLivenessTimer()
        return
      }
      this.handleSilentSocket()
    }, remaining)
  }

  /** The socket stopped delivering anything, heartbeats included. */
  private handleSilentSocket(): void {
    this.closeCurrentSocket(REALTIME_LIVENESS_CLOSE_CODE, "Realtime liveness timeout")
    this.emitStatus("disconnected", { closeCode: REALTIME_LIVENESS_CLOSE_CODE })
    this.connectionGeneration += 1
    this.scheduleReconnect("immediate")
  }

  private clearLivenessTimer(): void {
    if (!this.livenessTimer) return
    clearTimeout(this.livenessTimer)
    this.livenessTimer = null
  }

  private markConnectionHealthy(): void {
    this.clearStableConnectionTimer()
    this.reconnectAttempts = 0
  }

  private clearStableConnectionTimer(): void {
    if (!this.stableConnectionTimer) return
    clearTimeout(this.stableConnectionTimer)
    this.stableConnectionTimer = null
  }

  private clearConnectTimeoutTimer(): void {
    if (!this.connectTimeoutTimer) return
    clearTimeout(this.connectTimeoutTimer)
    this.connectTimeoutTimer = null
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private closeCurrentSocket(code?: number, reason?: string): void {
    const socket = this.socket
    this.socket = null
    this.livenessTimeoutMs = null
    this.clearStableConnectionTimer()
    this.clearConnectTimeoutTimer()
    this.clearLivenessTimer()
    if (!socket) return
    try {
      if (code === undefined) socket.close()
      else socket.close(code, reason)
    } catch {
      // A socket that cannot send a close frame is already gone.
    }
  }

  private isCurrentConnectionAttempt(
    sessionToken: string,
    generation: number
  ): boolean {
    return (
      !this.intentionalDisconnect &&
      this.networkConnected &&
      this.sessionToken === sessionToken &&
      this.connectionGeneration === generation
    )
  }
}
