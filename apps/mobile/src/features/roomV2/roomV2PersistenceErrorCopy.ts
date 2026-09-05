export type RoomV2PersistenceErrorSurface = "load" | "sync"

interface RoomV2PersistenceErrorContext {
  hasLocalRoom?: boolean
  isSavedOnDevice?: boolean
}

/**
 * Room persistence can fail while a local draft remains usable. Keep that
 * state clear without exposing transport or provider diagnostics in the Room
 * editor's alert banner.
 */
export function getRoomV2PersistenceErrorMessageForDisplay(
  surface: RoomV2PersistenceErrorSurface,
  _error: unknown,
  context: RoomV2PersistenceErrorContext = {}
): string {
  if (surface === "sync") {
    return context.isSavedOnDevice === false
      ? "Your room is open, but the latest change could not be saved on this device or synced yet. Keep this screen open and try again."
      : "Your room is saved on this device. We couldn't sync it yet. Try again later."
  }

  return context.hasLocalRoom
    ? "Your room is available offline. We couldn't sync it yet."
    : "A fresh room is ready on this device. We couldn't sync your saved room yet."
}
