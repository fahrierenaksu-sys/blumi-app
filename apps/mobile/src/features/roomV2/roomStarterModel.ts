import type { RoomWorldPoint } from "../roomWorld/roomWorldGeometry"
import type { RoomFurnitureRotation, UserRoomDecor } from "./roomV2.types"
import type { RoomSetupCopy } from "./roomSetupCopy"
import { RoomDecorItemNotOwnedError } from "./personalRoomDecorErrors"

/**
 * The one free starter bed (canonical id, owned by every account, plan F9). The default room holds only this bed; the
 * room setup step places it (art: Workbench furniture/work/bed_starter_a, design A).
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

/**
 * The room of a signed-in account that has no stored room yet (setup skipped, or its first save never landed): the
 * starter room, i.e. the shell with the free starter bed at its default point (OWNER_DECISIONS 2026-10-11 03:37).
 */
export function createStarterRoomWithBed(roomShellId: string): UserRoomDecor {
  return placeStarterBed(createStarterRoomDecor(roomShellId), STARTER_ROOM_BED_DEFAULT_POINT)
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
 * The summary line under the setup title, and whether the GIFT chip shows. While the starter bed is not available
 * (Phase 4.7 adds it) no bed and no gift is mentioned: the user gets an empty room, so that is all the text says.
 */
export function resolveRoomSetupSummary(input: {
  starterBedAvailable: boolean
  starterRoomReady: boolean
  copy: Pick<RoomSetupCopy, "bedPlacedSummary" | "bedPendingSummary" | "roomOnlySummary">
}): { text: string; showGiftBadge: boolean } {
  if (!input.starterBedAvailable) return { text: input.copy.roomOnlySummary, showGiftBadge: false }
  return {
    text: input.starterRoomReady ? input.copy.bedPlacedSummary : input.copy.bedPendingSummary,
    showGiftBadge: true
  }
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

/**
 * Saves the onboarding room. A server that does not know the starter bed yet (the API before the 2.5D release) refuses
 * the whole room as an item the account does not own; only then the empty default room is saved instead, so creating
 * the account never gets stuck on the bed. Every other failure (timeout, network, 5xx) keeps the room as the user made
 * it and surfaces its own error, as does a failure of the empty room.
 */
export async function saveOnboardingRoomKeepingSignupAlive<Result>(
  room: UserRoomDecor,
  save: (decor: UserRoomDecor) => Promise<Result>
): Promise<Result> {
  try {
    return await save(room)
  } catch (error) {
    if (!(error instanceof RoomDecorItemNotOwnedError)) throw error
    const withoutBed = room.placedItems.filter((item) => item.itemId !== STARTER_ROOM_BED_ITEM_ID)
    if (withoutBed.length === room.placedItems.length) throw error
    try {
      return await save({ ...room, placedItems: withoutBed.map((item) => ({ ...item })) })
    } catch {
      throw error
    }
  }
}
