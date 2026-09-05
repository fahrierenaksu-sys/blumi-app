import type { ClientEvent, ServerEvent } from "@blumi/realtime-client"

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "disconnected"
  | "error"

export interface RealtimeConnectionMeta {
  closeCode?: number
}

export const REALTIME_AUTH_INVALID_CLOSE_CODE = 4401
const REALTIME_TICKET_FORBIDDEN_CLOSE_CODE = 4403

export function isRealtimeAuthInvalidClose(closeCode: number | undefined): boolean {
  return closeCode === REALTIME_AUTH_INVALID_CLOSE_CODE
}

type ServerEventListener = (event: ServerEvent) => void
type StatusListener = (status: RealtimeConnectionStatus, meta?: RealtimeConnectionMeta) => void
export type RealtimeTicketProvider = (sessionToken: string) => Promise<string>

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

function isServerEvent(value: unknown): value is ServerEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).type === "string" &&
    "payload" in (value as Record<string, unknown>)
  )
}

export class RealtimeClient {
  private socket: WebSocket | null = null
  private sessionToken: string | null = null
  private intentionalDisconnect = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private networkConnected = true
  private connectionGeneration = 0
  private readonly serverEventListeners = new Set<ServerEventListener>()
  private readonly statusListeners = new Set<StatusListener>()

  public constructor(
    private readonly wsBaseUrl: string,
    private readonly ticketProvider: RealtimeTicketProvider
  ) {}

  public connect(sessionToken: string): void {
    this.intentionalDisconnect = false
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
    try {
      ticket = await this.ticketProvider(sessionToken)
    } catch (error) {
      if (!this.isCurrentConnectionAttempt(sessionToken, generation)) return
      if (
        error instanceof RealtimeTicketRequestError &&
        error.statusCode === 401
      ) {
        this.emitStatus("error", { closeCode: REALTIME_AUTH_INVALID_CLOSE_CODE })
        return
      }
      if (
        error instanceof RealtimeTicketRequestError &&
        error.statusCode === 403
      ) {
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
      this.reconnectAttempts = 0
      this.emitStatus("connected")
    }

    socket.onmessage = (messageEvent) => {
      if (this.socket !== socket) return
      if (typeof messageEvent.data !== "string") {
        return
      }

      try {
        const parsed = JSON.parse(messageEvent.data) as unknown
        if (!isServerEvent(parsed)) {
          return
        }
        for (const listener of this.serverEventListeners) {
          listener(parsed)
        }
      } catch {
        return
      }
    }

    socket.onclose = (closeEvent) => {
      if (this.socket !== socket) return
      this.socket = null
      this.emitStatus("disconnected", { closeCode: closeEvent.code })
      if (
        closeEvent.code === 1008 ||
        closeEvent.code === REALTIME_AUTH_INVALID_CLOSE_CODE
      ) {
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
    this.clearReconnectTimer()
    this.closeCurrentSocket()
    this.emitStatus("disconnected")
  }

  public setNetworkConnected(isConnected: boolean): void {
    if (this.networkConnected === isConnected) return
    this.networkConnected = isConnected

    if (!isConnected) {
      this.connectionGeneration += 1
      this.clearReconnectTimer()
      this.closeCurrentSocket()
      if (!this.intentionalDisconnect && this.sessionToken) {
        this.emitStatus("reconnecting")
      }
      return
    }

    if (!this.intentionalDisconnect && this.sessionToken && !this.socket) {
      this.reconnectAttempts = 0
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
    if (this.reconnectAttempts >= 10 || !this.sessionToken || !this.networkConnected) {
      this.emitStatus("error")
      return
    }

    const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, 30_000)
    this.reconnectAttempts += 1
    this.emitStatus("reconnecting")
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.intentionalDisconnect || !this.sessionToken) return
      this.connectionGeneration += 1
      void this.openSocket(this.sessionToken, this.connectionGeneration)
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private closeCurrentSocket(): void {
    const socket = this.socket
    this.socket = null
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
