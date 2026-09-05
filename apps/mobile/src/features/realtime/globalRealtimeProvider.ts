/**
 * globalRealtimeProvider – single WebSocket owner for the entire app session.
 *
 * Rules:
 * - Only one WebSocket connection per authenticated session.
 * - All screens/features subscribe to filtered event streams via
 *   useGlobalRealtime() or useGlobalRealtimeEvents().
 * - Sending events goes through the shared client.
 * - Connection lifecycle is managed by RootNavigator via connectGlobal/disconnectGlobal.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { ClientEvent, ServerEvent } from "@blumi/realtime-client"
import {
  getIsConnected,
  subscribeToNetworkStatus
} from "../network/networkStore"
import {
  RealtimeClient,
  type RealtimeConnectionMeta,
  type RealtimeConnectionStatus
} from "./realtimeClient"
import { requestRealtimeTicket } from "./realtimeTicketApi"

// ─── Singleton state ────────────────────────────────────────
let globalClient: RealtimeClient | null = null
let globalStatus: RealtimeConnectionStatus = "idle"
let unsubscribeNetworkStatus: (() => void) | null = null

type StatusListener = (status: RealtimeConnectionStatus, meta?: RealtimeConnectionMeta) => void
type EventListener = (event: ServerEvent) => void

const statusListeners = new Set<StatusListener>()
const eventListeners = new Set<EventListener>()

function notifyStatus(status: RealtimeConnectionStatus, meta?: RealtimeConnectionMeta): void {
  globalStatus = status
  for (const l of statusListeners) l(status, meta)
}

function notifyEvent(event: ServerEvent): void {
  for (const l of eventListeners) l(event)
}

// ─── Lifecycle (called by RootNavigator) ────────────────────

export function connectGlobal(
  wsBaseUrl: string,
  httpBaseUrl: string,
  sessionToken: string
): void {
  disconnectGlobal()
  const client = new RealtimeClient(
    wsBaseUrl,
    (token) => requestRealtimeTicket(httpBaseUrl, token)
  )
  globalClient = client
  client.setNetworkConnected(getIsConnected())
  unsubscribeNetworkStatus = subscribeToNetworkStatus((isConnected) => {
    if (globalClient === client) client.setNetworkConnected(isConnected)
  })

  client.onConnectionStatus((status, meta) => {
    if (globalClient !== client) return
    notifyStatus(status, meta)
  })
  client.onServerEvent((event) => {
    if (globalClient !== client) return
    notifyEvent(event)
  })

  client.connect(sessionToken)
}

export function disconnectGlobal(): void {
  unsubscribeNetworkStatus?.()
  unsubscribeNetworkStatus = null
  if (globalClient) {
    globalClient.disconnect()
    globalClient = null
  }
  notifyStatus("idle")
}

export function sendGlobal(event: ClientEvent): boolean {
  return globalClient?.send(event) ?? false
}

export function getGlobalStatus(): RealtimeConnectionStatus {
  return globalStatus
}

// ─── Subscribe helpers ──────────────────────────────────────

export function subscribeToStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  return () => { statusListeners.delete(listener) }
}

export function subscribeToEvents(listener: EventListener): () => void {
  eventListeners.add(listener)
  return () => { eventListeners.delete(listener) }
}

// ─── React hooks ────────────────────────────────────────────

export interface GlobalRealtimeView {
  connectionStatus: RealtimeConnectionStatus
  send: (event: ClientEvent) => boolean
}

/**
 * Subscribe to the global realtime connection status + send capability.
 * Does NOT create any new WebSocket.
 */
export function useGlobalRealtime(): GlobalRealtimeView {
  const [status, setStatus] = useState<RealtimeConnectionStatus>(() => globalStatus)

  useEffect(() => {
    setStatus(globalStatus)
    return subscribeToStatus((next) => { setStatus(next) })
  }, [])

  const send = useCallback((event: ClientEvent) => {
    return sendGlobal(event)
  }, [])

  return { connectionStatus: status, send }
}

/**
 * Subscribe to server events from the global connection.
 * The callback is called for every event; filter inside.
 */
export function useGlobalRealtimeEvents(
  onEvent: (event: ServerEvent) => void
): void {
  const callbackRef = useRef(onEvent)
  callbackRef.current = onEvent

  useEffect(() => {
    return subscribeToEvents((event) => {
      callbackRef.current(event)
    })
  }, [])
}
