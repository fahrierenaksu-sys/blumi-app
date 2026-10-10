import { coerceAvatarLoadout } from "@blumi/domain"
import type { RoomWorldMovementTiming } from "../../roomWorld/roomWorldRuntime"
import type { Rig25, Rig25Motion } from "../renderer/rigTypes"
import type { AvatarDrawInput, AvatarDrawSpec, AvatarPose, AvatarRigId } from "./avatarRoomContract"
import { AVATAR_ART_SLOTS, AVATAR_ITEM_ART, AVATAR_RIG_STARTER, avatarRigForBody, type AvatarArtSlot } from "./avatarItemArt"

const SLOT_KEY: Readonly<Record<AvatarArtSlot, "shoesId" | "bottomId" | "topId" | "hairId">> = {
  shoes: "shoesId",
  bottom: "bottomId",
  top: "topId",
  hair: "hairId"
}

function toPose(state: AvatarDrawInput["state"]): AvatarPose {
  if (state === "walking") return "walk"
  if (state === "sitting") return "sit"
  if (state === "waving") return "wave"
  // no 2.5D dance (F17): every other state stands
  return "stand"
}

/**
 * Which drawing faces which way. The art has two views (3/4 front facing bottom-left, 3/4 back facing
 * top-right); the other diagonals are their mirrors. Left = front, right = mirrored front, back = back.
 */
function toView(direction: AvatarDrawInput["direction"]): Pick<AvatarDrawSpec, "view" | "mirror"> {
  if (direction === "back") return { view: "back", mirror: false }
  if (direction === "right") return { view: "front", mirror: true }
  return { view: "front", mirror: false }
}

/** The rig item drawing this canonical ID in this view, if the body has art for it (and walk cards where needed). */
function rigItemFor(rig: Rig25, rigId: AvatarRigId, view: "front" | "back", canonicalId: string | undefined): string | null {
  const rigItemId = canonicalId ? AVATAR_ITEM_ART[rigId][canonicalId] : undefined
  const art = rigItemId ? rig.views[view].items[rigItemId] : undefined
  if (!rigItemId || !art) return null
  // with painted walk frames, a lower-body item without its own walk cards would vanish mid-walk
  const paintedWalk = rig.views[view].walk.frames.length > 0
  if (paintedWalk && (art.slot === "bottom" || art.slot === "shoes") && !art.hasWalk) return null
  return rigItemId
}

/**
 * The drawing for anyone's avatar (the owner's or a remote participant's). Total: never null, never throws.
 * 1. The loadout is coerced by the domain rule (`coerceAvatarLoadout`, the same one the server reads with), so a
 *    remote snapshot with unknown, retired or other-body IDs still resolves.
 * 2. Draw-only: a slot whose item has no rig art for that body is drawn as the body's rig starter piece; dresses,
 *    outerwear and accessories have no rig art yet and are not drawn. The stored loadout never changes.
 */
export function resolveAvatarDraw(rigs: Readonly<Record<AvatarRigId, Rig25>>, input: AvatarDrawInput): AvatarDrawSpec {
  const loadout = coerceAvatarLoadout(input.loadout, input.hints ?? {})
  const rigId = avatarRigForBody(loadout.bodyId)
  const rig = rigs[rigId]
  const { view, mirror } = toView(input.direction)
  const itemIds: string[] = []
  for (const slot of AVATAR_ART_SLOTS) {
    const worn = rigItemFor(rig, rigId, view, loadout[SLOT_KEY[slot]])
    const drawn = worn ?? rigItemFor(rig, rigId, view, AVATAR_RIG_STARTER[rigId][slot])
    if (drawn) itemIds.push(drawn)
  }
  return { rig: rigId, view, mirror, pose: toPose(input.state), itemIds }
}

/** How long the walk accelerates at its start and decelerates at its end, whatever the distance (ms each). */
export const AVATAR_WALK_EASE_MS = 100

/**
 * The app's walk timing at the lab's 2.5D walking speed: the cruise pace takes baseWalkSpeed / walkSpeed longer
 * (0.75 vs 1.15 → ×1.53). The start and stop ease is a short fixed time (not a share of the distance) and there is
 * no minimum walk length, so a one-tile hop moves at the same speed as a walk across the room.
 */
export function scaleAvatarMovementTiming(base: RoomWorldMovementTiming, motion: Rig25Motion): RoomWorldMovementTiming {
  const slow = motion.baseWalkSpeed / motion.walkSpeed
  if (!(slow > 0)) return base
  const durationPerDistanceMs = base.durationPerDistanceMs * slow
  return {
    durationPerDistanceMs,
    maxWalkDurationMs: base.maxWalkDurationMs * slow,
    // an ease phase lasts 2 × rampDistance × pace (constant acceleration over a ramp of rampDistance room units)
    rampDistance: AVATAR_WALK_EASE_MS / (2 * durationPerDistanceMs)
  }
}

/** The walk timing of one body: `scaleAvatarMovementTiming` at that body's own pace (`walkSpeed`, u/s). */
export function resolveAvatarMovementTiming(
  base: RoomWorldMovementTiming,
  rig: Rig25,
  walkSpeed: number
): RoomWorldMovementTiming {
  return scaleAvatarMovementTiming(base, { ...rig.motion, walkSpeed })
}

/** Below this share of the move going up the screen, a sideways move still shows the front drawing (lab40). */
const TRAVEL_BACK_SHARE = 0.05

/**
 * The drawing for an on-screen move (screen px, y down), quantized to the four drawn diagonals: down-left = front,
 * down-right = front mirrored, up-right = back, up-left = back mirrored (the back drawing faces top-right). Like
 * lab40 pickView, a sideways move faces the camera. Returns -1 for view when the move is too small to tell.
 */
export function avatar25TravelFacing(dx: number, dy: number): { view: 0 | 1 | -1; mirror: boolean } {
  "worklet"
  const length = Math.hypot(dx, dy)
  if (!(length > 0.5)) return { view: -1, mirror: false }
  const back = dy < -TRAVEL_BACK_SHARE * length
  return back ? { view: 1, mirror: dx < 0 } : { view: 0, mirror: dx > 0 }
}
