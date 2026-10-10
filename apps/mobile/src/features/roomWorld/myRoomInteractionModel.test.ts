import assert from "node:assert/strict"
import test from "node:test"
import {
  getMyRoomWalkActionTarget,
  getWideStageRendererTranslateY,
  MY_ROOM_MOVEMENT_NO_OP_DISTANCE,
  MY_ROOM_WALK_ACTION_TARGETS
} from "./myRoomInteractionModel"
import type { RoomWorldGeometry } from "./roomWorldGeometry"

const openRoom: RoomWorldGeometry = {
  walkableAreas: [
    {
      id: "room",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]
    }
  ],
  blockers: []
}

test("my room walk action chooses a reachable non-no-op target", () => {
  const from = { x: 0.47, y: 0.84 }
  const target = getMyRoomWalkActionTarget({ geometry: openRoom, from })

  assert.ok(target)
  assert.ok(MY_ROOM_WALK_ACTION_TARGETS.some((candidate) =>
    candidate.x === target.x && candidate.y === target.y
  ))
  assert.ok(Math.hypot(target.x - from.x, target.y - from.y) > MY_ROOM_MOVEMENT_NO_OP_DISTANCE)
})

test("my room walk action skips targets blocked by authored room geometry", () => {
  const geometry: RoomWorldGeometry = {
    ...openRoom,
    blockers: [{ id: "block-right", x: 0.72, y: 0.86, width: 0.20, height: 0.18 }]
  }
  const target = getMyRoomWalkActionTarget({
    geometry,
    from: { x: 0.47, y: 0.84 }
  })

  assert.ok(target)
  assert.notDeepEqual(target, { x: 0.72, y: 0.86 })
})

test("wide stage camera keeps avatar feet inside the authored lower-third", () => {
  const input = {
    stageWidth: 720,
    stageHeight: 420,
    shellCanvasWidth: 1024,
    shellCanvasHeight: 768,
    avatarWorldY: 0.84
  }
  const translateY = getWideStageRendererTranslateY(input)
  const rendererHeight = input.stageWidth * input.shellCanvasHeight / input.shellCanvasWidth
  const rendererTop = (input.stageHeight - rendererHeight) / 2 + translateY
  const feetY = rendererTop + rendererHeight * input.avatarWorldY

  assert.ok(translateY <= 0)
  assert.ok(feetY >= input.stageHeight * 2 / 3 && feetY <= input.stageHeight, `feet at ${feetY}`)
  // The shell always covers the stage: no edge is revealed above or below.
  assert.ok(rendererTop <= 0.5)
  assert.ok(rendererTop + rendererHeight >= input.stageHeight - 0.5)
})
