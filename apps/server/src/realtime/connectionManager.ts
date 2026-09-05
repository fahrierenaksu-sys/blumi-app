import { randomUUID } from "node:crypto"
import type { ServerEvent, UserProfile } from "@blumi/contracts"
import type { WebSocket } from "ws"
import {
  type RealtimeFanout,
  type RealtimeFanoutMessage
} from "./realtimeFanout"

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
  let closingFanout = false
  let closedFanout: Promise<void> | undefined
  function track<T>(operation: Promise<T>): Promise<T> {
    pendingOperations.add(operation)
    void operation.then(() => pendingOperations.delete(operation), () => pendingOperations.delete(operation))
    return operation
  }

  return {
    setDeliveryAuthorization(authorize) {
      authorizeDelivery = authorize
    },
    addConnection({ socket, profile, sessionFamilyId }) {
      const connection: RealtimeConnection = {
        connectionId: `connection_${randomUUID()}`,
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
      connections.set(connection.connectionId, connection)
      return connection
    },
    removeConnection(connectionId) {
      const connection = connections.get(connectionId) ?? null
      connections.delete(connectionId)
      deliveryQueues.delete(connectionId)
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
      if (options.fanout && userIdList.length > 0) {
        await track(options.fanout.publish({ origin: instanceId, target: { kind: "users", userIds: userIdList }, event }))
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
      }).then((nextUnsubscribe) => {
        unsubscribe = nextUnsubscribe
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
      closedFanout = (async () => {
      const pendingStart = startingFanout
      if (pendingStart) await pendingStart.catch((error) => {
        options.reportFanoutError?.(error)
      })
      // Producers have drained first. Track work independently of connections:
      // socket removal must not discard an already-running authorization query.
      while (pendingOperations.size) await Promise.allSettled([...pendingOperations])
      const current = unsubscribe
      unsubscribe = undefined
      if (current) {
        await current().catch((error) => {
          options.reportFanoutError?.(error)
        })
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
      sendEvent(connection.socket, event)
      return
    }
    const previous = deliveryQueues.get(connection.connectionId)
    if ((previous?.pending ?? 0) >= 64) {
      connection.socket.close(4429, "Realtime delivery backlog exceeded")
      return
    }
    // Serialize bounded delivery checks: no positive auth cache can leak events
    // after revocation, including events arriving from another server instance.
    const queued = {
      pending: (previous?.pending ?? 0) + 1,
      tail: (previous?.tail ?? Promise.resolve()).then(async () => {
        if (connections.get(connection.connectionId) !== connection || connection.socket.readyState !== 1) return
        if (await authorize(connection)) sendEvent(connection.socket, event)
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
    if (!options.fanout || closingFanout) return
    void track(options.fanout.publish({
      origin: instanceId,
      target,
      event
    })).catch((error) => {
      options.reportFanoutError?.(error)
    })
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

function sendEvent(socket: WebSocket, event: ServerEvent): void {
  if (socket.readyState !== 1) return
  socket.send(JSON.stringify(event))
}
