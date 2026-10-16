import { createMigrationLedgerProbe, type MigrationLedgerProbeOptions } from "../chat/chatReceiptSchema"
import type { CatTripSchemaProbe } from "./catTripSchema"

/** Migration 079 holds the switches; optional for readiness like 077. */
export const CAT_TRIP_PREFS_MIGRATION_ID = "079_cat_trip_prefs.sql"

/**
 * A member's own switches for the traveling cat. The owner decided
 * (2026-10-17) that the cat visits every eligible match unless its owner
 * turns travel off; a host may refuse guests. Teaser pushes are opt-in.
 */
export interface CatTripPrefs {
  /** "Kedim misafirliğe gitsin": the member's cat may travel. */
  travelEnabled: boolean
  /** "Misafir kedi kabul et": other members' cats may visit this member. */
  hostEnabled: boolean
  /** "Kedi haberleri": teaser pushes about trips, off until chosen. */
  pushEnabled: boolean
}

export const DEFAULT_CAT_TRIP_PREFS: Readonly<CatTripPrefs> = Object.freeze({
  travelEnabled: true,
  hostEnabled: true,
  pushEnabled: false
})

export type CatTripPrefsPatch = Partial<CatTripPrefs>

export interface CatTripPrefsRepository {
  /** Null when the member never changed a switch (the defaults apply). */
  get(userId: string): Promise<CatTripPrefs | null>
  /** Merges the patch over the stored row (or the defaults) and returns the result. */
  update(userId: string, patch: CatTripPrefsPatch, at: string): Promise<CatTripPrefs>
  deleteUser(userId: string): Promise<number>
}

/**
 * Reads never fail closed into "travel off": while migration 079 is missing
 * nobody can have changed a switch, so the defaults are the truth. Writes
 * need the table.
 */
export interface CatTripPrefsStore {
  read(userId: string): Promise<CatTripPrefs>
  /** Null when the table is not there yet (migration 079 not applied). */
  write(userId: string, patch: CatTripPrefsPatch, at: string): Promise<CatTripPrefs | null>
  deleteUser(userId: string): Promise<number>
}

export function createCatTripPrefsStore(
  repository: CatTripPrefsRepository,
  schema?: { isReady(): Promise<boolean> }
): CatTripPrefsStore {
  const ready = async () => (schema ? schema.isReady() : true)
  return {
    async read(userId) {
      if (!(await ready())) return { ...DEFAULT_CAT_TRIP_PREFS }
      return (await repository.get(userId)) ?? { ...DEFAULT_CAT_TRIP_PREFS }
    },
    async write(userId, patch, at) {
      if (!(await ready())) return null
      return repository.update(userId, patch, at)
    },
    async deleteUser(userId) {
      if (!(await ready())) return 0
      return repository.deleteUser(userId)
    }
  }
}

export function createInMemoryCatTripPrefsRepository(): CatTripPrefsRepository {
  const rows = new Map<string, CatTripPrefs>()
  return {
    async get(userId) {
      const row = rows.get(userId)
      return row ? { ...row } : null
    },
    async update(userId, patch, _at) {
      const next = { ...(rows.get(userId) ?? DEFAULT_CAT_TRIP_PREFS), ...pickPrefs(patch) }
      rows.set(userId, next)
      return { ...next }
    },
    async deleteUser(userId) {
      return rows.delete(userId) ? 1 : 0
    }
  }
}

/** Only known boolean keys survive; anything else in a patch is dropped. */
export function pickPrefs(patch: CatTripPrefsPatch): CatTripPrefsPatch {
  const picked: CatTripPrefsPatch = {}
  for (const key of ["travelEnabled", "hostEnabled", "pushEnabled"] as const) {
    if (typeof patch[key] === "boolean") picked[key] = patch[key]
  }
  return picked
}

export function createCatTripPrefsSchemaProbe(
  pool: Parameters<typeof createMigrationLedgerProbe>[0],
  options: MigrationLedgerProbeOptions = {}
): CatTripSchemaProbe {
  return createMigrationLedgerProbe(pool, CAT_TRIP_PREFS_MIGRATION_ID, options)
}
