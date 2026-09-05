export type RoomV2PersistenceState = "loading" | "ready" | "failed"

export function canEditRoomV2Decor(
  persistenceState: RoomV2PersistenceState,
  inventoryReady: boolean
): boolean {
  // A failed local read is recovered by RoomV2Provider to a fresh, safe
  // draft. Keep edits available in that degraded state; inventory readiness
  // remains the ownership boundary for every item mutation.
  return (
    (persistenceState === "ready" || persistenceState === "failed") &&
    inventoryReady
  )
}
