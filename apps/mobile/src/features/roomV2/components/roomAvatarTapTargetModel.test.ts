import assert from "node:assert/strict"
import test from "node:test"
import { MY_ROOM_AVATAR_SIZE } from "../../roomWorld/myRoomInteractionModel"
import { getRoomAvatarTapTarget, ROOM_AVATAR_MIN_TAP_TARGET_PT } from "./roomAvatarTapTargetModel"

function contains(target: ReturnType<typeof getRoomAvatarTapTarget>, x: number, y: number): boolean {
  return x >= target.left && x <= target.left + target.width && y >= target.top && y <= target.top + target.height
}

// Phone stages from a 320 pt to a 430 pt wide screen.
const BOXES = [320, 390, 430].flatMap((stageWidth) => [
  { width: MY_ROOM_AVATAR_SIZE.compact.width * stageWidth, height: MY_ROOM_AVATAR_SIZE.compact.height * stageWidth * 1.08 },
  { width: MY_ROOM_AVATAR_SIZE.wide.width * stageWidth * 1.4, height: MY_ROOM_AVATAR_SIZE.wide.height * stageWidth * 1.08 }
])

test("a floor tap right beside the avatar's figure is not an avatar tap (it walks there)", () => {
  for (const box of BOXES) {
    const target = getRoomAvatarTapTarget(box.width, box.height)
    // Beside the feet and beside the waist, in the transparent sides of the frame canvas.
    for (const y of [0.88, 0.7]) {
      assert.equal(contains(target, box.width * 0.1, box.height * y), false, `left of the figure in ${box.width}×${box.height}`)
      assert.equal(contains(target, box.width * 0.9, box.height * y), false, `right of the figure in ${box.width}×${box.height}`)
    }
  }
})

test("tapping the figure itself still taps the avatar, with a comfortable target", () => {
  for (const box of BOXES) {
    const target = getRoomAvatarTapTarget(box.width, box.height)
    for (const [x, y] of [[0.5, 0.3], [0.5, 0.6], [0.5, 0.88], [0.35, 0.7], [0.65, 0.7]] as const) {
      assert.ok(contains(target, box.width * x, box.height * y), `figure point ${x},${y} in ${box.width}×${box.height}`)
    }
    assert.ok(target.width >= Math.min(box.width, ROOM_AVATAR_MIN_TAP_TARGET_PT))
    assert.ok(target.height >= Math.min(box.height, ROOM_AVATAR_MIN_TAP_TARGET_PT))
    assert.ok(target.left >= 0 && target.left + target.width <= box.width + 1e-9)
    assert.ok(target.top >= 0 && target.top + target.height <= box.height + 1e-9)
  }
})

test("a box smaller than a finger keeps the whole box as the target", () => {
  assert.deepEqual(getRoomAvatarTapTarget(30, 40), { left: 0, top: 0, width: 30, height: 40 })
  assert.deepEqual(getRoomAvatarTapTarget(0, 0), { left: 0, top: 0, width: 0, height: 0 })
})
