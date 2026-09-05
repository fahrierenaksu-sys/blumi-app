import type { PersonalRoomDecorSnapshot } from "./personalRoomDecorRepository"
import {
  cloneRoomShowcaseSnapshot,
  createInMemoryRoomSnapshotRepository,
  roomSnapshotMatchesRoomRevision,
  type RoomShowcaseSnapshot,
  type RoomSnapshotRepository
} from "./roomSnapshotRepository"
import {
  createRoomSnapshotAssetKey,
  createRoomSnapshotRenderer,
  type RoomSnapshotRenderer
} from "./roomSnapshotRenderer"

export interface RoomSnapshotService {
  publishForRoomSave(
    room: PersonalRoomDecorSnapshot
  ): Promise<RoomShowcaseSnapshot>
  getLatestForUser(
    userId: string,
    room: PersonalRoomDecorSnapshot | null
  ): Promise<RoomShowcaseSnapshot | null>
  findByAssetKey(assetKey: string): Promise<RoomShowcaseSnapshot | null>
  setVisibilityForRoom(input: {
    userId: string
    room: PersonalRoomDecorSnapshot | null
    isPublic: boolean
    headline?: string | null
  }): Promise<RoomShowcaseSnapshot | null>
}

export function createRoomSnapshotService(options: {
  repository?: RoomSnapshotRepository
  renderer?: RoomSnapshotRenderer
  isPublicByDefault?: boolean
  onRenderError?: (error: unknown, room: PersonalRoomDecorSnapshot) => void
} = {}): RoomSnapshotService {
  const repository = options.repository ?? createInMemoryRoomSnapshotRepository()
  const renderer = options.renderer ?? createRoomSnapshotRenderer()
  const isPublicByDefault = options.isPublicByDefault ?? false

  return {
    async publishForRoomSave(room) {
      const current = await repository.getLatest(room.userId)
      if (roomSnapshotMatchesRoomRevision(current, room)) {
        return cloneRoomShowcaseSnapshot(current!)
      }
      try {
        const rendered = await renderer.render({
          decor: room.decor,
          roomRevision: room.revision
        })
        const snapshot: RoomShowcaseSnapshot = {
          userId: room.userId,
          roomRevision: room.revision,
          assetKey: createRoomSnapshotAssetKey(
            room.userId,
            room.revision,
            rendered.rendererVersion
          ),
          mimeType: rendered.mimeType,
          rendererVersion: rendered.rendererVersion,
          body: Buffer.from(rendered.body),
          // Insert defaults only: the repository atomically preserves existing
          // metadata so a preference accepted during render cannot be overwritten.
          isPublic: current?.isPublic ?? isPublicByDefault,
          headline: current?.headline ?? null,
          updatedAt: room.updatedAt
        }
        return repository.save(snapshot)
      } catch (error) {
        options.onRenderError?.(error, room)
        throw error
      }
    },
    async getLatestForUser(userId, room) {
      if (!room) return null
      const snapshot = await repository.getLatest(userId)
      return roomSnapshotMatchesRoomRevision(snapshot, room)
        ? cloneRoomShowcaseSnapshot(snapshot!)
        : null
    },
    async findByAssetKey(assetKey) {
      return repository.findByAssetKey(assetKey)
    },
    async setVisibilityForRoom({ userId, room, isPublic, headline }) {
      if (!room || room.userId !== userId) return null
      const current = await repository.getLatest(userId)
      if (!current || current.roomRevision !== room.revision) return null
      return repository.updateVisibility({
        userId,
        roomRevision: room.revision,
        isPublic,
        headline: normalizeRoomHeadline(headline)
      })
    }
  }
}

export function normalizeRoomHeadline(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ")
  if (!normalized) return null
  return Array.from(normalized).slice(0, 30).join("")
}
