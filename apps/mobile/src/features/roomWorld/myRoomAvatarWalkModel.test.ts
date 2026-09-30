import assert from "node:assert/strict"
import test from "node:test"
import type { RoomV2RenderItem } from "../roomV2/roomV2.types"
import { insertRoomV2RenderItemSorted } from "../roomV2/roomV2Selectors"
import {
  createMyRoomAvatarDepthNeighbours,
  createMyRoomWalkTimeline,
  getMyRoomAvatarDepthIndex,
  MY_ROOM_WALK_EASING
} from "./myRoomAvatarWalkModel"
import {
  easeOutRoomWorldMovement,
  getRoomWorldMovementFrame,
  type RoomWorldMovementPlan
} from "./roomWorldRuntime"

function renderItem(renderId: string, layer: RoomV2RenderItem["layer"], depth: number): RoomV2RenderItem {
  return { renderId, layer, depth, kind: "furniture" } as unknown as RoomV2RenderItem
}

const plan: RoomWorldMovementPlan = {
  target: { x: 0.6, y: 0.7 },
  path: [],
  segments: [
    { from: { x: 0.4, y: 0.5 }, to: { x: 0.5, y: 0.6 }, facing: "right", distance: 0.14, durationMs: 420, isFinal: false },
    { from: { x: 0.5, y: 0.6 }, to: { x: 0.6, y: 0.7 }, facing: "front", distance: 0.14, durationMs: 380, isFinal: true }
  ]
}

test("the UI-thread walk timeline keeps every segment's target and duration", () => {
  assert.deepEqual(createMyRoomWalkTimeline(plan), [
    { x: 0.5, y: 0.6, durationMs: 420 },
    { x: 0.6, y: 0.7, durationMs: 380 }
  ])
})

test("the UI-thread walk uses the same ease-out curve as the JS movement frame", () => {
  assert.equal(MY_ROOM_WALK_EASING, easeOutRoomWorldMovement)
  const segment = plan.segments[0]!
  for (const elapsed of [0, 60, 210, 333, 420]) {
    const frame = getRoomWorldMovementFrame({ segment, startedAt: 0, now: elapsed })
    const progress = MY_ROOM_WALK_EASING(elapsed / segment.durationMs)
    assert.ok(Math.abs(frame.x - (segment.from.x + (segment.to.x - segment.from.x) * progress)) < 1e-12)
    assert.ok(Math.abs(frame.y - (segment.from.y + (segment.to.y - segment.from.y) * progress)) < 1e-12)
  }
})

test("the UI-thread depth index matches the React render sort at every depth", () => {
  const items = [
    renderItem("rug", "floor", 0.6),
    renderItem("lamp", "furniture", 0.42),
    renderItem("bed", "furniture", 0.55),
    renderItem("a_chair", "furniture", 0.7),
    renderItem("zz_table", "furniture", 0.7),
    renderItem("plant", "furniture", 0.81),
    renderItem("curtain", "foreground", 0.1)
  ]
  const avatarRenderId = "my_room_owner_avatar"
  const neighbours = createMyRoomAvatarDepthNeighbours(items, { layer: "furniture", renderId: avatarRenderId })
  for (const depth of [0, 0.2, 0.42, 0.5, 0.55, 0.69, 0.7, 0.75, 0.81, 0.9, 1]) {
    const sorted = insertRoomV2RenderItemSorted(items, renderItem(avatarRenderId, "furniture", depth))
    assert.equal(
      getMyRoomAvatarDepthIndex(neighbours, depth),
      sorted.findIndex((item) => item.renderId === avatarRenderId),
      `depth ${depth}`
    )
  }
})
