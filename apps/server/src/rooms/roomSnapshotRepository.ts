import type { PersonalRoomDecorSnapshot } from "./personalRoomDecorRepository"

export interface RoomShowcaseSnapshot {
  userId: string
  roomRevision: number
  assetKey: string
  mimeType: "image/webp"
  rendererVersion: string
  body: Buffer
  isPublic: boolean
  headline: string | null
  updatedAt: string
}

export interface RoomSnapshotRepository {
  getLatest(userId: string): Promise<RoomShowcaseSnapshot | null>
  findByAssetKey(assetKey: string): Promise<RoomShowcaseSnapshot | null>
  /** Publish render content; existing visibility/headline remain authoritative. */
  save(input: RoomShowcaseSnapshot): Promise<RoomShowcaseSnapshot>
  updateVisibility(input: {
    userId: string
    roomRevision: number
    isPublic: boolean
    headline: string | null
  }): Promise<RoomShowcaseSnapshot | null>
}

export function createInMemoryRoomSnapshotRepository(): RoomSnapshotRepository {
  let snapshots = new Map<string, RoomShowcaseSnapshot>()

  return {
    async getLatest(userId) {
      const snapshot = snapshots.get(userId)
      return snapshot ? cloneRoomShowcaseSnapshot(snapshot) : null
    },
    async findByAssetKey(assetKey) {
      for (const snapshot of snapshots.values()) {
        if (snapshot.assetKey === assetKey) return cloneRoomShowcaseSnapshot(snapshot)
      }
      return null
    },
    async save(input) {
      const current = snapshots.get(input.userId)
      if (current && current.roomRevision >= input.roomRevision) {
        return cloneRoomShowcaseSnapshot(current)
      }
      const next = cloneRoomShowcaseSnapshot({
        ...input,
        isPublic: current?.isPublic ?? input.isPublic,
        headline: current ? current.headline : input.headline
      })
      snapshots = new Map(snapshots)
      snapshots.set(next.userId, next)
      return cloneRoomShowcaseSnapshot(next)
    },
    async updateVisibility(input) {
      const current = snapshots.get(input.userId)
      if (!current || current.roomRevision !== input.roomRevision) return null
      const next = cloneRoomShowcaseSnapshot({
        ...current,
        isPublic: input.isPublic,
        headline: input.headline
      })
      snapshots = new Map(snapshots)
      snapshots.set(next.userId, next)
      return cloneRoomShowcaseSnapshot(next)
    }
  }
}

export function cloneRoomShowcaseSnapshot(
  snapshot: RoomShowcaseSnapshot
): RoomShowcaseSnapshot {
  return {
    ...snapshot,
    headline: snapshot.headline ?? null,
    body: Buffer.from(snapshot.body)
  }
}

export function roomSnapshotMatchesRoomRevision(
  snapshot: RoomShowcaseSnapshot | null,
  room: PersonalRoomDecorSnapshot
): boolean {
  return Boolean(
    snapshot &&
    snapshot.userId === room.userId &&
    snapshot.roomRevision === room.revision
  )
}
