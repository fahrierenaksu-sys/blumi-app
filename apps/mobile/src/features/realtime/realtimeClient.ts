import type { ClientEvent, ServerEvent } from "@blumi/realtime-client"
import { parseServerEvent } from "@blumi/contracts"

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
const FAST_RECONNECT_CEILING_MS = 30_000
/** Slow retries continue indefinitely, never more than this far apart. */
export const REALTIME_SLOW_RECONNECT_CEILING_MS = 60_000
/**
 * A socket must stay open this long (or deliver an authenticated server
 * event) before the backoff resets, so an accept-then-close loop keeps
 * growing its delay instead of reconnecting every second.
 */
export const REALTIME_STABLE_CONNECTION_MS = 10_000
const REALTIME_TICKET_FORBIDDEN_CLOSE_CODE = 4403

export function isRealtimeAuthInvalidClose(closeCode: number | undefined): boolean {
  return closeCode === REALTIME_AUTH_INVALID_CLOSE_CODE
}

type ServerEventListener = (event: ServerEvent) => void
type StatusListener = (status: RealtimeConnectionStatus, meta?: RealtimeConnectionMeta) => void
export type RealtimeTicketProvider = (sessionToken: string) => Promise<string>

export interface RealtimeClientOptions {
  /** Uniform random source in [0, 1); injectable for deterministic tests. */
  random?: () => number
  /** Observer for dropped inbound events; defaults to a development-only warning. */
  onDroppedEvent?: (drop: RealtimeEventDrop) => void
}

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
  private socket: WebSocket | null = null
  private sessionToken: string | null = null
  private intentionalDisconnect = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null
  private ticketRequestInFlight = false
  /** The server refused this session (401/403 ticket, 1008/4401 close); only connect() retries. */
  private sessionRefused = false
  private networkConnected = true
  private appActive = true
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
  }

  private readonly random: () => number
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
    this.closeCurrentSocket()
    this.emitStatus("connecting")

    if (!this.networkConnected) {
      this.emitStatus("reconnecting")
      return
    }
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

    const socket = new WebSocket(
      createWebSocketUrl(this.wsBaseUrl),
      [`ticket-${ticket}`]
    )
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) return
      this.clearStableConnectionTimer()
      this.stableConnectionTimer = setTimeout(() => {
        this.stableConnectionTimer = null
        if (this.socket === socket) this.markConnectionHealthy()
      }, REALTIME_STABLE_CONNECTION_MS)
      this.emitStatus("connected")
    }

    socket.onmessage = (messageEvent) => {
      if (this.socket !== socket) return
      if (typeof messageEvent.data !== "string") {
        return
      }
      this.handleInboundMessage(messageEvent.data)
    }

    socket.onclose = (closeEvent) => {
      if (this.socket !== socket) return
      this.socket = null
      this.clearStableConnectionTimer()
      this.emitStatus("disconnected", { closeCode: closeEvent.code })
      if (
        closeEvent.code === 1008 ||
        closeEvent.code === REALTIME_AUTH_INVALID_CLOSE_CODE
      ) {
        this.sessionRefused = true
        this.emitStatus("error", { closeCode: closeEvent.code })
        return
      }
      if (!this.intentionalDisconnect && this.networkConnected) {
        this.scheduleReconnect()
      }
    }

    socket.onerror = () => {
      if (this.socket !== socket) return
      this.emitStatus("error")
    }
  }

  public disconnect(): void {
    this.intentionalDisconnect = true
    this.sessionToken = null
    this.connectionGeneration += 1
    this.reconnectAttempts = 0
    this.ticketRequestInFlight = false
    this.clearReconnectTimer()
    this.closeCurrentSocket()
    this.emitStatus("disconnected")
  }

  /**
   * App foreground/background signal. Backgrounded, no retry is scheduled;
   * returning to the foreground retries at once when no socket is live or
   * being opened. The backoff level is kept, so a still-unreachable server
   * reports "unreachable" again after this attempt fails.
   */
  public setAppActive(isActive: boolean): void {
    if (this.appActive === isActive) return
    this.appActive = isActive
    if (!isActive) {
      this.clearReconnectTimer()
      return
    }
    if (
      this.intentionalDisconnect ||
      this.sessionRefused ||
      !this.sessionToken ||
      !this.networkConnected ||
      this.socket ||
      this.ticketRequestInFlight
    ) return
    this.clearReconnectTimer()
    this.emitStatus("reconnecting")
    this.connectionGeneration += 1
    void this.openSocket(this.sessionToken, this.connectionGeneration)
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

    if (!this.intentionalDisconnect && !this.sessionRefused && this.sessionToken && !this.socket) {
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
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
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

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect || !this.sessionToken || !this.networkConnected) return

    // A fanout gap or server restart closes every socket on an instance at
    // once. Equal jitter keeps each attempt within its exponential ceiling
    // while spreading clients across the upper half of the window. After the
    // fast attempts the client never gives up: it keeps retrying at most
    // REALTIME_SLOW_RECONNECT_CEILING_MS apart and says so honestly.
    const fast = this.reconnectAttempts < REALTIME_FAST_RECONNECT_ATTEMPTS
    const exponent = Math.min(this.reconnectAttempts, 16)
    const ceiling = Math.min(
      1_000 * 2 ** exponent,
      fast ? FAST_RECONNECT_CEILING_MS : REALTIME_SLOW_RECONNECT_CEILING_MS
    )
    const delay = Math.round(ceiling / 2 + this.random() * (ceiling / 2))
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

  private markConnectionHealthy(): void {
    this.clearStableConnectionTimer()
    this.reconnectAttempts = 0
  }

  private clearStableConnectionTimer(): void {
    if (!this.stableConnectionTimer) return
    clearTimeout(this.stableConnectionTimer)
    this.stableConnectionTimer = null
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private closeCurrentSocket(): void {
    const socket = this.socket
    this.socket = null
    this.clearStableConnectionTimer()
    socket?.close()
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
