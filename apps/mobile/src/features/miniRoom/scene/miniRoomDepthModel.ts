/**
 * MiniRoom depth (VIS-04 / ROOM-05): avatars sort against furniture by their
 * floor depth, so an avatar behind a sofa is drawn behind it and in front of
 * it when in front. The rule is My Room's (`compareRoomV2RenderItems`): layer
 * first, then floor depth (the item's floor pivot y, the avatar's feet y),
 * then render id. A seated avatar keeps its seat's render depth, just in
 * front of the furniture it sits on.
 *
 * Functions marked 'worklet' run on the UI thread so React hears only when an
 * avatar actually passes in front of or behind something.
 */
import {
  createMyRoomAvatarDepthNeighbours,
  getMyRoomAvatarDepthIndex,
  type MyRoomAvatarDepthNeighbour
} from "../../roomWorld/myRoomAvatarWalkModel"
import { createRoomWorldHotspotsFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import { compareRoomV2RenderItems } from "../../roomV2/roomV2Selectors"
import {
  ROOM_LAYER_ORDER,
  type ResolvedRoomV2Scene,
  type RoomV2FurnitureRenderItem
} from "../../roomV2/roomV2.types"

/** The render id the avatars share for depth ties (`avatar` sorts first on a tie). */
export const MINI_ROOM_AVATAR_DEPTH_RENDER_ID = "mini_room_avatar"

export interface MiniRoomDepthScene {
  /** Furniture drawn among the avatars, back to front. */
  occluders: readonly RoomV2FurnitureRenderItem[]
  /** Render ids the decor layer leaves to the avatar layer. */
  occluderIds: ReadonlySet<string>
  /** Each occluder reduced to what an avatar's depth is compared with. */
  neighbours: readonly MyRoomAvatarDepthNeighbour[]
  /** A seated avatar's fixed depth, by seat hotspot id. */
  seatDepthByHotspotId: Readonly<Record<string, number>>
}

export const EMPTY_MINI_ROOM_DEPTH_SCENE: MiniRoomDepthScene = Object.freeze({
  occluders: [],
  occluderIds: new Set<string>(),
  neighbours: [],
  seatDepthByHotspotId: {}
})

/**
 * Upright furniture on the avatars' layer or above can stand in front of an
 * avatar. Flat floor art (rugs) and wall or background art always stay
 * behind, so they remain in the decor layer.
 */
export function canMiniRoomFurnitureOccludeAvatars(item: RoomV2FurnitureRenderItem): boolean {
  return item.sceneProjection !== "floor_plane" &&
    ROOM_LAYER_ORDER[item.layer] >= ROOM_LAYER_ORDER.furniture
}

export function createMiniRoomDepthScene(scene: ResolvedRoomV2Scene | undefined): MiniRoomDepthScene {
  if (!scene?.shell) return EMPTY_MINI_ROOM_DEPTH_SCENE
  const occluders = scene.renderItems
    .filter((item): item is RoomV2FurnitureRenderItem =>
      item.kind === "furniture" && canMiniRoomFurnitureOccludeAvatars(item))
    .sort(compareRoomV2RenderItems)
  const seatDepthByHotspotId: Record<string, number> = {}
  for (const hotspot of createRoomWorldHotspotsFromRoomV2Scene(scene)) {
    if (hotspot.renderDepth !== undefined) seatDepthByHotspotId[hotspot.id] = hotspot.renderDepth
  }
  return {
    occluders,
    occluderIds: new Set(occluders.map((item) => item.renderId)),
    neighbours: createMyRoomAvatarDepthNeighbours(occluders, {
      layer: "furniture",
      renderId: MINI_ROOM_AVATAR_DEPTH_RENDER_ID
    }),
    seatDepthByHotspotId
  }
}

/**
 * The depth key of every avatar: each avatar's slot among the occluders (how
 * many it is drawn in front of), avatars ordered back to front. Equal keys
 * mean an equal draw order, so the UI thread hops to React only on a change.
 */
export function resolveMiniRoomDepthOrder(
  neighbours: readonly MyRoomAvatarDepthNeighbour[],
  avatars: readonly { id: string; depth: number; foot?: { x: number; y: number } }[]
): string {
  "worklet"
  // Feet on the floor compare with each footprint's front edge, exactly as
  // in My Room; a seated avatar keeps its seat's depth.
  const placed = avatars.map((avatar) => ({
    id: avatar.id,
    depth: avatar.depth,
    slot: avatar.foot
      ? getMyRoomAvatarDepthIndex(neighbours, avatar.depth, avatar.foot.x, avatar.foot.y)
      : getMyRoomAvatarDepthIndex(neighbours, avatar.depth)
  }))
  placed.sort((a, b) => a.slot !== b.slot ? a.slot - b.slot
    : a.depth !== b.depth ? a.depth - b.depth
      : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  let order = ""
  for (let index = 0; index < placed.length; index += 1) {
    const entry = placed[index]!
    order += `${index === 0 ? "" : "|"}${entry.id}@${entry.slot}`
  }
  return order
}

export interface MiniRoomDepthZIndices {
  avatars: Readonly<Record<string, number>>
  /** By occluder index (back to front). */
  occluders: readonly number[]
}

/**
 * Sibling z-indices for one depth order: occluder `i` sits at
 * (i + 1) × stride, and an avatar in slot `s` just above the occluders
 * behind it (s × stride + 1, + 1 per avatar already in that slot).
 */
export function resolveMiniRoomDepthZIndices(order: string, occluderCount: number): MiniRoomDepthZIndices {
  const entries = order.length === 0 ? [] : order.split("|").map((token) => {
    const at = token.lastIndexOf("@")
    return { id: token.slice(0, at), slot: Number(token.slice(at + 1)) }
  })
  const stride = entries.length + 1
  const avatars: Record<string, number> = {}
  let previousSlot = -1
  let rank = 0
  for (const entry of entries) {
    rank = entry.slot === previousSlot ? rank + 1 : 0
    previousSlot = entry.slot
    avatars[entry.id] = entry.slot * stride + 1 + rank
  }
  const occluders = Array.from({ length: occluderCount }, (_, index) => (index + 1) * stride)
  return { avatars, occluders }
}

/** The depth an avatar sorts by: its seat's while it holds one, else its feet. */
export function resolveMiniRoomAvatarSortDepth(
  liveY: number,
  seatDepth: number | undefined
): number {
  "worklet"
  return seatDepth ?? liveY
}
