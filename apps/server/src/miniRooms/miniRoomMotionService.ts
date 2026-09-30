import { randomUUID } from "node:crypto"
import { miniRoomMoveSchema, type MiniRoomAvatarMotion, type MiniRoomMove, type ServerEvent } from "@blumi/contracts"
import { MINI_ROOM_FLOOR, pointInRoomWorldPolygon } from "@blumi/domain"
import type { MiniRoomRecord } from "./miniRoomRepository"

interface MotionRoom {
  participantUserIds: [string, string]
  avatars: Map<string, MiniRoomAvatarMotion>
  connections: Map<string, { userId: string; sequence: number }>
  checkedAt: number
  idleSince?: number
}

const ROOM_CHECK_TTL_MS = 10_000
const IDLE_ROOM_RETENTION_MS = 60_000
const MAX_IDLE_ROOMS = 128

/** Ephemeral scene state, never persisted room ownership or durable chat. */
export function createMiniRoomMotionService(options: {
  findRoom(id: string): Promise<MiniRoomRecord | null>
  hasBlockBetween(a: string, b: string): Promise<boolean>
  /**
   * Delivers to the given sockets on this process only. Motion is process-local
   * state: publishing it cross-instance would cost a database NOTIFY per step.
   */
  emit(connectionIds: string[], event: ServerEvent): void
  now?: () => number
}) {
  const rooms = new Map<string, MotionRoom>()
  const validations = new Map<string, Promise<MotionRoom>>()
  const epoch = randomUUID()
  const now = options.now ?? Date.now
  const emitToRoom = (room: MotionRoom, event: ServerEvent) => {
    if (room.connections.size) options.emit([...room.connections.keys()], event)
  }
  const emitSnapshot = (id: string, room: MotionRoom) => emitToRoom(room, {
    type: "mini_room.motion_snapshot", payload: { miniRoomId: id, epoch,
      participantUserIds: room.participantUserIds, avatars: [...room.avatars.values()].map(a => ({ ...a })) }
  })
  async function authorize(id: string, userId: string, force = false) {
    let room = rooms.get(id)
    if (!room || force || now() - room.checkedAt >= ROOM_CHECK_TTL_MS) {
      let validation = validations.get(id)
      if (!validation) {
        // Shared by concurrent callers, so it checks only the room itself; each
        // caller's membership is checked below against the shared result.
        validation = (async () => {
          const stored = await options.findRoom(id)
          if (!stored || stored.endedAt || await options.hasBlockBetween(...stored.participantUserIds)) {
            rooms.delete(id)
            throw new Error("That room is not available.")
          }
          if (validations.get(id) !== validation) throw new Error("That room is not available.")
          const current = rooms.get(id) ?? {
            participantUserIds: stored.participantUserIds, checkedAt: now(), connections: new Map(),
            // Until a socket enters, the room is idle and may be evicted.
            idleSince: now(),
            avatars: new Map(stored.participantUserIds.map((id, index) => [id, {
              userId: id, x: index === 0 ? .38 : .62, y: .76, present: false, revision: 0
            }]))
          }
          current.checkedAt = now()
          rooms.set(id, current)
          return current
        })()
        validations.set(id, validation)
      }
      try { room = await validation }
      finally { if (validations.get(id) === validation) validations.delete(id) }
    }
    if (!room.participantUserIds.includes(userId)) throw new Error("That room is not available.")
    return room
  }
  function disconnect(connectionId: string, onlyRoomId?: string, exceptRoomId?: string) {
    for (const [id, room] of rooms) {
      if (onlyRoomId && id !== onlyRoomId) continue
      if (exceptRoomId && id === exceptRoomId) continue
      const connection = room.connections.get(connectionId)
      if (!connection) continue
      room.connections.delete(connectionId)
      const avatar = room.avatars.get(connection.userId)!
      avatar.present = [...room.connections.values()].some(c => c.userId === connection.userId)
      avatar.revision++
      emitSnapshot(id, room)
      if (!room.connections.size) room.idleSince = now()
    }
  }
  function evictIdleRooms() {
    const idle = [...rooms.entries()].filter(([, room]) => room.idleSince !== undefined)
      .sort((a, b) => a[1].idleSince! - b[1].idleSince!)
    let idleCount = idle.length
    for (const [key, room] of idle) {
      if (now() - room.idleSince! >= IDLE_ROOM_RETENTION_MS || idleCount > MAX_IDLE_ROOMS) {
        rooms.delete(key); idleCount--
      }
    }
  }
  return {
    invalidate(id: string) { rooms.delete(id); validations.delete(id) },
    disconnect(connectionId: string, onlyRoomId?: string) { disconnect(connectionId, onlyRoomId) },
    async enter(connectionId: string, userId: string, id: string) {
      if (typeof id !== "string" || !id || id.length > 128) return
      evictIdleRooms()
      const room = await authorize(id, userId, true)
      if (rooms.get(id) !== room) throw new Error("That room is not available.")
      // One scene per socket. A repeated entry for the same room (a client retry)
      // keeps the avatar present instead of flashing it absent to the partner.
      disconnect(connectionId, undefined, id)
      const avatar = room.avatars.get(userId)!
      const wasPresent = avatar.present
      room.connections.set(connectionId, { userId, sequence: 0 })
      room.idleSince = undefined
      if (!wasPresent) {
        avatar.present = true
        avatar.revision++
      }
      emitSnapshot(id, room)
    },
    async move(connectionId: string, userId: string, input: MiniRoomMove) {
      const parsed = miniRoomMoveSchema.safeParse(input)
      if (!parsed.success) return
      const move = parsed.data
      // A walk target must be on the shared floor. A seat target may overhang it
      // (the seat sits on furniture); receivers resolve the seat from hotspotId.
      if (!move.hotspotId && !pointInRoomWorldPolygon(move, MINI_ROOM_FLOOR)) return
      const entered = rooms.get(move.miniRoomId)?.connections.get(connectionId)
      if (!entered || entered.userId !== userId) return
      const room = await authorize(move.miniRoomId, userId)
      if (rooms.get(move.miniRoomId) !== room) return
      const connection = room.connections.get(connectionId)
      if (!connection || connection.userId !== userId || move.sequence <= connection.sequence) return
      connection.sequence = move.sequence
      const previous = room.avatars.get(userId)!
      const avatar: MiniRoomAvatarMotion = { userId, x: move.x, y: move.y,
        present: true, revision: previous.revision + 1,
        ...(move.hotspotId ? { hotspotId: move.hotspotId } : {}) }
      room.avatars.set(userId, avatar)
      emitToRoom(room, { type: "mini_room.avatar_moved", payload: {
        miniRoomId: move.miniRoomId, epoch, participantUserIds: room.participantUserIds, avatar
      } })
    }
  }
}
