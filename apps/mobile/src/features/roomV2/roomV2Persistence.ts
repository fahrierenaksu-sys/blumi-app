import { normalizeRoomVNextCandidateItemId } from "./roomVNextCandidateIdAdapter"
import type { PlacedRoomItem, UserRoomDecor } from "./roomV2.types"

const ROOM_V2_DECOR_STORAGE_PREFIX = "@blumi/room_v2/user_room_decor:v2"
export const LEGACY_ROOM_V2_DECOR_STORAGE_KEY = "@blumi/room_v2/user_room_decor"
const ROOM_V2_MIGRATION_PREFIX = "@blumi/room_v2/migrated:v2"

export type RoomV2StorageNamespace = "production" | "qa"

export function getRoomV2StorageKey(
  ownerUserId: string | undefined,
  namespace: RoomV2StorageNamespace = "production"
): string | null {
  const normalizedOwnerId = ownerUserId?.trim()
  if (!normalizedOwnerId) return null
  const namespaceSuffix = namespace === "qa" ? ":qa" : ""
  return `${ROOM_V2_DECOR_STORAGE_PREFIX}:${encodeURIComponent(normalizedOwnerId)}${namespaceSuffix}`
}

export function getRoomV2MigrationMarkerKey(
  ownerUserId: string,
  namespace: RoomV2StorageNamespace = "production"
): string {
  const namespaceSuffix = namespace === "qa" ? ":qa" : ""
  return `${ROOM_V2_MIGRATION_PREFIX}:${encodeURIComponent(ownerUserId.trim())}${namespaceSuffix}`
}

export type StoredRoomV2DecorResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "ready"; decor: UserRoomDecor }

export function readStoredRoomV2Decor(
  rawValue: string | null
): StoredRoomV2DecorResult {
  if (rawValue === null) return { status: "missing" }
  try {
    const parsed = JSON.parse(rawValue) as Partial<UserRoomDecor>
    if (
      !parsed ||
      typeof parsed.roomShellId !== "string" ||
      parsed.roomShellId.trim().length === 0 ||
      !Array.isArray(parsed.placedItems) ||
      parsed.placedItems.some((item) => !isStoredPlacedRoomItem(item)) ||
      ("schemaVersion" in parsed && !isStoredSchemaVersion(parsed.schemaVersion)) ||
      ("geometryVersion" in parsed && !isStoredGeometryVersion(parsed.geometryVersion)) ||
      ("migration" in parsed && !isStoredMigration(parsed.migration))
    ) {
      return { status: "invalid" }
    }
    return {
      status: "ready",
      decor: {
        ...(typeof parsed.schemaVersion === "number"
          ? { schemaVersion: parsed.schemaVersion }
          : {}),
        ...(typeof parsed.geometryVersion === "string"
          ? { geometryVersion: parsed.geometryVersion }
          : {}),
        ...(isStoredMigration(parsed.migration)
          ? {
              migration: {
                fromSchemaVersion: parsed.migration.fromSchemaVersion,
                sourceShellId: parsed.migration.sourceShellId
              }
            }
          : {}),
        roomShellId: parsed.roomShellId,
        placedItems: parsed.placedItems.map((item) => ({
          ...item,
          itemId: normalizeRoomVNextCandidateItemId(item.itemId)
        }))
      }
    }
  } catch {
    return { status: "invalid" }
  }
}

function isStoredSchemaVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isStoredGeometryVersion(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isStoredMigration(
  value: unknown
): value is NonNullable<UserRoomDecor["migration"]> {
  if (!value || typeof value !== "object") return false
  const migration = value as Partial<NonNullable<UserRoomDecor["migration"]>>
  return (
    isStoredSchemaVersion(migration.fromSchemaVersion) &&
    typeof migration.sourceShellId === "string" &&
    migration.sourceShellId.length > 0
  )
}

function isStoredPlacedRoomItem(item: unknown): item is PlacedRoomItem {
  if (!item || typeof item !== "object") return false
  const placed = item as Partial<PlacedRoomItem>
  return (
    typeof placed.instanceId === "string" &&
    typeof placed.itemId === "string" &&
    typeof placed.x === "number" &&
    typeof placed.y === "number" &&
    (
      placed.rotation === "front" ||
      placed.rotation === "back" ||
      placed.rotation === "left" ||
      placed.rotation === "right"
    ) &&
    (placed.geometryVersion === undefined || isStoredGeometryVersion(placed.geometryVersion)) &&
    (placed.placementSurface === undefined || isStoredPlacementSurface(placed.placementSurface)) &&
    (placed.supportInstanceId === undefined || (
      typeof placed.supportInstanceId === "string" && placed.supportInstanceId.trim().length > 0
    )) &&
    (placed.supportParentRotation === undefined || isStoredRotation(placed.supportParentRotation)) &&
    (placed.supportLocalPosition === undefined || isStoredPoint(placed.supportLocalPosition))
  )
}

function isStoredRotation(value: unknown): value is PlacedRoomItem["rotation"] {
  return value === "front" || value === "back" || value === "left" || value === "right"
}

function isStoredPlacementSurface(value: unknown): value is PlacedRoomItem["placementSurface"] {
  return value === "floor" || value === "wall" || value === "tabletop" || value === "ceiling"
}

function isStoredPoint(value: unknown): value is NonNullable<PlacedRoomItem["supportLocalPosition"]> {
  if (!value || typeof value !== "object") return false
  const point = value as { x?: unknown; y?: unknown }
  return typeof point.x === "number" && Number.isFinite(point.x) &&
    typeof point.y === "number" && Number.isFinite(point.y)
}
