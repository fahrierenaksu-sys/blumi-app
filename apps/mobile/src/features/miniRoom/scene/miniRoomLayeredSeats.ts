import type {
  ResolvedRoomV2Scene,
  RoomV2FurnitureRenderItem,
  RoomV2LayeredSeatArt
} from "../../roomV2/roomV2.types"
import type { RoomWorldOccupant } from "../../roomWorld/roomWorldRuntime"
import type { AvatarState, RoomPoint } from "./miniRoomSceneTypes"
import { resolveSeatApproach } from "../../roomWorld/seatApproach"

/**
 * MiniRoom on furniture drawn from room-camera layers (2.5D room calibration only; no layered piece
 * exists in any other bundle, so everything here is empty there and the room behaves as shipped).
 *
 * The rules are My Room's:
 * - she walks only to the seat's approach spot; the 2.5D body then draws her from there onto the seat (her
 *   committed position stays on that spot while she sits);
 * - she is drawn between the piece's back and front layers, the front layer cut at her own seat's cushion edge;
 * - several sitters on one piece draw far to near (each seat's `drawRank`).
 *
 * Seats stay exclusive per seat: the server decides claims by hotspot id (`<renderId>:<seatId>`), so two people
 * can hold the two seats of one sofa with no protocol change.
 */
export interface MiniRoomLayeredSeat {
  /** The shared hotspot id, `<renderId>:<seatId>`, exactly as the room world projection names it. */
  hotspotId: string
  piece: RoomV2FurnitureRenderItem
  art: RoomV2LayeredSeatArt
  /** The floor point under her hip (stage fractions). */
  seat: RoomPoint
  /** Where she stands while she sits down and gets up (her committed position while seated). */
  approach: RoomPoint
  /** The hip's height above `seat` (stage-height share). */
  seatHeight: number
  /** Far-to-near place among the piece's sitters (0 = drawn first). */
  drawRank: number
}

export type MiniRoomLayeredSeats = Readonly<Record<string, MiniRoomLayeredSeat>>

export const NO_MINI_ROOM_LAYERED_SEATS: MiniRoomLayeredSeats = Object.freeze({})

/**
 * Someone seated on a layered piece is on the piece, whose footprint already blocks walking. Her committed spot (the
 * approach, in front of her knees) keeps only this much personal space (stage fractions), so the seat next to hers
 * stays reachable: the sofa's two approach spots are 0.066 apart, inside the 0.058 + 0.058 two standing avatars keep.
 */
export const MINI_ROOM_LAYERED_SITTER_RADIUS = 0.022

/** Every seat of every layered piece in the scene, by hotspot id. */
export function createMiniRoomLayeredSeats(scene: ResolvedRoomV2Scene | undefined): MiniRoomLayeredSeats {
  if (!scene?.shell) return NO_MINI_ROOM_LAYERED_SEATS
  const seats: Record<string, MiniRoomLayeredSeat> = {}
  for (const item of scene.renderItems) {
    if (item.kind !== "furniture" || !item.layered25d || item.interactionType !== "seat") continue
    for (const point of item.seatWorldPoints ?? []) {
      const art = item.layered25d.seats.find((candidate) => candidate.id === point.id)
      if (!art) continue
      const hotspotId = `${item.renderId}:${point.id}`
      seats[hotspotId] = {
        hotspotId,
        piece: item,
        art,
        seat: { x: point.seat.x, y: point.seat.y },
        approach: resolveSeatApproach(point, item.renderId, scene).approach,
        seatHeight: point.seatHeight,
        drawRank: point.drawRank ?? 0
      }
    }
  }
  return Object.keys(seats).length ? seats : NO_MINI_ROOM_LAYERED_SEATS
}

/** The layered seat this avatar sits on right now (seated, drawn sitting), if any. */
export function getMiniRoomAvatarLayeredSeat(
  avatar: Pick<AvatarState, "seatedHotspotId" | "motion">,
  seats: MiniRoomLayeredSeats
): MiniRoomLayeredSeat | undefined {
  if (!avatar.seatedHotspotId || avatar.motion !== "sitting") return undefined
  return seats[avatar.seatedHotspotId]
}

/** The layered seat whose approach spot this point is (a walk heading there), if any. */
function findLayeredSeatByApproach(point: RoomPoint, seats: MiniRoomLayeredSeats): MiniRoomLayeredSeat | undefined {
  for (const seat of Object.values(seats)) {
    if (Math.abs(seat.approach.x - point.x) < 1e-9 && Math.abs(seat.approach.y - point.y) < 1e-9) return seat
  }
  return undefined
}

/**
 * The other avatars as the walk planner sees them: where each stands or is heading. A sitter on a layered piece,
 * or someone walking to sit on one, keeps only `MINI_ROOM_LAYERED_SITTER_RADIUS` around her approach spot; everyone
 * else keeps the planner's usual personal space.
 */
export function createMiniRoomOccupants(
  avatars: Readonly<Record<string, AvatarState>>,
  seats: MiniRoomLayeredSeats = NO_MINI_ROOM_LAYERED_SEATS
): RoomWorldOccupant[] {
  return Object.values(avatars).filter((avatar) => avatar.present !== false).map((avatar) => {
    const point = { x: avatar.targetX ?? avatar.x, y: avatar.targetY ?? avatar.y }
    const seated = avatar.targetX === undefined && avatar.seatedHotspotId ? seats[avatar.seatedHotspotId] : undefined
    const walksToSit = avatar.targetX !== undefined && Boolean(findLayeredSeatByApproach(point, seats))
    const sitsOnLayered = Boolean(seated) || walksToSit
    return {
      id: avatar.userId,
      ...point,
      blocksMovement: true,
      ...(sitsOnLayered ? { radius: MINI_ROOM_LAYERED_SITTER_RADIUS } : {})
    }
  })
}

/**
 * A layered seat is taken when another avatar who is here sits on it or is walking to sit on it. Distance does not
 * decide it: the two seats of one sofa are closer together than two standing avatars may be.
 */
export function isMiniRoomLayeredSeatTaken(
  seat: MiniRoomLayeredSeat,
  avatars: Readonly<Record<string, AvatarState>>,
  movingUserId: string
): boolean {
  return Object.values(avatars).some((avatar) => {
    if (avatar.userId === movingUserId || avatar.present === false) return false
    if (avatar.seatedHotspotId === seat.hotspotId) return true
    return avatar.targetX !== undefined && avatar.targetY !== undefined &&
      Math.abs(avatar.targetX - seat.approach.x) < 1e-9 && Math.abs(avatar.targetY - seat.approach.y) < 1e-9
  })
}

/**
 * Of the seats a tap could mean (nearest first), the first one no one else holds; the nearest when all are held
 * (the caller then says it is taken). Seats are held by `seatedHotspotId`, as the server decided.
 */
export function chooseMiniRoomSeatFromTap(
  candidateIds: readonly string[],
  avatars: Readonly<Record<string, AvatarState>>,
  localUserId: string
): string | undefined {
  const heldByOthers = new Set(Object.values(avatars)
    .filter((avatar) => avatar.userId !== localUserId && avatar.present !== false && avatar.seatedHotspotId)
    .map((avatar) => avatar.seatedHotspotId!))
  return candidateIds.find((id) => !heldByOthers.has(id)) ?? candidateIds[0]
}

/** Each layered seat's tap pad (stage fractions) is centred on her hip, where she is drawn seated. */
export const MINI_ROOM_LAYERED_SEAT_PAD = { width: 0.09, height: 0.1 } as const

/** The hip point of a layered seat: `seatHeight` straight above the seat point. */
export function getMiniRoomLayeredSeatHip(seat: Pick<MiniRoomLayeredSeat, "seat" | "seatHeight">): RoomPoint {
  return { x: seat.seat.x, y: seat.seat.y - seat.seatHeight }
}

/**
 * The 2.5D body's seated placement in MiniRoom (px). MiniRoom never drops the box for sitting (`outerPx` 0); a
 * layered seat names her drawing, her hip height and her committed spot relative to the seat point, which the body
 * draws her across while she sits down and gets up. Any other seat keeps the body's own legacy offsets.
 */
export function resolveMiniRoomAvatar25dSeatPlacement(input: {
  avatar: Pick<AvatarState, "x" | "y">
  seat: MiniRoomLayeredSeat | undefined
  stageWidthPx: number
  stageHeightPx: number
}) {
  const { avatar, seat, stageWidthPx, stageHeightPx } = input
  if (!seat) return { outerPx: 0, seatPx: 0 }
  return {
    outerPx: 0,
    seatPx: seat.seatHeight * stageHeightPx,
    approachPx: { dx: (avatar.x - seat.seat.x) * stageWidthPx, dy: (avatar.y - seat.seat.y) * stageHeightPx },
    hip: {
      view: seat.art.view,
      mirror: seat.art.mirror,
      ...(seat.art.avatarClipBelowHip !== undefined
        ? { clipBelowHipPx: seat.art.avatarClipBelowHip * stageHeightPx }
        : {}),
      ...(seat.art.soleDropBelowHip !== undefined
        ? { soleDropPx: seat.art.soleDropBelowHip * stageHeightPx }
        : {})
    }
  }
}

export interface MiniRoomFigureZIndices {
  avatars: Readonly<Record<string, number>>
  /** By occluder index (back to front). */
  occluders: readonly number[]
  /** A seated avatar's front layer, by avatar id: right above her, below whatever is drawn next. */
  fronts: Readonly<Record<string, number>>
}

/**
 * The depth model's z-indices with room for one front layer right above each layered sitter: every index doubles
 * (the order is unchanged) and a sitter's front layer takes the odd index after hers. Two sitters on one sofa come
 * out far sitter, her front layer, near sitter, his front layer.
 */
export function resolveMiniRoomFigureZIndices(
  base: { avatars: Readonly<Record<string, number>>; occluders: readonly number[] },
  layeredSitterIds: readonly string[]
): MiniRoomFigureZIndices {
  const avatars: Record<string, number> = {}
  for (const [id, z] of Object.entries(base.avatars)) avatars[id] = z * 2
  const fronts: Record<string, number> = {}
  for (const id of layeredSitterIds) {
    const z = avatars[id]
    if (z !== undefined) fronts[id] = z + 1
  }
  return { avatars, occluders: base.occluders.map((z) => z * 2), fronts }
}
