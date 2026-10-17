import type { LayeredFurnitureRotation, LayeredFurnitureSeat, LayeredRotationIndex } from "./layeredFurniture"

/**
 * A bed is sat on from its edge, and both long edges are the same edge (`item.json` `interactions` has
 * `sit_edge`). The Workbench export puts the seats on one long edge only, so in the two rotations where that edge
 * looks away from the camera she sat with her back to us, on the far edge against the wall (owner, 2026-10-17:
 * "ezbere oturuyor"). In those rotations the seats move to the other long edge, the one facing the camera.
 *
 * Everything comes from data already in `item.json`: the hip is mirrored across the bed's long axis, her view and
 * the cushion's front edge come from the opposite rotation's seat that faces the same way (the camera is fixed,
 * so the same facing draws the same), and the sprite px follow from the item's own camera projection. Seat ids
 * stay as they are.
 */

export interface LayeredItemCamera {
  yawDeg: number
  pitchDeg: number
  /** Sprite px per world unit (`item.json` `px_per_world_unit`). */
  pxPerWorldUnit: number
}

const ROTATIONS: readonly LayeredRotationIndex[] = [0, 1, 2, 3]

/** Whether a seat's facing (lab yaw) looks toward the room's fixed camera. */
export function seatFacesCamera(facingYawDeg: number, camera: Pick<LayeredItemCamera, "yawDeg">): boolean {
  const facing = radians(facingYawDeg)
  const toCamera = radians(camera.yawDeg)
  return Math.sin(facing) * Math.sin(toCamera) + Math.cos(facing) * Math.cos(toCamera) > 1e-6
}

/** Sprite px offset of a world-unit offset (x right/z toward the camera on the floor, y up), item camera. */
export function projectWorldOffsetToSpritePx(
  offset: readonly [number, number, number],
  camera: LayeredItemCamera
): [number, number] {
  const [x, y, z] = offset
  const yaw = radians(camera.yawDeg)
  const pitch = radians(camera.pitchDeg)
  return [
    (x * Math.cos(yaw) - z * Math.sin(yaw)) * camera.pxPerWorldUnit,
    ((x * Math.sin(yaw) + z * Math.cos(yaw)) * Math.sin(pitch) - y * Math.cos(pitch)) * camera.pxPerWorldUnit
  ]
}

/**
 * The rotations with every seat on the camera's side: a rotation whose seats all look away takes the mirrored
 * seats on the other long edge, when the opposite rotation has a seat facing that way to copy the view from.
 */
export function withCameraSideEdgeSeats(
  rotations: Readonly<Record<LayeredRotationIndex, LayeredFurnitureRotation>>,
  camera: LayeredItemCamera
): Record<LayeredRotationIndex, LayeredFurnitureRotation> {
  const result = {} as Record<LayeredRotationIndex, LayeredFurnitureRotation>
  for (const r of ROTATIONS) {
    const rotation = rotations[r]
    const opposite = rotations[((r + 2) % 4) as LayeredRotationIndex]
    const looksAway = rotation.seats.length > 0 && rotation.seats.every((seat) => !seatFacesCamera(seat.facingYawDeg, camera))
    const mirrored = looksAway
      ? rotation.seats.map((seat) => mirrorSeatToOtherEdge(seat, rotation.footprintCells, opposite.seats, camera))
      : undefined
    result[r] = mirrored && mirrored.every((seat) => seat !== undefined)
      ? { ...rotation, seats: mirrored as LayeredFurnitureSeat[] }
      : rotation
  }
  return result
}

function mirrorSeatToOtherEdge(
  seat: LayeredFurnitureSeat,
  footprintCells: readonly [number, number],
  oppositeSeats: readonly LayeredFurnitureSeat[],
  camera: LayeredItemCamera
): LayeredFurnitureSeat | undefined {
  const facingYawDeg = (seat.facingYawDeg + 180) % 360
  const template = oppositeSeats.find((other) => Math.abs(other.facingYawDeg - facingYawDeg) < 1e-6)
  if (!template || !seatFacesCamera(facingYawDeg, camera)) return undefined
  const facing = { x: Math.sin(radians(seat.facingYawDeg)), z: Math.cos(radians(seat.facingYawDeg)) }
  const [x, y, z] = seat.hipWorld
  const along = x * facing.x + z * facing.z
  const hipWorld: [number, number, number] = [round4(x - 2 * along * facing.x), y, round4(z - 2 * along * facing.z)]
  const [dx, dy] = projectWorldOffsetToSpritePx([hipWorld[0] - x, 0, hipWorld[2] - z], camera)
  const hipPx: [number, number] = [round2(seat.hipPx[0] + dx), round2(seat.hipPx[1] + dy)]
  const mirrorsX = Math.abs(facing.x) > Math.abs(facing.z)
  const mirrorCell = (cell: [number, number]): [number, number] => mirrorsX
    ? [footprintCells[0] - 1 - cell[0], cell[1]]
    : [cell[0], footprintCells[1] - 1 - cell[1]]
  return {
    id: seat.id,
    hipPx,
    hipWorld,
    seatHeight: seat.seatHeight,
    facingYawDeg,
    avatarView: template.avatarView,
    approachCell: mirrorCell(seat.approachCell),
    exitCell: mirrorCell(seat.exitCell),
    frontEdgePx: [
      round2(hipPx[0] + template.frontEdgePx[0] - template.hipPx[0]),
      round2(hipPx[1] + template.frontEdgePx[1] - template.hipPx[1])
    ],
    cardSplit: template.cardSplit,
    ...(template.cardClipBelowPx !== undefined
      ? { cardClipBelowPx: round2(hipPx[1] + template.cardClipBelowPx - template.hipPx[1]) }
      : {})
  }
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4 + 0
}
