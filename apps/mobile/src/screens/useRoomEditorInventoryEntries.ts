import { useMemo } from "react"

export type RoomEditorInventoryHydrationStatus = "idle" | "loading" | "ready" | "failed"
export type RoomEditorInventoryEmptyState = "no-matches" | "no-pieces" | "unavailable" | null

export interface RoomEditorInventoryViewState {
  isLoading: boolean
  isFailed: boolean
  emptyState: RoomEditorInventoryEmptyState
}

export interface RoomEditorInventoryEntry<Item extends { id: string }> {
  item: Item
  owned: true
}

export function getRoomEditorInventoryViewState(
  hydrationStatus: RoomEditorInventoryHydrationStatus,
  totalEntriesCount: number,
  filteredEntriesCount: number
): RoomEditorInventoryViewState {
  const isLoading = hydrationStatus === "idle" || hydrationStatus === "loading"
  const isFailed = hydrationStatus === "failed"
  const emptyState: RoomEditorInventoryEmptyState = isLoading || filteredEntriesCount > 0
    ? null
    : totalEntriesCount > 0
      ? "no-matches"
      : hydrationStatus === "ready"
        ? "no-pieces"
        : "unavailable"

  return { isLoading, isFailed, emptyState }
}

export function canPlaceRoomEditorInventoryItem(
  hydrationStatus: RoomEditorInventoryHydrationStatus,
  requireServerHydration: boolean
): boolean {
  return !requireServerHydration || hydrationStatus === "ready"
}

/** Recalculate when the store's visible safe snapshot changes, including its
 * default-owned items before hydration. The ownership lookup callback is stable. */
export function useRoomEditorInventoryEntries<Item extends { id: string }>(
  catalog: readonly Item[],
  ownedRoomItemIds: readonly string[],
  qaOwnedItemIds: ReadonlySet<string>
): RoomEditorInventoryEntry<Item>[] {
  const ownedIdsJson = JSON.stringify(ownedRoomItemIds)
  return useMemo(() => {
    const ownedIds = new Set<string>(JSON.parse(ownedIdsJson) as string[])
    return catalog
      .filter((item) =>
        ownedIds.has(item.id) || qaOwnedItemIds.has(item.id)
      )
      .map((item) => ({ item, owned: true as const }))
  }, [catalog, ownedIdsJson, qaOwnedItemIds])
}
