import { PublicRequestError } from "../errors/publicRequestError"
import {
  clonePersonalRoomDecor,
  createInMemoryPersonalRoomDecorRepository,
  type PersonalRoomDecor,
  type PersonalRoomDecorRepository,
  type PersonalRoomDecorSnapshot,
  type PersonalRoomRotation
} from "./personalRoomDecorRepository"
import type { RoomSnapshotService } from "./roomSnapshotService"

const MAX_PLACED_ITEMS = 60
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/
const PERSONAL_ROOM_DECOR_SCHEMA_VERSION = 3
const PERSONAL_ROOM_GEOMETRY_VERSION = "room_v2"
const SUPPORTED_PERSONAL_ROOM_SHELL_IDS = new Set([
  "room_v2_shell_blumi_world_v1"
])

export interface PersonalRoomDecorService {
  repository: PersonalRoomDecorRepository
  get(userId: string): Promise<PersonalRoomDecorSnapshot | null>
  save(
    userId: string,
    input: { expectedRevision: number; decor: unknown },
    now?: Date
  ): Promise<
    | { kind: "saved"; snapshot: PersonalRoomDecorSnapshot }
    | { kind: "conflict"; current: PersonalRoomDecorSnapshot }
  >
}

export function createPersonalRoomDecorService(options: {
  repository?: PersonalRoomDecorRepository
  getOwnedRoomItemIds(userId: string): Promise<readonly string[]>
  roomSnapshotService?: RoomSnapshotService
  onRoomSnapshotError?: (error: unknown, room: PersonalRoomDecorSnapshot) => void
}): PersonalRoomDecorService {
  const repository =
    options.repository ?? createInMemoryPersonalRoomDecorRepository()

  return {
    repository,
    async get(userId) {
      return repository.get(normalizeUserId(userId))
    },
    async save(userId, input, now = new Date()) {
      const normalizedUserId = normalizeUserId(userId)
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0
      ) {
        throw new PublicRequestError("Refresh your room and try again.")
      }
      const decor = normalizePersonalRoomDecor(input.decor)
      const ownedItemIds = new Set(
        await options.getOwnedRoomItemIds(normalizedUserId)
      )
      const unowned = decor.placedItems.find(
        (item) => !ownedItemIds.has(item.itemId)
      )
      if (unowned) {
        throw new PublicRequestError(
          "Your room includes an item you do not own."
        )
      }
      const result = await repository.save({
        userId: normalizedUserId,
        expectedRevision: input.expectedRevision,
        decor,
        updatedAt: now.toISOString()
      })
      if (result.kind === "saved" && options.roomSnapshotService) {
        try {
          await options.roomSnapshotService.publishForRoomSave(result.snapshot)
        } catch (error) {
          // The canonical room save remains successful. The revision check in
          // Discovery hides the old snapshot until this revision is rendered.
          options.onRoomSnapshotError?.(error, result.snapshot)
        }
      }
      return result
    }
  }
}

function normalizePersonalRoomDecor(value: unknown): PersonalRoomDecor {
  if (!isRecord(value)) {
    throw new PublicRequestError("Choose a valid room layout.")
  }
  const roomShellId = readSafeId(value.roomShellId)
  if (
    !roomShellId ||
    !SUPPORTED_PERSONAL_ROOM_SHELL_IDS.has(roomShellId) ||
    !Array.isArray(value.placedItems) ||
    (
      value.schemaVersion !== undefined &&
      value.schemaVersion !== PERSONAL_ROOM_DECOR_SCHEMA_VERSION
    ) ||
    (
      value.geometryVersion !== undefined &&
      value.geometryVersion !== PERSONAL_ROOM_GEOMETRY_VERSION
    ) ||
    value.migration !== undefined
  ) {
    throw new PublicRequestError("Choose a valid room layout.")
  }
  if (value.placedItems.length > MAX_PLACED_ITEMS) {
    throw new PublicRequestError(
      `Place up to ${MAX_PLACED_ITEMS} items in a room.`
    )
  }

  const instanceIds = new Set<string>()
  const itemIds = new Set<string>()
  const placedItems = value.placedItems.map((item) => {
    if (!isRecord(item)) {
      throw new PublicRequestError("Choose valid room placement data.")
    }
    const instanceId = readSafeId(item.instanceId)
    const itemId = readSafeId(item.itemId)
    const rotation: PersonalRoomRotation | null =
      item.rotation === "front" ||
      item.rotation === "back" ||
      item.rotation === "left" ||
      item.rotation === "right"
        ? item.rotation
        : null
    if (
      !instanceId ||
      !itemId ||
      !rotation ||
      instanceIds.has(instanceId) ||
      itemIds.has(itemId) ||
      !isNormalizedCoordinate(item.x) ||
      !isNormalizedCoordinate(item.y) ||
      item.depth !== undefined ||
      item.width !== undefined ||
      item.height !== undefined
    ) {
      throw new PublicRequestError("Choose valid room placement data.")
    }
    instanceIds.add(instanceId)
    itemIds.add(itemId)
    return {
      instanceId,
      itemId,
      x: item.x,
      y: item.y,
      rotation
    }
  })

  return clonePersonalRoomDecor({
    schemaVersion: PERSONAL_ROOM_DECOR_SCHEMA_VERSION,
    geometryVersion: PERSONAL_ROOM_GEOMETRY_VERSION,
    roomShellId,
    placedItems
  })
}

function isNormalizedCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
}

function normalizeUserId(userId: string): string {
  const normalized = readSafeId(userId)
  if (!normalized) throw new Error("A valid room owner is required.")
  return normalized
}

function readSafeId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return SAFE_ID.test(normalized) ? normalized : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
