import { randomUUID } from "node:crypto"
import type { ServerEvent, UserProfile } from "@blumi/contracts"
import type { WebSocket } from "ws"
import {
  splitRealtimeFanoutTarget,
  type RealtimeFanout,
  type RealtimeFanoutMessage
} from "./realtimeFanout"

/**
 * Slow-consumer policy for each socket's outbound buffer (`bufferedAmount`,
 * bytes accepted by `ws` but not yet flushed to the kernel):
 *
 * - Above the soft limit, transient events that the next event or snapshot
 *   supersedes (presence, reactions) are dropped for that socket; every other
 *   event, including chat delivery, is still sent.
 * - Staying above the soft limit for the sustained window, or crossing the
 *   hard limit at any time, closes the socket with 1013 (try again later) and
 *   terminates it one second later so its buffer is released.
 *
 * Nothing durable is lost: chat messages are committed with a delivery outbox
 * before fanout, and a reconnecting client reconciles from the API. 1013 is
 * used because the mobile client reconnects on it (it stops on 1008). Memory per
 * slow socket stays bounded by the hard limit plus one event.
 */
export const REALTIME_OUTBOUND_SOFT_LIMIT_BYTES = 256 * 1024
export const REALTIME_OUTBOUND_HARD_LIMIT_BYTES = 1024 * 1024
export const REALTIME_OUTBOUND_SUSTAINED_MS = 10_000
export const REALTIME_SLOW_CONSUMER_CLOSE_CODE = 1013
const TRANSIENT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "presence.snapshot",
  "presence.nearby",
  "reaction.received",
  // Superseded by the next step; the room snapshot (not transient) re-syncs.
  "mini_room.avatar_moved"
])

export interface RealtimeConnection {
  connectionId: string
  userId: string
  profile: UserProfile
  socket: WebSocket
  joinedRoomIds: Set<string>
  isAlive: boolean
  sessionFamilyId?: string
}

export interface ConnectionManager {
  addConnection(input: {
    socket: WebSocket
    profile: UserProfile
    sessionFamilyId?: string
    connectionId?: string
  }): RealtimeConnection
  setDeliveryAuthorization(authorize: (connection: RealtimeConnection) => Promise<boolean>): void
  removeConnection(connectionId: string): RealtimeConnection | null
  getConnection(connectionId: string): RealtimeConnection | null
  listConnections(): RealtimeConnection[]
  hasUserConnections(userId: string): boolean
  getUserConnections(userId: string): RealtimeConnection[]
  joinRoom(connectionId: string, roomId: string): void
  leaveRoom(connectionId: string, roomId: string): void
  sendToConnection(connectionId: string, event: ServerEvent): void
  sendToUser(userId: string, event: ServerEvent): void
  sendToUsers(userIds: readonly string[], event: ServerEvent): void
  sendToUsersDurably(userIds: readonly string[], event: ServerEvent): Promise<void>
  broadcastRoom(roomId: string, event: ServerEvent): void
  startFanout(): Promise<void>
  isFanoutReady(): boolean
  closeFanout(): Promise<void>
}

export interface CreateConnectionManagerOptions {
  fanout?: RealtimeFanout
  instanceId?: string
  reportFanoutError?: (error: unknown) => void
  shutdownDrainTimeoutMs?: number
  outboundBuffer?: {
    softLimitBytes?: number
    hardLimitBytes?: number
    sustainedMs?: number
  }
  now?: () => number
}

export function createConnectionManager(
  options: CreateConnectionManagerOptions = {}
): ConnectionManager {
  const connections = new Map<string, RealtimeConnection>()
  const instanceId = options.instanceId ?? `realtime_${randomUUID()}`
  let unsubscribe: (() => Promise<void>) | undefined
  let startingFanout: Promise<void> | undefined
  let authorizeDelivery: ((connection: RealtimeConnection) => Promise<boolean>) | undefined
  const deliveryQueues = new Map<string, { pending: number; tail: Promise<void> }>()
  const pendingOperations = new Set<Promise<unknown>>()
  const gapTerminationTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const slowSince = new Map<string, number>()
  const softLimitBytes = options.outboundBuffer?.softLimitBytes ?? REALTIME_OUTBOUND_SOFT_LIMIT_BYTES
  const hardLimitBytes = options.outboundBuffer?.hardLimitBytes ?? REALTIME_OUTBOUND_HARD_LIMIT_BYTES
  const sustainedMs = options.outboundBuffer?.sustainedMs ?? REALTIME_OUTBOUND_SUSTAINED_MS
  const now = options.now ?? Date.now
  let closingFanout = false
  let closedFanout: Promise<void> | undefined
  function reportFanoutError(error: unknown): void {
    try { options.reportFanoutError?.(error) }
    catch { /* Reporting must not strand shutdown or fanout cleanup. */ }
  }
  function track<T>(operation: Promise<T>): Promise<T> {
    pendingOperations.add(operation)
    void operation.then(() => pendingOperations.delete(operation), () => pendingOperations.delete(operation))
    return operation
  }

  return {
    setDeliveryAuthorization(authorize) {
      authorizeDelivery = authorize
    },
    addConnection({ socket, profile, sessionFamilyId, connectionId }) {
      const connection: RealtimeConnection = {
        connectionId: connectionId ?? `connection_${randomUUID()}`,
        userId: profile.userId,
        sessionFamilyId,
        profile: {
          ...profile,
          avatar: { ...profile.avatar }
        },
        socket,
        joinedRoomIds: new Set(),
        isAlive: true
      }
      if (connections.has(connection.connectionId)) {
        throw new Error("Realtime connection ID is already active.")
      }
      connections.set(connection.connectionId, connection)
      return connection
    },
    removeConnection(connectionId) {
      const connection = connections.get(connectionId) ?? null
      connections.delete(connectionId)
      clearTimeout(gapTerminationTimers.get(connectionId))
      gapTerminationTimers.delete(connectionId)
      deliveryQueues.delete(connectionId)
      slowSince.delete(connectionId)
      return connection
    },
    getConnection(connectionId) {
      return connections.get(connectionId) ?? null
    },
    listConnections() {
      return [...connections.values()]
    },
    hasUserConnections(userId) {
      return [...connections.values()].some(
        (connection) => connection.userId === userId
      )
    },
    getUserConnections(userId) {
      return [...connections.values()].filter(
        (connection) => connection.userId === userId
      )
    },
    joinRoom(connectionId, roomId) {
      connections.get(connectionId)?.joinedRoomIds.add(roomId)
    },
    leaveRoom(connectionId, roomId) {
      connections.get(connectionId)?.joinedRoomIds.delete(roomId)
    },
    sendToConnection(connectionId, event) {
      const connection = connections.get(connectionId)
      if (connection) deliver(connection, event)
    },
    sendToUser(userId, event) {
      sendToUserLocally(userId, event)
      publishFanout({ kind: "user", userId }, event)
    },
    sendToUsers(userIds, event) {
      const userIdList = [...new Set(userIds)]
      sendToUsersLocally(userIdList, event)
      if (userIdList.length > 0) {
        publishFanout({ kind: "users", userIds: userIdList }, event)
      }
    },
    async sendToUsersDurably(userIds, event) {
      if (closingFanout) throw new Error("Realtime fanout is closing")
      const userIdList = [...new Set(userIds)]
      sendToUsersLocally(userIdList, event)
      // Durable callers must observe transport rejection before acknowledging
      // their database job. Recipients deduplicate retries by event/message ID.
      const fanout = options.fanout
      if (fanout && userIdList.length > 0) {
        const targets = splitRealtimeFanoutTarget({ kind: "users", userIds: userIdList })
        await track(Promise.all(targets.map((target) =>
          fanout.publish({ origin: instanceId, target, event }))))
      }
    },
    broadcastRoom(roomId, event) {
      broadcastRoomLocally(roomId, event)
      publishFanout({ kind: "room", roomId }, event)
    },
    async startFanout() {
      if (closingFanout) throw new Error("Realtime fanout is closing")
      if (!options.fanout || unsubscribe) return
      if (startingFanout) return startingFanout
      const start = options.fanout.subscribe((message) => {
        if (closingFanout || message.origin === instanceId) return
        deliverFanoutMessage(message)
      }, () => {
        // LISTEN gaps are instance-wide. Force clients through reconnect and
        // authoritative reconciliation instead of leaving stale sockets live.
        for (const connection of connections.values()) {
          const socket = connection.socket
          if (socket.readyState === 3 || gapTerminationTimers.has(connection.connectionId)) continue
          if (socket.readyState === 1) socket.close(1012, "Realtime resynchronization required")
          const timer = setTimeout(() => {
            gapTerminationTimers.delete(connection.connectionId)
            if (socket.readyState !== 3) socket.terminate()
          }, 1_000)
          timer.unref()
          gapTerminationTimers.set(connection.connectionId, timer)
        }
      }).then((nextUnsubscribe) => {
        if (closingFanout) {
          return Promise.resolve().then(nextUnsubscribe).catch(reportFanoutError)
        } else {
          unsubscribe = nextUnsubscribe
        }
      })
      startingFanout = start
      try {
        await start
      } finally {
        if (startingFanout === start) startingFanout = undefined
      }
    },
    isFanoutReady() {
      return !closingFanout && (!options.fanout || Boolean(unsubscribe) && (options.fanout.isHealthy?.() ?? true))
    },
    closeFanout() {
      if (closedFanout) return closedFanout
      closingFanout = true
      for (const [connectionId, timer] of gapTerminationTimers) {
        clearTimeout(timer)
        const socket = connections.get(connectionId)?.socket
        if (socket && socket.readyState !== 3) socket.terminate()
      }
      gapTerminationTimers.clear()
      closedFanout = (async () => {
        let drainTimedOut = false
        let drainTimer: ReturnType<typeof setTimeout> | undefined
        const deadline = new Promise<void>((resolve) => {
          drainTimer = setTimeout(() => { drainTimedOut = true; resolve() },
            Math.max(1, options.shutdownDrainTimeoutMs ?? 6_000))
        })
        try {
          const pendingStart = startingFanout
          if (pendingStart) await Promise.race([
            pendingStart.catch(reportFanoutError), deadline
          ])
          // Preserve the ordinary drain, but a stuck publisher or authorization
          // check must not hold the LISTEN client or process shutdown forever.
          while (!drainTimedOut && pendingOperations.size) {
            await Promise.race([Promise.allSettled([...pendingOperations]), deadline])
          }
        } finally {
          const current = unsubscribe
          unsubscribe = undefined
          if (current) await Promise.race([
            Promise.resolve().then(current).catch(reportFanoutError), deadline
          ])
          clearTimeout(drainTimer)
          if (drainTimedOut) reportFanoutError(new Error("Realtime fanout shutdown drain timed out."))
        }
      })()
      return closedFanout
    }
  }

  function sendToUserLocally(userId: string, event: ServerEvent): void {
    for (const connection of connections.values()) {
      if (connection.userId === userId) deliver(connection, event)
    }
  }

  function sendToUsersLocally(
    userIds: readonly string[],
    event: ServerEvent
  ): void {
    const userIdSet = new Set(userIds)
    for (const connection of connections.values()) {
      if (userIdSet.has(connection.userId)) deliver(connection, event)
    }
  }

  function broadcastRoomLocally(roomId: string, event: ServerEvent): void {
    for (const connection of connections.values()) {
      if (connection.joinedRoomIds.has(roomId)) deliver(connection, event)
    }
  }

  function deliver(connection: RealtimeConnection, event: ServerEvent): void {
    if (closingFanout) return
    if (connection.socket.readyState !== 1) return
    const authorize = authorizeDelivery
    if (!authorize) {
      sendEvent(connection, event)
      return
    }
    const previous = deliveryQueues.get(connection.connectionId)
    if ((previous?.pending ?? 0) >= 64) {
      connection.socket.close(4429, "Realtime delivery backlog exceeded")
      return
    }
    // Serialize bounded delivery checks. The realtime server's authorizer reuses a
    // positive decision for at most REALTIME_AUTHORIZATION_CACHE_TTL_MS and drops it
    // at once on local revocations; this queue never caches decisions itself.
    const queued = {
      pending: (previous?.pending ?? 0) + 1,
      tail: (previous?.tail ?? Promise.resolve()).then(async () => {
        if (connections.get(connection.connectionId) !== connection || connection.socket.readyState !== 1) return
        if (await authorize(connection)) sendEvent(connection, event)
      }).catch(() => {
        if (connection.socket.readyState === 1) connection.socket.close(1011, "Realtime authorization unavailable")
      }).finally(() => {
        const current = deliveryQueues.get(connection.connectionId)
        if (!current) return
        if (current.pending <= 1) deliveryQueues.delete(connection.connectionId)
        else deliveryQueues.set(connection.connectionId, { ...current, pending: current.pending - 1 })
      })
    }
    deliveryQueues.set(connection.connectionId, queued)
    track(queued.tail)
  }

  function publishFanout(
    target: RealtimeFanoutMessage["target"],
    event: ServerEvent
  ): void {
    const fanout = options.fanout
    if (!fanout || closingFanout) return
    for (const chunk of splitRealtimeFanoutTarget(target)) {
      void track(fanout.publish({
        origin: instanceId,
        target: chunk,
        event
      })).catch((error) => {
        reportFanoutError(error)
      })
    }
  }

  function sendEvent(connection: RealtimeConnection, event: ServerEvent): void {
    const socket = connection.socket
    if (socket.readyState !== 1) return
    const bufferedAmount = socket.bufferedAmount ?? 0
    if (bufferedAmount > hardLimitBytes) {
      closeSlowConsumer(connection)
      return
    }
    if (bufferedAmount > softLimitBytes) {
      const since = slowSince.get(connection.connectionId)
      if (since === undefined) {
        slowSince.set(connection.connectionId, now())
      } else if (now() - since >= sustainedMs) {
        closeSlowConsumer(connection)
        return
      }
      if (TRANSIENT_EVENT_TYPES.has(event.type)) return
    } else {
      slowSince.delete(connection.connectionId)
    }
    socket.send(JSON.stringify(event))
  }

  function closeSlowConsumer(connection: RealtimeConnection): void {
    slowSince.delete(connection.connectionId)
    const socket = connection.socket
    socket.close(REALTIME_SLOW_CONSUMER_CLOSE_CODE, "Realtime client is too slow")
    if (gapTerminationTimers.has(connection.connectionId)) return
    // The close frame queues behind the backlog; release the buffer promptly.
    const timer = setTimeout(() => {
      gapTerminationTimers.delete(connection.connectionId)
      if (socket.readyState !== 3) socket.terminate()
    }, 1_000)
    timer.unref()
    gapTerminationTimers.set(connection.connectionId, timer)
  }

  function deliverFanoutMessage(message: RealtimeFanoutMessage): void {
    switch (message.target.kind) {
      case "user":
        sendToUserLocally(message.target.userId, message.event)
        return
      case "users":
        sendToUsersLocally(message.target.userIds, message.event)
        return
      case "room":
        broadcastRoomLocally(message.target.roomId, message.event)
        return
    }
  }
}
