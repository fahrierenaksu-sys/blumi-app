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

/** Ephemeral scene state, never persisted room ownership or durable chat. */
export function createMiniRoomMotionService(options: {
  findRoom(id: string): Promise<MiniRoomRecord | null>
  hasBlockBetween(a: string, b: string): Promise<boolean>
  emit(users: string[], event: ServerEvent): void
  now?: () => number
}) {
  const rooms = new Map<string, MotionRoom>()
  const validations = new Map<string, Promise<MotionRoom>>()
  const epoch = randomUUID()
  const now = options.now ?? Date.now
  const emitSnapshot = (id: string, room: MotionRoom) => options.emit(room.participantUserIds, {
    type: "mini_room.motion_snapshot", payload: { miniRoomId: id, epoch,
      participantUserIds: room.participantUserIds, avatars: [...room.avatars.values()].map(a => ({ ...a })) }
  })
  async function authorize(id: string, userId: string, force = false) {
    let room = rooms.get(id)
    if (!room || force || now() - room.checkedAt >= 10_000) {
      let validation = validations.get(id)
      if (!validation) {
        validation = (async () => {
          const stored = await options.findRoom(id)
          if (!stored || stored.endedAt || await options.hasBlockBetween(...stored.participantUserIds)) {
            rooms.delete(id)
            throw new Error("That room is not available.")
          }
          if (!stored.participantUserIds.includes(userId) || validations.get(id) !== validation) {
            throw new Error("That room is not available.")
          }
          const current = rooms.get(id) ?? {
            participantUserIds: stored.participantUserIds, checkedAt: now(), connections: new Map(),
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
  function disconnect(connectionId: string, onlyRoomId?: string) {
    for (const [id, room] of rooms) {
      if (onlyRoomId && id !== onlyRoomId) continue
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
  return {
    invalidate(id: string) { rooms.delete(id); validations.delete(id) },
    disconnect,
    async enter(connectionId: string, userId: string, id: string) {
      if (typeof id !== "string" || !id || id.length > 128) return
      const idle = [...rooms.entries()].filter(([, room]) => room.idleSince !== undefined)
        .sort((a, b) => a[1].idleSince! - b[1].idleSince!)
      let idleCount = idle.length
      for (const [key, room] of idle) {
        if (now() - room.idleSince! >= 60_000 || idleCount > 128) {
          rooms.delete(key); idleCount--
        }
      }
      const room = await authorize(id, userId, true)
      if (rooms.get(id) !== room) throw new Error("That room is not available.")
      disconnect(connectionId, undefined)
      room.connections.set(connectionId, { userId, sequence: 0 })
      room.idleSince = undefined
      const avatar = room.avatars.get(userId)!
      avatar.present = true
      avatar.revision++
      emitSnapshot(id, room)
    },
    async move(connectionId: string, userId: string, input: MiniRoomMove) {
      const parsed = miniRoomMoveSchema.safeParse(input)
      if (!parsed.success || !pointInRoomWorldPolygon(parsed.data, MINI_ROOM_FLOOR)) return
      const room = await authorize(input.miniRoomId, userId)
      if (rooms.get(input.miniRoomId) !== room) return
      const connection = room.connections.get(connectionId)
      if (!connection || connection.userId !== userId || input.sequence <= connection.sequence) return
      connection.sequence = input.sequence
      const previous = room.avatars.get(userId)!
      const avatar: MiniRoomAvatarMotion = { userId, x: input.x, y: input.y,
        present: true, revision: previous.revision + 1,
        ...(input.hotspotId ? { hotspotId: input.hotspotId } : {}) }
      room.avatars.set(userId, avatar)
      options.emit(room.participantUserIds, { type: "mini_room.avatar_moved", payload: {
        miniRoomId: input.miniRoomId, epoch, participantUserIds: room.participantUserIds, avatar
      } })
    }
  }
}
