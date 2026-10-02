import assert from "node:assert/strict"
import test from "node:test"
import type { ResolvedRoomV2Scene, RoomV2FurnitureRenderItem } from "../../roomV2/roomV2.types"
import {
  createMiniRoomDepthScene,
  resolveMiniRoomAvatarSortDepth,
  resolveMiniRoomDepthOrder,
  resolveMiniRoomDepthZIndices
} from "./miniRoomDepthModel"

function furniture(renderId: string, y: number, patch: Partial<RoomV2FurnitureRenderItem> = {}): RoomV2FurnitureRenderItem {
  return {
    renderId, kind: "furniture", layer: "furniture", depth: y, x: 0.5, y, width: 0.2, height: 0.2,
    anchor: { x: 0.5, y: 1 }, itemId: renderId, name: renderId, category: "seating",
    asset: { id: renderId, source: 1 }, rotation: "front", usesMirroredRotation: false,
    blocksMovement: true, interactionType: "none", ...patch
  } as RoomV2FurnitureRenderItem
}

const sofa = furniture("sofa", 0.6, { interactionType: "seat" })
const table = furniture("table", 0.72)
const rug = furniture("rug", 0.8, { sceneProjection: "floor_plane" })
const shelf = furniture("shelf", 0.3, { layer: "wall" })
const scene = {
  shell: { id: "shell", canvasSize: { width: 1254, height: 714 } },
  renderItems: [table, rug, shelf, sofa]
} as unknown as ResolvedRoomV2Scene

/** Draw order back to front, as the z-indices put it on screen. */
function drawOrder(avatars: { id: string; depth: number }[]) {
  const depth = createMiniRoomDepthScene(scene)
  const z = resolveMiniRoomDepthZIndices(resolveMiniRoomDepthOrder(depth.neighbours, avatars), depth.occluders.length)
  const entries = [
    ...depth.occluders.map((item, index) => ({ name: item.renderId, z: z.occluders[index]! })),
    ...avatars.map((avatar) => ({ name: avatar.id, z: z.avatars[avatar.id]! }))
  ]
  assert.equal(new Set(entries.map(({ z: value }) => value)).size, entries.length, "no two siblings share a z-index")
  return entries.sort((a, b) => a.z - b.z).map(({ name }) => name)
}

test("only upright furniture on the avatars' layer can stand in front of an avatar", () => {
  const depth = createMiniRoomDepthScene(scene)
  assert.deepEqual(depth.occluders.map((item) => item.renderId), ["sofa", "table"], "back to front")
  assert.equal(depth.occluderIds.has("rug"), false, "a rug lies flat under everyone")
  assert.equal(depth.occluderIds.has("shelf"), false, "wall art stays behind")
  assert.ok(Object.keys(depth.seatDepthByHotspotId).every((id) => id.startsWith("sofa:")))
  assert.deepEqual(createMiniRoomDepthScene(undefined).occluders, [])
})

test("an avatar walking behind a sofa is drawn behind it, and in front once it passes it", () => {
  assert.deepEqual(drawOrder([{ id: "me", depth: 0.5 }]), ["me", "sofa", "table"])
  assert.deepEqual(drawOrder([{ id: "me", depth: 0.65 }]), ["sofa", "me", "table"])
  assert.deepEqual(drawOrder([{ id: "me", depth: 0.85 }]), ["sofa", "table", "me"])
})

test("two avatars keep their own depth order between the same pieces of furniture", () => {
  assert.deepEqual(drawOrder([{ id: "b", depth: 0.68 }, { id: "a", depth: 0.64 }]), ["sofa", "a", "b", "table"])
  assert.deepEqual(drawOrder([{ id: "b", depth: 0.5 }, { id: "a", depth: 0.9 }]), ["b", "sofa", "table", "a"])
  // A tie sorts by id, so both phones draw the same order.
  assert.deepEqual(drawOrder([{ id: "b", depth: 0.65 }, { id: "a", depth: 0.65 }]), ["sofa", "a", "b", "table"])
})

test("a seated avatar keeps its seat's depth: in front of its sofa, behind the table before it", () => {
  const depth = createMiniRoomDepthScene(scene)
  const [seatId] = Object.keys(depth.seatDepthByHotspotId)
  const seatDepth = depth.seatDepthByHotspotId[seatId!]
  // The seat point itself lies behind the sofa's floor pivot.
  const seatedY = 0.55
  assert.deepEqual(drawOrder([{ id: "me", depth: resolveMiniRoomAvatarSortDepth(seatedY, seatDepth) }]), ["sofa", "me", "table"])
  assert.deepEqual(drawOrder([{ id: "me", depth: resolveMiniRoomAvatarSortDepth(seatedY, undefined) }]), ["me", "sofa", "table"])
})

test("draw order changes only when one avatar passes the other (was every frame)", () => {
  const orders: string[] = []
  let previous: string | null = null
  // In a room without furniture the partner walks from behind the local avatar to in front of it.
  for (let frame = 0; frame <= 60; frame += 1) {
    const order = resolveMiniRoomDepthOrder([], [{ id: "local", depth: 0.7 }, { id: "partner", depth: 0.55 + frame * 0.005 }])
    if (order !== previous) orders.push(order)
    previous = order
  }
  assert.equal(orders.length, 2, "one flip, so one React update for 61 frames")
  const before = resolveMiniRoomDepthZIndices(orders[0]!, 0).avatars
  const after = resolveMiniRoomDepthZIndices(orders[1]!, 0).avatars
  assert.ok(before.partner! < before.local!)
  assert.ok(after.partner! > after.local!)
})

test("the order key changes only when the draw order changes", () => {
  const { neighbours } = createMiniRoomDepthScene(scene)
  const key = (meY: number, partnerY: number) => resolveMiniRoomDepthOrder(neighbours, [
    { id: "me", depth: meY }, { id: "partner", depth: partnerY }
  ])
  assert.equal(key(0.61, 0.8), key(0.7, 0.8), "walking between the sofa and the table")
  assert.notEqual(key(0.7, 0.8), key(0.75, 0.8), "passing the table")
  assert.notEqual(key(0.62, 0.64), key(0.66, 0.64), "passing the other avatar")
})
