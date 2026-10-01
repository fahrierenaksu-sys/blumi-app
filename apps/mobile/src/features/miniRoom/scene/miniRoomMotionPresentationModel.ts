import type { MiniRoomAvatarMotion } from "@blumi/contracts"

/** What the scene has already shown of the authoritative room motion. */
export interface MiniRoomMotionPresentationCursor {
  snapKey: number
  sceneEpoch: number
  applied: ReadonlyMap<string, MiniRoomAvatarMotion>
}

export const INITIAL_MINI_ROOM_MOTION_PRESENTATION_CURSOR: MiniRoomMotionPresentationCursor = {
  snapKey: -1,
  sceneEpoch: -1,
  applied: new Map()
}

export interface MiniRoomMotionApplication {
  avatar: MiniRoomAvatarMotion
  /** Place exactly (join snapshot or rebuilt scene) instead of walking. */
  snap: boolean
}

/**
 * Decides which authoritative records the scene applies. A new join snapshot
 * or a rebuilt scene places both avatars at their latest records. Otherwise
 * only newer partner records are applied, as walks from the live position:
 * this phone already walked its own avatar, and a presence flap that leaves
 * a present partner at the same target must not restart its walk.
 */
export function planMiniRoomMotionPresentation(
  cursor: MiniRoomMotionPresentationCursor,
  input: {
    avatars: readonly MiniRoomAvatarMotion[]
    snapKey: number
    sceneEpoch: number
    localUserId: string
  }
): { apply: MiniRoomMotionApplication[]; cursor: MiniRoomMotionPresentationCursor } {
  const snap = input.snapKey !== cursor.snapKey || input.sceneEpoch !== cursor.sceneEpoch
  const applied = new Map(snap ? [] : cursor.applied)
  const apply: MiniRoomMotionApplication[] = []
  for (const avatar of input.avatars) {
    const previous = applied.get(avatar.userId)
    if (!snap && previous && avatar.revision <= previous.revision) continue
    applied.set(avatar.userId, avatar)
    if (snap) {
      apply.push({ avatar, snap: true })
      continue
    }
    if (avatar.userId === input.localUserId) continue
    if (previous?.present && avatar.present && previous.x === avatar.x &&
      previous.y === avatar.y && previous.hotspotId === avatar.hotspotId) continue
    apply.push({ avatar, snap: false })
  }
  return { apply, cursor: { snapKey: input.snapKey, sceneEpoch: input.sceneEpoch, applied } }
}
