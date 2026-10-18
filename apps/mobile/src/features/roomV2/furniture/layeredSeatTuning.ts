import type { LayeredFurnitureRotation, LayeredFurnitureSeat, LayeredRotationIndex } from "./layeredFurniture"
import { projectWorldOffsetToSpritePx, type LayeredItemCamera } from "./layeredEdgeSeats"

/**
 * Per-item fixes for where the seated drawing sits on a piece whose `item.json` seats look wrong in the room
 * (owner, 2026-10-18: "iç içe geçme", "koltukta havada kalıyor"). Offsets are world units in the seat's own frame,
 * so one entry holds in all four rotations:
 * - `along`: sideways along the edge she sits on (+ is her left as she sits), the cushion's
 *   front edge moving with her;
 * - `back`: toward the backrest, the cushion's front edge staying where it is drawn;
 * - `sink`: down into a soft cushion (the hip's height drops by it).
 * The hip's sprite px follow from the item's own camera, and an `along` move takes her approach and exit cells with
 * her. Seat ids never change.
 */
export interface LayeredSeatTuning {
  along?: number
  back?: number
  sink?: number
}

export const LAYERED_SEAT_TUNING: Readonly<Record<string, Readonly<Record<string, LayeredSeatTuning>>>> = {
  // the plump blush armchair: she sat on top of the cushion, clear of the backrest, so she looked to hover
  room_v2_chair_blush: { s0: { back: 0.06, sink: 0.06 } },
  // the starter bed's foot posts stand tall: the seat by the foot end put her hip and hands into the post. Both
  // seats move toward the middle of the edge, still a body's width apart.
  room_v3_bed_blumi_starter: { s0: { along: -0.3 }, s1: { along: -0.33 } }
}

const ROTATIONS: readonly LayeredRotationIndex[] = [0, 1, 2, 3]

/** The rotations with the item's tuned seats (unchanged when it has no tuning). */
export function withTunedSeats(
  rotations: Readonly<Record<LayeredRotationIndex, LayeredFurnitureRotation>>,
  tuning: Readonly<Record<string, LayeredSeatTuning>> | undefined,
  camera: LayeredItemCamera,
  cell: number
): Record<LayeredRotationIndex, LayeredFurnitureRotation> {
  const result = {} as Record<LayeredRotationIndex, LayeredFurnitureRotation>
  for (const r of ROTATIONS) {
    const rotation = rotations[r]
    result[r] = tuning
      ? {
          ...rotation,
          seats: rotation.seats.map((seat) => {
            const seatTuning = tuning[seat.id]
            return seatTuning ? tuneSeat(seat, seatTuning, rotation.footprintCells, camera, cell) : seat
          })
        }
      : rotation
  }
  return result
}

function tuneSeat(
  seat: LayeredFurnitureSeat,
  tuning: LayeredSeatTuning,
  footprintCells: readonly [number, number],
  camera: LayeredItemCamera,
  cell: number
): LayeredFurnitureSeat {
  const along = tuning.along ?? 0
  const back = tuning.back ?? 0
  const sink = tuning.sink ?? 0
  const yaw = (seat.facingYawDeg * Math.PI) / 180
  const facing = { x: Math.sin(yaw), z: Math.cos(yaw) }
  const side = { x: Math.cos(yaw), z: -Math.sin(yaw) }
  const edgeShift: [number, number, number] = [along * side.x, 0, along * side.z]
  const hipShift: [number, number, number] = [edgeShift[0] - back * facing.x, -sink, edgeShift[2] - back * facing.z]
  const [hipDx, hipDy] = projectWorldOffsetToSpritePx(hipShift, camera)
  const [edgeDx, edgeDy] = projectWorldOffsetToSpritePx(edgeShift, camera)
  const [x, y, z] = seat.hipWorld
  const hipWorld: [number, number, number] = [round4(x + hipShift[0]), round4(y + hipShift[1]), round4(z + hipShift[2])]
  const cells = along !== 0 ? alongEdgeCells(seat, hipWorld, side, footprintCells, cell) : undefined
  return {
    ...seat,
    hipWorld,
    hipPx: [round2(seat.hipPx[0] + hipDx), round2(seat.hipPx[1] + hipDy)],
    seatHeight: round4(seat.seatHeight - sink),
    frontEdgePx: [round2(seat.frontEdgePx[0] + edgeDx), round2(seat.frontEdgePx[1] + edgeDy)],
    ...(cells ?? {}),
    ...(seat.cardClipBelowPx !== undefined ? { cardClipBelowPx: round2(seat.cardClipBelowPx + hipDy) } : {})
  }
}

/** The approach and exit cells moved along the edge to the cell under her new hip (the other axis kept). */
function alongEdgeCells(
  seat: LayeredFurnitureSeat,
  hipWorld: readonly [number, number, number],
  side: { x: number; z: number },
  footprintCells: readonly [number, number],
  cell: number
): Pick<LayeredFurnitureSeat, "approachCell" | "exitCell"> {
  const axis = Math.abs(side.x) > Math.abs(side.z) ? 0 : 1
  const coordinate = axis === 0 ? hipWorld[0] : hipWorld[2]
  const count = footprintCells[axis]
  const index = Math.min(count - 1, Math.max(0, Math.floor((coordinate + (count * cell) / 2) / cell)))
  const moved = (from: [number, number]): [number, number] => axis === 0 ? [index, from[1]] : [from[0], index]
  return { approachCell: moved(seat.approachCell), exitCell: moved(seat.exitCell) }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4 + 0
}
