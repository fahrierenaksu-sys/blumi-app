import { createHash, randomUUID } from "node:crypto"
import type { DiscoveryFilters } from "@blumi/contracts"
import type { DiscoverProfileRecord } from "./matchRepository"

export interface DiscoverySnapshotMeta {
  snapshotId: string; userId: string; filterHash: string; expiresAt: string; count: number
}
export interface DiscoverySnapshotRepository {
  create(input: { userId: string; filters: DiscoveryFilters; filterHash: string; now: Date }): Promise<DiscoverySnapshotMeta>
  get(snapshotId: string, userId: string, filterHash: string): Promise<DiscoverySnapshotMeta | null>
  read(input: { meta: DiscoverySnapshotMeta; filters: DiscoveryFilters; position: number; limit: number }): Promise<Array<{ position: number; profile: DiscoverProfileRecord | null }>>
  purgeExpired(): Promise<void>
}
export class DiscoveryCursorError extends Error {
  constructor(readonly code: "DISCOVERY_CURSOR_INVALID" | "DISCOVERY_CURSOR_EXPIRED") {
    super(code === "DISCOVERY_CURSOR_EXPIRED" ? "Discover cursor expired. Refresh Discover." : "Invalid Discover cursor. Refresh Discover.")
  }
}
export const DISCOVERY_ACTIVE_SNAPSHOT_LIMIT = 30
export class DiscoveryRefreshLimitError extends Error {
  readonly code = "DISCOVERY_REFRESH_LIMIT"
  constructor(readonly retryAfterSeconds: number) {
    super("Discover refresh limit reached. Keep browsing this list and try again later.")
  }
}
export type DiscoverySnapshotService = ReturnType<typeof createDiscoverySnapshotService>
export function discoveryFilterHash(filters: DiscoveryFilters): string {
  return createHash("sha256").update(JSON.stringify({ ageMin: filters.ageMin, ageMax: filters.ageMax,
    genders: [...new Set(filters.genders.map(v => v.trim().toLowerCase()))].sort(),
    vibes: [...new Set(filters.vibes.map(v => v.trim().toLowerCase()))].sort() })).digest("hex")
}
export function createDiscoverySnapshotService(repository: DiscoverySnapshotRepository) {
  return {
    purgeExpired: () => repository.purgeExpired(),
    async page(input: { userId: string; filters: DiscoveryFilters; limit: number; cursor?: string; now?: Date;
      blockedUserIds?: (ids: string[]) => Promise<string[]> }) {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) throw new RangeError("Invalid discovery page limit")
      const now = input.now ?? new Date(), filterHash = discoveryFilterHash(input.filters)
      const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor)
      const meta = cursor ? await repository.get(cursor.id, input.userId, filterHash) :
        await repository.create({ userId: input.userId, filters: input.filters, filterHash, now })
      if (!meta) throw new DiscoveryCursorError("DISCOVERY_CURSOR_INVALID")
      if (Date.parse(meta.expiresAt) <= now.getTime()) throw new DiscoveryCursorError("DISCOVERY_CURSOR_EXPIRED")
      let position = cursor?.position ?? 0
      if (position > meta.count) throw new DiscoveryCursorError("DISCOVERY_CURSOR_INVALID")
      const profiles: DiscoverProfileRecord[] = []
      let more = false
      // Bound scanning when many snapshot candidates become unavailable. The cursor
      // advances over unavailable IDs, never over a still-unseen lookahead profile.
      for (let batch = 0; batch < 8 && position < meta.count && !more; batch++) {
        const rows = await repository.read({ meta, filters: input.filters, position, limit: 61 })
        if (!rows.length) throw new DiscoveryCursorError("DISCOVERY_CURSOR_INVALID")
        const blocked = new Set(await input.blockedUserIds?.(rows.flatMap(r => r.profile ? [r.profile.userId] : [])) ?? [])
        for (const row of rows) {
          if (row.position !== position) throw new DiscoveryCursorError("DISCOVERY_CURSOR_INVALID")
          if (row.profile && !blocked.has(row.profile.userId)) {
            if (profiles.length === input.limit) { more = true; break }
            profiles.push(row.profile)
          }
          position = row.position + 1
        }
      }
      const hasMore = more || position < meta.count
      return { profiles, page: { hasMore, nextCursor: hasMore ? encodeCursor(meta.snapshotId, position) : null } }
    }
  }
}
function encodeCursor(id: string, position: number): string {
  return `v2.${Buffer.from(JSON.stringify({ id, position })).toString("base64url")}`
}
function decodeCursor(value: string): { id: string; position: number } {
  try {
    if (!/^v2\.[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error()
    const parsed = JSON.parse(Buffer.from(value.slice(3), "base64url").toString("utf8"))
    if (typeof parsed.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parsed.id) || !Number.isSafeInteger(parsed.position) || parsed.position < 0) throw new Error()
    return { id: parsed.id, position: parsed.position }
  } catch { throw new DiscoveryCursorError("DISCOVERY_CURSOR_INVALID") }
}

/** Development-only fixture repository. Production stores and slices IDs in SQL. */
export function createInMemoryDiscoverySnapshots(list: (userId: string, filters: DiscoveryFilters) => Promise<DiscoverProfileRecord[]>): DiscoverySnapshotRepository {
  const snapshots = new Map<string, { meta: DiscoverySnapshotMeta; ids: string[] }>()
  return {
    async create(input) {
      const ids = (await list(input.userId, input.filters)).map(p => p.userId)
      const active = [...snapshots.values()].filter(value => value.meta.userId === input.userId && Date.parse(value.meta.expiresAt) > input.now.getTime())
      if (active.length >= DISCOVERY_ACTIVE_SNAPSHOT_LIMIT) throw new DiscoveryRefreshLimitError(
        Math.max(1, Math.ceil((Math.min(...active.map(value => Date.parse(value.meta.expiresAt))) - input.now.getTime()) / 1000)))
      for (const [id,value] of snapshots) if (value.meta.userId === input.userId && Date.parse(value.meta.expiresAt) <= input.now.getTime()) snapshots.delete(id)
      const meta = { snapshotId: randomUUID(), userId: input.userId, filterHash: input.filterHash,
        expiresAt: new Date(input.now.getTime() + 30 * 60_000).toISOString(), count: ids.length }
      snapshots.set(meta.snapshotId, { meta, ids })
      return { ...meta }
    },
    async get(id, userId, filterHash) {
      const meta = snapshots.get(id)?.meta
      return meta?.userId === userId && meta.filterHash === filterHash ? { ...meta } : null
    },
    async read(input) {
      const current = new Map((await list(input.meta.userId, input.filters)).map(p => [p.userId, p]))
      return (snapshots.get(input.meta.snapshotId)?.ids ?? []).slice(input.position, input.position + input.limit)
        .map((id, index) => ({ position: input.position + index, profile: current.get(id) ?? null }))
    },
    async purgeExpired() {
      for (const [id, { meta }] of snapshots) if (Date.parse(meta.expiresAt) <= Date.now()) snapshots.delete(id)
    }
  }
}
