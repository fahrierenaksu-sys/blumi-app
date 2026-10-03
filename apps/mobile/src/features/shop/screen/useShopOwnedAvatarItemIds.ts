import { useMemo } from "react"

/**
 * Inventory snapshots defensively copy their arrays. Keep equivalent copies
 * stable for Shop preview/callback dependencies, scoped to this screen mount.
 * This does not verify ownership; action gates still use the server snapshot.
 */
export function useShopOwnedAvatarItemIds(ids: readonly string[]): readonly string[] {
  const contentKey = JSON.stringify(ids)
  return useMemo(() => JSON.parse(contentKey) as readonly string[], [contentKey])
}
