import type { RoomShell, UserRoomDecor } from "./roomV2.types"

export const ROOM_V3_DECOR_SCHEMA_VERSION = 3

export function migrateRoomV2DecorToV3(input: {
  decor: UserRoomDecor
  targetShell: RoomShell
}): UserRoomDecor {
  const targetGeometryVersion = input.targetShell.geometryVersion ?? "room_v2"
  if (
    input.decor.schemaVersion === ROOM_V3_DECOR_SCHEMA_VERSION &&
    input.decor.geometryVersion === targetGeometryVersion &&
    input.decor.roomShellId === input.targetShell.id
  ) {
    return {
      ...input.decor,
      ...(input.decor.migration
        ? { migration: { ...input.decor.migration } }
        : {}),
      placedItems: input.decor.placedItems.map((item) => ({ ...item }))
    }
  }

  const fromSchemaVersion = input.decor.schemaVersion ?? 2
  return {
    schemaVersion: ROOM_V3_DECOR_SCHEMA_VERSION,
    geometryVersion: targetGeometryVersion,
    migration: {
      fromSchemaVersion,
      sourceShellId: input.decor.roomShellId
    },
    roomShellId: input.targetShell.id,
    placedItems: input.decor.placedItems.map((item) => ({ ...item }))
  }
}
