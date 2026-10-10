import type { RoomWorldPoint } from "../roomWorld/roomWorldGeometry"
import type { RoomFurnitureRotation, UserRoomDecor } from "./roomV2.types"

/**
 * The one free starter bed (a new canonical id, reserved in the domain catalog). The default room holds only this bed.
 * Its art lands later; until then no room catalog entry draws it and the default room is the empty shell.
 */
export const STARTER_ROOM_BED_ITEM_ID = "room_v3_bed_blumi_starter"
export const STARTER_ROOM_BED_DEFAULT_POINT: RoomWorldPoint = Object.freeze({
  x: 0.52,
  y: 0.7
})

export function createStarterRoomDecor(roomShellId: string): UserRoomDecor {
  return {
    roomShellId,
    placedItems: []
  }
}

export function placeStarterBed(
  decor: UserRoomDecor,
  point: RoomWorldPoint,
  rotation: RoomFurnitureRotation = "front"
): UserRoomDecor {
  return {
    ...decor,
    placedItems: [{
      instanceId: "starter-room-bed",
      itemId: STARTER_ROOM_BED_ITEM_ID,
      x: point.x,
      y: point.y,
      rotation
    }]
  }
}

const STARTER_BED_ROTATIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "right",
  "back",
  "left"
]

export function rotateStarterBed(decor: UserRoomDecor): UserRoomDecor {
  const bed = decor.placedItems.find(
    (item) => item.itemId === STARTER_ROOM_BED_ITEM_ID
  )
  if (!bed) {
    return {
      ...decor,
      placedItems: decor.placedItems.map((item) => ({ ...item }))
    }
  }
  const currentIndex = STARTER_BED_ROTATIONS.indexOf(bed.rotation)
  const rotation = STARTER_BED_ROTATIONS[
    (Math.max(0, currentIndex) + 1) % STARTER_BED_ROTATIONS.length
  ]
  return {
    ...decor,
    placedItems: decor.placedItems.map((item) => (
      item.instanceId === bed.instanceId
        ? { ...item, rotation }
        : { ...item }
    ))
  }
}

export function hasPlacedStarterBed(decor: UserRoomDecor): boolean {
  return (
    decor.placedItems.length === 1 &&
    decor.placedItems[0]?.itemId === STARTER_ROOM_BED_ITEM_ID
  )
}

/**
 * Whether the room setup step can finish: with a drawable starter bed it must be placed (the caller also checks the
 * spot is valid); while the bed has no art the step finishes on the empty default room.
 */
export function canCompleteRoomSetup(input: {
  decor: UserRoomDecor
  defaultRoomShellId: string
  starterBedAvailable: boolean
  placedBedIsValid: boolean
}): boolean {
  if (input.decor.roomShellId !== input.defaultRoomShellId) return false
  return input.starterBedAvailable ? hasPlacedStarterBed(input.decor) && input.placedBedIsValid : true
}
