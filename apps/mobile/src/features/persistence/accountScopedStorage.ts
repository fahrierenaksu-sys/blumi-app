export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface ScopedStorageEntry {
  scopedKey: string
  legacyKey: string
}

export type ScopedStorageLoadResult =
  | { status: "ready"; rawValues: (string | null)[]; migrated: boolean }
  | { status: "error" }

export async function loadAccountScopedStorage(input: {
  storage: AsyncKeyValueStorage
  entries: ScopedStorageEntry[]
  migrationMarkerKey: string
  maxAttempts?: number
}): Promise<ScopedStorageLoadResult> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2)
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const scopedValues = await Promise.all(
        input.entries.map((entry) => input.storage.getItem(entry.scopedKey))
      )
      const marker = await input.storage.getItem(input.migrationMarkerKey)
      if (marker !== null || scopedValues.every((value) => value !== null)) {
        return { status: "ready", rawValues: scopedValues, migrated: false }
      }

      const legacyValues = await Promise.all(
        input.entries.map((entry, index) =>
          scopedValues[index] === null
            ? input.storage.getItem(entry.legacyKey)
            : Promise.resolve(null)
        )
      )
      const nextValues = scopedValues.map(
        (value, index) => value ?? legacyValues[index] ?? null
      )
      await Promise.all(nextValues.map((value, index) =>
        value === null
          ? Promise.resolve()
          : input.storage.setItem(input.entries[index]!.scopedKey, value)
      ))
      await input.storage.setItem(input.migrationMarkerKey, "1")
      await Promise.all(
        input.entries.map((entry) => input.storage.removeItem(entry.legacyKey))
      )
      return {
        status: "ready",
        rawValues: nextValues,
        migrated: legacyValues.some((value) => value !== null)
      }
    } catch {
      if (attempt === maxAttempts - 1) return { status: "error" }
    }
  }
  return { status: "error" }
}
