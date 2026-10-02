import { randomUUID } from "node:crypto"
import { miniRoomMoveSchema, type MiniRoomAvatarMotion, type MiniRoomMove, type ServerEvent } from "@blumi/contracts"
import { getMiniRoomFloorDistance, isPointOnMiniRoomFloor } from "@blumi/domain"
import type { MiniRoomRecord } from "./miniRoomRepository"

/**
 * The device behind a socket: its sign-in session (one per app install) and
 * the order in which the server accepted the socket. Two sockets of one
 * session are one phone reconnecting; different sessions are different devices.
 */
export interface MiniRoomSceneDevice {
  key: string
  order: number
}

interface MotionConnection {
  userId: string
  sequence: number
  device?: MiniRoomSceneDevice
}

interface MotionRoom {
  participantUserIds: [string, string]
  avatars: Map<string, MiniRoomAvatarMotion>
  connections: Map<string, MotionConnection>
  checkedAt: number
  /** Set when an accept or join just verified the room (active, unblocked). */
  verifiedAt?: number
  idleSince?: number
}

/**
 * How far a seat target may lie outside the shared floor (room units). A seat
 * sits on furniture and may overhang the floor edge (a chair at the front
 * edge seats at y≈0.93 against a floor edge of 0.9), but never far from it.
 * The server has no layout of the room's furniture, so this bounds a seat
 * claim to the floor's neighbourhood instead of trusting any point in the
 * unit square (2026-10-02: a modified client could stand on a wall).
 */
export const MINI_ROOM_SEAT_FLOOR_TOLERANCE = 0.12

function isSeatTargetNearFloor(point: { x: number; y: number }): boolean {
  return getMiniRoomFloorDistance(point) <= MINI_ROOM_SEAT_FLOOR_TOLERANCE
}

/**
 * Background re-check age of an occupied room's access (room row plus block
 * check). 30 s since 2026-10-02 (was 10 s, ~100 queries/s at 500 rooms):
 * ending a room or blocking the pair invalidates it at once anyway.
 */
export const MINI_ROOM_MOTION_REVALIDATE_AFTER_MS = 30_000
const REVALIDATE_AFTER_MS = MINI_ROOM_MOTION_REVALIDATE_AFTER_MS
const MAX_STALE_MS = 60_000
const IDLE_ROOM_RETENTION_MS = 60_000
const MAX_IDLE_ROOMS = 128
/**
 * A socket that shed an avatar step under backpressure is re-sent the room
 * snapshot after this delay (one per socket however many steps it shed), so
 * the buffer can drain first and a partner who stopped walking is not left
 * frozen at an older target until the next enter or exit.
 */
export const MINI_ROOM_MOTION_RESYNC_DELAY_MS = 250

/**
 * Ephemeral scene state, never persisted room ownership or durable chat.
 * Seat claims live here too: a participant holds the hotspot of its latest
 * accepted move while present; standing, leaving the scene, losing the socket
 * or the room ending releases it. No database write is involved.
 */
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
  const snapshotEvent = (id: string, room: MotionRoom): ServerEvent => ({
    type: "mini_room.motion_snapshot", payload: { miniRoomId: id, epoch,
      participantUserIds: room.participantUserIds, avatars: [...room.avatars.values()].map(a => ({ ...a })) }
  })
  const emitSnapshot = (id: string, room: MotionRoom) => emitToRoom(room, snapshotEvent(id, room))
  const pendingResyncs = new Set<string>()
  /**
   * The entry each socket is waiting to complete. A scene exit, a closed
   * socket or a newer entry on the same socket cancels it, so an entry that
   * finishes its access check late can never put back an avatar that left.
   */
  const pendingEntries = new Map<string, { roomId: string; token: number }>()
  let entryToken = 0
  function createMotionRoom(stored: MiniRoomRecord): MotionRoom {
    return {
      participantUserIds: stored.participantUserIds, checkedAt: now(), connections: new Map(),
      // Until a socket enters, the room is idle and may be evicted.
      idleSince: now(),
      avatars: new Map(stored.participantUserIds.map((id, index) => [id, {
        userId: id, x: index === 0 ? .38 : .62, y: .76, present: false, revision: 0
      }]))
    }
  }
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
        const room = rooms.get(id) ?? createMotionRoom(stored)
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
      const present = [...room.connections.values()].some(c => c.userId === connection.userId)
      // An absent participant holds no seat: the partner may take it meanwhile.
      const { hotspotId: _released, ...rest } = avatar
      room.avatars.set(connection.userId, { ...(present ? avatar : rest), present, revision: avatar.revision + 1 })
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
    /**
     * Prefetch: an accept or join has just verified this room, so the first
     * scene entries of both phones reuse that verification instead of two
     * more database reads. Ending or blocking invalidates it as before.
     */
    prime(stored: MiniRoomRecord) {
      if (stored.endedAt) return
      evictIdleRooms()
      const room = rooms.get(stored.miniRoomId) ?? createMotionRoom(stored)
      room.checkedAt = now()
      room.verifiedAt = now()
      rooms.set(stored.miniRoomId, room)
    },
    /** A scene exit (one room) or a closed socket (every room). */
    disconnect(connectionId: string, onlyRoomId?: string) {
      const pending = pendingEntries.get(connectionId)
      if (pending && (!onlyRoomId || pending.roomId === onlyRoomId)) pendingEntries.delete(connectionId)
      disconnect(connectionId, onlyRoomId)
    },
    /**
     * The connection manager shed an avatar_moved for this socket. Re-send it
     * the current snapshot, once, after a short delay. State and revisions are
     * untouched, so latest-wins and seat claims hold; a socket that left the
     * scene or was superseded meanwhile gets nothing. Local delivery only.
     */
    resyncAfterDrop(connectionId: string, id: string) {
      const key = `${id}\u0000${connectionId}`
      if (pendingResyncs.has(key) || !rooms.get(id)?.connections.has(connectionId)) return
      pendingResyncs.add(key)
      const timer = setTimeout(() => {
        pendingResyncs.delete(key)
        const room = rooms.get(id)
        if (room?.connections.has(connectionId)) options.emit([connectionId], snapshotEvent(id, room))
      }, MINI_ROOM_MOTION_RESYNC_DELAY_MS)
      timer.unref?.()
    },
    async enter(connectionId: string, userId: string, id: string, device?: MiniRoomSceneDevice) {
      if (typeof id !== "string" || !id || id.length > 128) return
      evictIdleRooms()
      const token = ++entryToken
      pendingEntries.set(connectionId, { roomId: id, token })
      const verifiedAt = rooms.get(id)?.verifiedAt
      const verified = verifiedAt !== undefined && now() - verifiedAt < REVALIDATE_AFTER_MS
      let room: MotionRoom
      let current: boolean
      try {
        room = await authorize(id, userId, !verified)
      } finally {
        current = pendingEntries.get(connectionId)?.token === token
        if (current) pendingEntries.delete(connectionId)
      }
      if (rooms.get(id) !== room) throw new Error("That room is not available.")
      // The socket left this scene, closed, or entered again while the check ran.
      if (!current) return
      const others = [...room.connections.entries()]
        .filter(([otherId, other]) => otherId !== connectionId && other.userId === userId)
      const samePhone = (other: MotionConnection) =>
        device !== undefined && other.device !== undefined && other.device.key === device.key
      // One phone reconnecting: the socket it opened last drives the avatar,
      // whatever order the entries' checks finished in (2026-10-01: a late
      // entry from the abandoned socket told the live one "continued on
      // another device" and closed the room screen).
      if (others.some(([, other]) => samePhone(other) && other.device!.order > device!.order)) return
      // One scene per socket. A repeated entry for the same room (a client retry)
      // keeps the avatar present instead of flashing it absent to the partner.
      disconnect(connectionId, undefined, id)
      // One device drives an avatar: the newest scene entry of another device
      // of the account takes over, and that device is told so it can leave
      // without ending the room. This phone's own older socket is dropped
      // silently. Presence stays on, so the partner sees no flicker.
      for (const [otherId] of others) room.connections.delete(otherId)
      const superseded = others.filter(([, other]) => !samePhone(other)).map(([otherId]) => otherId)
      const avatar = room.avatars.get(userId)!
      room.connections.set(connectionId, { userId, sequence: 0, ...(device ? { device } : {}) })
      room.idleSince = undefined
      syncKeepWarm()
      if (!avatar.present) room.avatars.set(userId, { ...avatar, present: true, revision: avatar.revision + 1 })
      if (superseded.length) options.emit(superseded, { type: "mini_room.scene_superseded", payload: { miniRoomId: id } })
      emitSnapshot(id, room)
    },
    async move(connectionId: string, userId: string, input: MiniRoomMove) {
      const parsed = miniRoomMoveSchema.safeParse(input)
      if (!parsed.success) return
      const move = parsed.data
      // A walk target must be on the shared floor: the drawn floor clients walk
      // (the same measured outline, @blumi/domain) or the legacy polygon older
      // clients still walk. A seat target may overhang it
      // (the seat sits on furniture), within MINI_ROOM_SEAT_FLOOR_TOLERANCE;
      // receivers resolve the seat from hotspotId.
      if (move.hotspotId ? !isSeatTargetNearFloor(move) : !isPointOnMiniRoomFloor(move)) return
      const entered = rooms.get(move.miniRoomId)?.connections.get(connectionId)
      if (!entered || entered.userId !== userId) return
      const room = await authorize(move.miniRoomId, userId)
      if (rooms.get(move.miniRoomId) !== room) return
      const connection = room.connections.get(connectionId)
      if (!connection || connection.userId !== userId || move.sequence <= connection.sequence) return
      connection.sequence = move.sequence
      const previous = room.avatars.get(userId)!
      // Seats are exclusive. Claims are decided here, synchronously, in the
      // order moves reach the room's state; the later claim is refused and
      // both phones receive the same answer.
      const heldByPartner = Boolean(move.hotspotId) && [...room.avatars.values()].some(other =>
        other.userId !== userId && other.present && other.hotspotId === move.hotspotId)
      const avatar: MiniRoomAvatarMotion = { userId, x: move.x, y: move.y,
        present: true, revision: previous.revision + 1,
        ...(move.hotspotId ? heldByPartner ? { deniedHotspotId: move.hotspotId } : { hotspotId: move.hotspotId } : {}) }
      room.avatars.set(userId, avatar)
      emitToRoom(room, { type: "mini_room.avatar_moved", payload: {
        miniRoomId: move.miniRoomId, epoch, participantUserIds: room.participantUserIds, avatar
      } })
    }
  }
}
