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

/**
 * A snapshot without its image (2026-10-02). Only serving the image needs
 * the ~27 KB body; revision checks, visibility changes and Discovery read
 * the metadata, so they never pull the body out of the database.
 */
export type RoomShowcaseSnapshotMetadata = Omit<RoomShowcaseSnapshot, "body">

export interface RoomSnapshotRepository {
  getLatest(userId: string): Promise<RoomShowcaseSnapshotMetadata | null>
  /** The only read that returns the image body. */
  findByAssetKey(assetKey: string): Promise<RoomShowcaseSnapshot | null>
  /** Publish render content; existing visibility/headline remain authoritative. */
  save(input: RoomShowcaseSnapshot): Promise<RoomShowcaseSnapshotMetadata>
  updateVisibility(input: {
    userId: string
    roomRevision: number
    isPublic: boolean
    headline: string | null
  }): Promise<RoomShowcaseSnapshotMetadata | null>
}

export function createInMemoryRoomSnapshotRepository(): RoomSnapshotRepository {
  let snapshots = new Map<string, RoomShowcaseSnapshot>()

  return {
    async getLatest(userId) {
      const snapshot = snapshots.get(userId)
      return snapshot ? toRoomShowcaseMetadata(snapshot) : null
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
        return toRoomShowcaseMetadata(current)
      }
      const next = cloneRoomShowcaseSnapshot({
        ...input,
        isPublic: current?.isPublic ?? input.isPublic,
        headline: current ? current.headline : input.headline
      })
      snapshots = new Map(snapshots)
      snapshots.set(next.userId, next)
      return toRoomShowcaseMetadata(next)
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
      return toRoomShowcaseMetadata(next)
    }
  }
}

export function toRoomShowcaseMetadata(snapshot: RoomShowcaseSnapshotMetadata): RoomShowcaseSnapshotMetadata {
  return {
    userId: snapshot.userId,
    roomRevision: snapshot.roomRevision,
    assetKey: snapshot.assetKey,
    mimeType: snapshot.mimeType,
    rendererVersion: snapshot.rendererVersion,
    isPublic: snapshot.isPublic,
    headline: snapshot.headline ?? null,
    updatedAt: snapshot.updatedAt
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
  snapshot: RoomShowcaseSnapshotMetadata | null,
  room: PersonalRoomDecorSnapshot
): boolean {
  return Boolean(
    snapshot &&
    snapshot.userId === room.userId &&
    snapshot.roomRevision === room.revision
  )
}
