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

const REVALIDATE_AFTER_MS = 10_000
const MAX_STALE_MS = 60_000

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
  function validate(id: string, userId: string): Promise<MotionRoom> {
    let validation = validations.get(id)
    if (!validation) {
      // Read only after the first await, by which time it is assigned.
      let current: Promise<MotionRoom> | undefined = undefined
      current = (async (): Promise<MotionRoom> => {
        const stored = await options.findRoom(id)
        if (!stored || stored.endedAt || await options.hasBlockBetween(...stored.participantUserIds)) {
          rooms.delete(id)
          throw new Error("That room is not available.")
        }
        if (!stored.participantUserIds.includes(userId) || validations.get(id) !== current) {
          throw new Error("That room is not available.")
        }
        const room = rooms.get(id) ?? {
          participantUserIds: stored.participantUserIds, checkedAt: now(), connections: new Map(),
          avatars: new Map(stored.participantUserIds.map((id, index) => [id, {
            userId: id, x: index === 0 ? .38 : .62, y: .76, present: false, revision: 0
          }]))
        }
        room.checkedAt = now()
        rooms.set(id, room)
        return room
      })()
      validation = current
      validations.set(id, current)
      const clear = () => { if (validations.get(id) === current) validations.delete(id) }
      void current.then(clear, clear)
    }
    return validation
  }
  /**
   * Room access for scene entry and moves. Ending a room or separating the
   * pair invalidates it at once (`invalidate`). Otherwise a decision is
   * re-checked every REVALIDATE_AFTER_MS in the background while moves keep
   * flowing on it (2026-10-01: the check used to hold the move that found it
   * due, so a busy database delayed movement), and is never trusted for
   * longer than MAX_STALE_MS without a check succeeding.
   */
  async function authorize(id: string, userId: string, force = false) {
    let room = rooms.get(id)
    const age = room ? now() - room.checkedAt : Number.POSITIVE_INFINITY
    if (!room || force || age >= MAX_STALE_MS) {
      room = await validate(id, userId)
    } else if (age >= REVALIDATE_AFTER_MS) {
      void validate(id, userId).catch(() => {
        // An unavailable room was removed by the check; a failed check is retried.
      })
    }
    if (!room.participantUserIds.includes(userId)) throw new Error("That room is not available.")
    return room
  }
  /**
   * Occupied rooms are also re-checked on a timer (2026-10-01): when both
   * avatars stood still past MAX_STALE_MS, the next move used to wait for a
   * forced check, seconds when the pool was busy. Empty rooms cost nothing.
   */
  let keepWarm: ReturnType<typeof setInterval> | undefined
  function syncKeepWarm() {
    const occupied = [...rooms.values()].some(room => room.connections.size > 0)
    if (occupied && !keepWarm) {
      keepWarm = setInterval(revalidateOccupiedRooms, REVALIDATE_AFTER_MS / 2)
      keepWarm.unref?.()
    } else if (!occupied && keepWarm) {
      clearInterval(keepWarm)
      keepWarm = undefined
    }
  }
  function revalidateOccupiedRooms() {
    for (const [id, room] of rooms) {
      const connection = room.connections.values().next().value
      if (!connection || now() - room.checkedAt < REVALIDATE_AFTER_MS) continue
      void validate(id, connection.userId).catch(() => {
        // An unavailable room was removed by the check; a failed check is retried.
      })
    }
    syncKeepWarm()
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
    syncKeepWarm()
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
      syncKeepWarm()
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
