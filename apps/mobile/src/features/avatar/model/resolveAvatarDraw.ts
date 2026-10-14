import { coerceAvatarLoadout, type AvatarItemRules } from "@blumi/domain"
import type { RoomWorldMovementTiming } from "../../roomWorld/roomWorldRuntime"
import { isRig25LowerBodySlot, type Rig25, type Rig25ItemSlot, type Rig25Motion } from "../renderer/rigTypes"
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

/**
 * The rig item drawing this canonical ID in this view, if the body has art for it (and walk cards where needed).
 * With `slots`, only art worn as one of those slots counts.
 */
/** Canonical item ID → rig item, per body (`AVATAR_ITEM_ART`; tests pass their own). */
type AvatarItemArtMap = Readonly<Record<AvatarRigId, Readonly<Record<string, string>>>>

function rigItemFor(
  rig: Rig25,
  rigId: AvatarRigId,
  view: "front" | "back",
  canonicalId: string | null | undefined,
  art: AvatarItemArtMap,
  slots?: readonly Rig25ItemSlot[]
): string | null {
  const rigItemId = canonicalId ? art[rigId][canonicalId] : undefined
  const item = rigItemId ? rig.views[view].items[rigItemId] : undefined
  if (!rigItemId || !item) return null
  if (slots && !slots.includes(item.slot)) return null
  // with painted walk frames, a lower-body item without its own walk cards would vanish mid-walk
  const paintedWalk = rig.views[view].walk.frames.length > 0
  if (paintedWalk && isRig25LowerBodySlot(item.slot) && !item.hasWalk) return null
  return rigItemId
}

/**
 * The worn one-piece dress, glasses and accessories this body has rig art for (DESIGN slots_2140 §5): the dress
 * replaces the top and the bottom, then glasses, then accessories by canonical ID. A look without them adds nothing.
 */
function newKindItems(
  rig: Rig25,
  rigId: AvatarRigId,
  view: "front" | "back",
  loadout: ReturnType<typeof coerceAvatarLoadout>,
  art: AvatarItemArtMap
) {
  const dress = rigItemFor(rig, rigId, view, loadout.schemaVersion === 2 ? loadout.dressId : null, art, ["dress"])
  const worn = [...loadout.accessoryIds].sort()
  const glasses = worn.map((id) => rigItemFor(rig, rigId, view, id, art, ["glasses"])).find((id) => id !== null) ?? null
  const accessories = worn.map((id) => rigItemFor(rig, rigId, view, id, art, ["accessory"])).filter((id): id is string => id !== null)
  return { dress, extra: [...(dress ? [dress] : []), ...(glasses ? [glasses] : []), ...accessories] }
}

/**
 * The drawing for anyone's avatar (the owner's or a remote participant's). Total: never null, never throws.
 * 1. The loadout is coerced by the domain rule (`coerceAvatarLoadout`, the same one the server reads with), so a
 *    remote snapshot with unknown, retired or other-body IDs still resolves.
 * 2. Draw-only: a slot whose item has no rig art for that body is drawn as the body's rig starter piece. A worn
 *    one-piece dress with rig art is drawn instead of the top and the bottom (without art, the separates stored under
 *    it are drawn); glasses and accessories with rig art are added; outerwear is not drawn. The stored loadout never
 *    changes.
 */
export function resolveAvatarDraw(
  rigs: Readonly<Record<AvatarRigId, Rig25>>,
  input: AvatarDrawInput,
  /** Test seam: the item art map and the item rules coercion reads (default: the live ones). */
  options: { readonly art?: AvatarItemArtMap; readonly rules?: AvatarItemRules } = {}
): AvatarDrawSpec {
  const art = options.art ?? AVATAR_ITEM_ART
  const loadout = coerceAvatarLoadout(input.loadout, input.hints ?? {}, options.rules)
  const rigId = avatarRigForBody(loadout.bodyId)
  const rig = rigs[rigId]
  const { view, mirror } = toView(input.direction)
  const { dress, extra } = newKindItems(rig, rigId, view, loadout, art)
  const itemIds: string[] = []
  for (const slot of AVATAR_ART_SLOTS) {
    if (dress && (slot === "top" || slot === "bottom")) continue
    const worn = rigItemFor(rig, rigId, view, loadout[SLOT_KEY[slot]], art)
    const drawn = worn ?? rigItemFor(rig, rigId, view, AVATAR_RIG_STARTER[rigId][slot], art)
    if (drawn) itemIds.push(drawn)
  }
  itemIds.push(...extra)
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
