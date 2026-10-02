export const MINI_ROOM_KEYBOARD_PREFERENCE_KEY = "blumi.miniRoom.keyboardSuggestions.v1"

interface PreferenceStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

/** Device preference only; does not configure any other text input. */
export function createMiniRoomKeyboardPreference(storage: PreferenceStorage) {
  let enabled = false
  let revision = 0
  let hydration: Promise<void> | undefined
  let writes = Promise.resolve()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  return {
    getSnapshot: () => enabled,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    hydrate() {
      if (!hydration) {
        const startRevision = revision
        hydration = storage.getItem(MINI_ROOM_KEYBOARD_PREFERENCE_KEY).then((raw) => {
          if (revision !== startRevision) return
          enabled = raw === "true"
          emit()
        }).catch(() => { /* Keep the default when device storage is unavailable. */ })
      }
      return hydration
    },
    setEnabled(next: boolean) {
      revision += 1
      enabled = next
      emit()
      // Serialize rapid taps so an older write cannot overwrite the latest choice.
      writes = writes.then(() => storage.setItem(MINI_ROOM_KEYBOARD_PREFERENCE_KEY, String(next)))
        .catch(() => { /* This session still uses the selected setting. */ })
      return writes
    }
  }
}
