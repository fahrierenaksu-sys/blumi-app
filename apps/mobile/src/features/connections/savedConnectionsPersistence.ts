const SAVED_CONNECTIONS_STORAGE_PREFIX = "@blumi/savedConnections/v2"
const SKIPPED_CONNECTIONS_STORAGE_PREFIX = "@blumi/skippedConnections/v2"
export const LEGACY_SAVED_CONNECTIONS_STORAGE_KEY = "@blumi/savedConnections/v1"
export const LEGACY_SKIPPED_CONNECTIONS_STORAGE_KEY = "@blumi/skippedConnections/v1"
const CONNECTIONS_MIGRATION_PREFIX = "@blumi/connections/migrated:v2"

export function normalizeSavedConnectionsOwnerId(ownerUserId: string): string {
  const normalized = ownerUserId.trim()
  if (!normalized) {
    throw new Error("A connection storage owner is required.")
  }
  return normalized
}

export function getSavedConnectionsStorageKeys(ownerUserId: string): {
  saved: string
  skipped: string
  migrationMarker: string
} {
  const encodedOwnerId = encodeURIComponent(
    normalizeSavedConnectionsOwnerId(ownerUserId)
  )
  return {
    saved: `${SAVED_CONNECTIONS_STORAGE_PREFIX}:${encodedOwnerId}`,
    skipped: `${SKIPPED_CONNECTIONS_STORAGE_PREFIX}:${encodedOwnerId}`,
    migrationMarker: `${CONNECTIONS_MIGRATION_PREFIX}:${encodedOwnerId}`
  }
}
