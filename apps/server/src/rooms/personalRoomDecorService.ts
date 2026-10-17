import { isLegacyItemId } from "@blumi/domain"
import { mapWithConcurrency } from "../shared/mapWithConcurrency"
import { PublicRequestError } from "../errors/publicRequestError"
import {
  clonePersonalRoomDecor,
  createInMemoryPersonalRoomDecorRepository,
  type PersonalRoomDecor,
  type PersonalRoomDecorRepository,
  type PersonalRoomDecorSnapshot,
  type PersonalRoomRotation
} from "./personalRoomDecorRepository"
import { isActiveRoomItemId } from "./roomItemProjection"
import type { RoomSnapshotService } from "./roomSnapshotService"

const MAX_PLACED_ITEMS = 60
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/
const PERSONAL_ROOM_DECOR_SCHEMA_VERSION = 3
const PERSONAL_ROOM_GEOMETRY_VERSION = "room_v2"
const SUPPORTED_PERSONAL_ROOM_SHELL_IDS = new Set([
  "room_v2_shell_blumi_world_v1"
])

/**
 * What a client is shown of a stored room. `hiddenItemCount` is only present when active placements are held back
 * because a room shows at most 60 items; they stay stored and are never deleted.
 */
export type ClientPersonalRoomDecorSnapshot = PersonalRoomDecorSnapshot & { hiddenItemCount?: number }

const ROOM_READ_CONCURRENCY = 4

export interface PersonalRoomDecorService {
  repository: PersonalRoomDecorRepository
  get(userId: string): Promise<ClientPersonalRoomDecorSnapshot | null>
  /** `get` for many owners (the street): one room read and one inventory read when both stores batch. */
  getMany(userIds: readonly string[]): Promise<ReadonlyMap<string, ClientPersonalRoomDecorSnapshot>>
  save(
    userId: string,
    input: { expectedRevision: number; decor: unknown },
    now?: Date
  ): Promise<
    | {
        kind: "saved"
        snapshot: ClientPersonalRoomDecorSnapshot
        /** Retired items an older client sent; they were left out of the saved room. */
        strippedItemCount: number
      }
    | { kind: "conflict"; current: ClientPersonalRoomDecorSnapshot }
  >
}

export function createPersonalRoomDecorService(options: {
  repository?: PersonalRoomDecorRepository
  getOwnedRoomItemIds(userId: string): Promise<readonly string[]>
  /** Batched `getOwnedRoomItemIds` for `getMany`; without it each owner is read on its own, a few at a time. */
  getOwnedRoomItemIdsForUsers?: (userIds: readonly string[]) => Promise<ReadonlyMap<string, readonly string[]>>
  /**
   * Ownership as stored, including items that are not active (held or retired). Only used to decide that a stored
   * placement of an owned, inactive item is carried over a save; it never makes an item placeable. Defaults to
   * `getOwnedRoomItemIds`.
   */
  getStoredOwnedRoomItemIds?: (userId: string) => Promise<readonly string[]>
  /** Defaults to the room catalog of this environment minus the retired ids (`roomItemProjection.ts`). */
  isActiveRoomItemId?: (itemId: string) => boolean
  /** Retired ids an older client may still send; they are left out of a save. Defaults to the legacy registry. */
  isRetiredItemId?: (itemId: string) => boolean
  roomSnapshotService?: RoomSnapshotService
  onRoomSnapshotError?: (error: unknown, room: PersonalRoomDecorSnapshot) => void
}): PersonalRoomDecorService {
  const repository =
    options.repository ?? createInMemoryPersonalRoomDecorRepository()
  const isActive = options.isActiveRoomItemId ?? isActiveRoomItemId
  const isRetiredItemId = options.isRetiredItemId ?? isLegacyItemId

  return {
    repository,
    async get(userId) {
      const normalizedUserId = normalizeUserId(userId)
      const stored = await repository.get(normalizedUserId)
      if (!stored) return null
      // Read projection: legacy, unknown, held and unowned items are left out; the row and its revision stay as
      // stored, so the next save with this revision succeeds (and carries the stored retired placements over).
      const ownedItemIds = new Set(
        await options.getOwnedRoomItemIds(normalizedUserId)
      )
      return toClientRoom(stored, ownedItemIds)
    },
    async getMany(userIds) {
      const owners = [...new Set(userIds.map(normalizeUserId))]
      const storedRooms = repository.getMany
        ? await repository.getMany(owners)
        : (await mapWithConcurrency(owners, ROOM_READ_CONCURRENCY, (owner) => repository.get(owner)))
          .flatMap((room) => (room ? [room] : []))
      const withRooms = storedRooms.map((room) => room.userId)
      const owned = options.getOwnedRoomItemIdsForUsers
        ? await options.getOwnedRoomItemIdsForUsers(withRooms)
        : new Map(await mapWithConcurrency(withRooms, ROOM_READ_CONCURRENCY,
          async (owner) => [owner, await options.getOwnedRoomItemIds(owner)] as const))
      return new Map(storedRooms.map((room) => [room.userId, toClientRoom(room, new Set(owned.get(room.userId) ?? []))]))
    },
    async save(userId, input, now = new Date()) {
      const normalizedUserId = normalizeUserId(userId)
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0
      ) {
        throw new PublicRequestError("Refresh your room and try again.")
      }
      // Transition (2.5D cutover): an older client still sends retired ids (legacy registry), such as its starter
      // bed. They are left out, as the read projection leaves them out, instead of refusing the whole save. Held
      // and unknown ids are still refused, and nothing is granted: every item that stays must be active and owned.
      const sent = normalizePersonalRoomDecor(input.decor)
      const decor: PersonalRoomDecor = {
        ...sent,
        placedItems: sent.placedItems.filter((item) => isActive(item.itemId) || !isRetiredItemId(item.itemId))
      }
      const strippedItemCount = sent.placedItems.length - decor.placedItems.length
      if (decor.placedItems.some((item) => !isActive(item.itemId))) {
        throw new PublicRequestError(
          "Your room includes an item that is not available."
        )
      }
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
      // The read hid the user's stored retired placements, so no client sends them back: they are carried over
      // untouched (F3 not waived). Only from the revision the client saves over; any other revision conflicts below.
      // The same holds for a held item the user owns (a pricing-pending chair): inactive, so hidden, but never erased.
      const stored = await repository.get(normalizedUserId)
      const storedOwnedItemIds = options.getStoredOwnedRoomItemIds
        ? new Set(await options.getStoredOwnedRoomItemIds(normalizedUserId))
        : ownedItemIds
      // An active placement past the room limit (a held item that became active later) is held back from the read the
      // same way: it is carried too, so a save never deletes it. Placing that same item again replaces its stored
      // placement, as an item can be placed once.
      const sentItemIds = new Set(decor.placedItems.map((item) => item.itemId))
      const heldBack = stored?.revision === input.expectedRevision
        ? new Set(splitByRoomLimit(stored, ownedItemIds).heldBack.filter((item) => !sentItemIds.has(item.itemId)))
        : new Set<PersonalRoomDecor["placedItems"][number]>()
      const carried = stored?.revision === input.expectedRevision
        ? stored.decor.placedItems.filter((item) => heldBack.has(item) || isStoredCarried(item.itemId, storedOwnedItemIds))
        : []
      const result = await repository.save({
        userId: normalizedUserId,
        expectedRevision: input.expectedRevision,
        decor: { ...decor, placedItems: [...withFreeInstanceIds(decor.placedItems, carried), ...carried] },
        updatedAt: now.toISOString()
      })
      if (result.kind === "missing") {
        throw new PublicRequestError("Refresh your room and try again.")
      }
      if (result.kind === "conflict") {
        return { kind: "conflict", current: toClientRoom(result.current, ownedItemIds) }
      }
      const snapshot = toClientRoom(result.snapshot, ownedItemIds)
      if (options.roomSnapshotService) {
        try {
          const { hiddenItemCount: _hiddenItemCount, ...publishable } = snapshot
          await options.roomSnapshotService.publishForRoomSave(publishable)
        } catch (error) {
          // The canonical room save remains successful. The revision check in
          // Discovery hides the old snapshot until this revision is rendered.
          options.onRoomSnapshotError?.(error, snapshot)
        }
      }
      return { kind: "saved", snapshot, strippedItemCount }
    }
  }

  /**
   * A stored placement of an inactive item that is retired, or held and owned by the user: kept in the row, never
   * shown, drawn, validated or counted as owned. Anything else not active (unknown, unowned) was never a valid save.
   */
  function isStoredCarried(itemId: string, storedOwnedItemIds: ReadonlySet<string>): boolean {
    if (isActive(itemId)) return false
    return isRetiredItemId(itemId) || storedOwnedItemIds.has(itemId)
  }

  /**
   * Active, owned placements in stored order: the first 60 are shown (the guest of a shared room sees the same
   * first 60), the rest are held back, never deleted.
   */
  function splitByRoomLimit(room: PersonalRoomDecorSnapshot, ownedItemIds: ReadonlySet<string>) {
    const placeable = room.decor.placedItems.filter((item) => isActive(item.itemId) && ownedItemIds.has(item.itemId))
    return { shown: placeable.slice(0, MAX_PLACED_ITEMS), heldBack: placeable.slice(MAX_PLACED_ITEMS) }
  }

  /** What a client may see of a stored room: active, owned items only, at most 60; the row and its revision stay as stored. */
  function toClientRoom(
    room: PersonalRoomDecorSnapshot,
    ownedItemIds: ReadonlySet<string>
  ): ClientPersonalRoomDecorSnapshot {
    const { shown, heldBack } = splitByRoomLimit(room, ownedItemIds)
    return {
      ...room,
      decor: { ...room.decor, placedItems: shown.map((item) => ({ ...item })) },
      ...(heldBack.length > 0 ? { hiddenItemCount: heldBack.length } : {})
    }
  }
}

/**
 * Carried placements keep their stored instanceId untouched, so a new placement that reuses one gets a free id. The
 * 60-item limit applies to what the client sends, never to the carried rows: a valid save is not refused for them.
 */
function withFreeInstanceIds(
  placed: PersonalRoomDecor["placedItems"],
  carried: PersonalRoomDecor["placedItems"]
): PersonalRoomDecor["placedItems"] {
  const carriedIds = new Set(carried.map((item) => item.instanceId))
  const taken = new Set([...carried, ...placed].map((item) => item.instanceId))
  return placed.map((item) => {
    if (!carriedIds.has(item.instanceId)) return item
    const stem = item.instanceId.slice(0, 120)
    let suffix = 2
    while (taken.has(`${stem}-${suffix}`)) suffix += 1
    const instanceId = `${stem}-${suffix}`
    taken.add(instanceId)
    return { ...item, instanceId }
  })
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
