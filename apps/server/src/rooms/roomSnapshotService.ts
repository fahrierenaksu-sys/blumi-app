import type { PersonalRoomDecorSnapshot } from "./personalRoomDecorRepository"
import {
  createInMemoryRoomSnapshotRepository,
  roomSnapshotMatchesRoomRevision,
  roomSnapshotRendererGeneration,
  toRoomShowcaseMetadata,
  type RoomShowcaseSnapshot,
  type RoomShowcaseSnapshotMetadata,
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
  ): Promise<RoomShowcaseSnapshotMetadata>
  getLatestForUser(
    userId: string,
    room: PersonalRoomDecorSnapshot | null
  ): Promise<RoomShowcaseSnapshotMetadata | null>
  findByAssetKey(assetKey: string): Promise<RoomShowcaseSnapshot | null>
  setVisibilityForRoom(input: {
    userId: string
    room: PersonalRoomDecorSnapshot | null
    isPublic: boolean
    headline?: string | null
  }): Promise<RoomShowcaseSnapshotMetadata | null>
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
  // a snapshot drawn by another renderer version (the old flat room) is never served
  const isCurrent = (snapshot: { rendererVersion: string } | null) =>
    snapshot !== null && (renderer.version === undefined || snapshot.rendererVersion === renderer.version)
  // ...and one this revision drew with an older renderer is redrawn the first time it is read (M3), so users who
  // never save again keep their Discover picture. A newer renderer's row (rolling deploy) is left alone.
  const isRedrawnOnRead = (snapshot: RoomShowcaseSnapshotMetadata | null, room: PersonalRoomDecorSnapshot) =>
    snapshot !== null &&
    renderer.version !== undefined &&
    roomSnapshotMatchesRoomRevision(snapshot, room) &&
    roomSnapshotRendererGeneration(snapshot.rendererVersion) < roomSnapshotRendererGeneration(renderer.version)
  // one redraw per user at a time: concurrent Discover reads share it
  const readRedraws = new Map<string, Promise<RoomShowcaseSnapshotMetadata | null>>()

  async function draw(
    room: PersonalRoomDecorSnapshot,
    current: RoomShowcaseSnapshotMetadata | null
  ): Promise<RoomShowcaseSnapshotMetadata> {
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
      return await repository.save(snapshot)
    } catch (error) {
      options.onRenderError?.(error, room)
      throw error
    }
  }

  function redrawOnRead(
    room: PersonalRoomDecorSnapshot,
    stale: RoomShowcaseSnapshotMetadata
  ): Promise<RoomShowcaseSnapshotMetadata | null> {
    const pending = readRedraws.get(room.userId)
    if (pending) return pending
    const redraw = draw(room, stale)
      .then((saved) => (isCurrent(saved) && roomSnapshotMatchesRoomRevision(saved, room) ? saved : null))
      // reported through onRenderError in draw; a read never fails because a picture could not be drawn
      .catch(() => null)
      .finally(() => { readRedraws.delete(room.userId) })
    readRedraws.set(room.userId, redraw)
    return redraw
  }

  return {
    async publishForRoomSave(room) {
      const current = await repository.getLatest(room.userId)
      if (isCurrent(current) && roomSnapshotMatchesRoomRevision(current, room)) {
        return toRoomShowcaseMetadata(current!)
      }
      return draw(room, current)
    },
    async getLatestForUser(userId, room) {
      if (!room) return null
      const snapshot = await repository.getLatest(userId)
      if (isCurrent(snapshot) && roomSnapshotMatchesRoomRevision(snapshot, room)) {
        return toRoomShowcaseMetadata(snapshot!)
      }
      return isRedrawnOnRead(snapshot, room) ? redrawOnRead(room, snapshot!) : null
    },
    async findByAssetKey(assetKey) {
      const snapshot = await repository.findByAssetKey(assetKey)
      return isCurrent(snapshot) ? snapshot : null
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
