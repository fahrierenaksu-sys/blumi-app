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
  function validate(id: string): Promise<MotionRoom> {
    let validation = validations.get(id)
    if (!validation) {
      // Shared by concurrent callers, so it checks only the room itself; each
      // caller's membership is checked in authorize against the shared result.
      // Read only after the first await, by which time it is assigned.
      let current: Promise<MotionRoom> | undefined = undefined
      current = (async (): Promise<MotionRoom> => {
        const stored = await options.findRoom(id)
        if (!stored || stored.endedAt || await options.hasBlockBetween(...stored.participantUserIds)) {
          rooms.delete(id)
          throw new Error("That room is not available.")
        }
        if (validations.get(id) !== current) throw new Error("That room is not available.")
        const room = rooms.get(id) ?? {
          participantUserIds: stored.participantUserIds, checkedAt: now(), connections: new Map(),
          // Until a socket enters, the room is idle and may be evicted.
          idleSince: now(),
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
      room = await validate(id)
    } else if (age >= REVALIDATE_AFTER_MS) {
      void validate(id).catch(() => {
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
      if (!room.connections.size || now() - room.checkedAt < REVALIDATE_AFTER_MS) continue
      void validate(id).catch(() => {
        // An unavailable room was removed by the check; a failed check is retried.
      })
    }
    syncKeepWarm()
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
    syncKeepWarm()
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
      syncKeepWarm()
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
