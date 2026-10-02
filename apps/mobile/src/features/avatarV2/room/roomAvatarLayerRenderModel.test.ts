import assert from "node:assert/strict"
import test from "node:test"
import type { RoomV2AvatarRenderLayer } from "../../roomV2/roomV2.types"
import {
  getRoomAvatarFrameIndex,
  getRoomAvatarFrameTick,
  getRoomAvatarLayerAnimationState,
  getRoomAvatarLayerFrameAsset,
  getRoomAvatarLayerFrameSlot,
  getRoomAvatarReadyFrameSlot,
  retainRoomAvatarFrameSlots,
  getRoomAvatarLayerFrameSlots,
  shouldRerenderRoomAvatarLayer
} from "./roomAvatarLayerRenderModel"
import { ROOM_AVATAR_FRAME_DURATION_MS } from "./avatarRoomMotionContract"

const firstSource = 101
const secondSource = 102

function layer(source: number): RoomV2AvatarRenderLayer {
  return {
    id: "top",
    type: "top",
    layerOrder: 20,
    asset: { key: `top-${source}`, source },
    fitProfileId: "blumi_female_room_avatar_v1"
  }
}

test("fresh layer objects with the same image do not reload on position updates", () => {
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: layer(firstSource), frameIndex: 0 },
    { layer: layer(firstSource), frameIndex: 0 }
  ), false)
})

test("equipment and fit changes still update the visible layer", () => {
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: layer(firstSource), frameIndex: 0 },
    { layer: layer(secondSource), frameIndex: 0 }
  ), true)
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: layer(firstSource), frameIndex: 0 },
    { layer: { ...layer(firstSource), fitProfileId: "blumi_male_room_avatar_v1" }, frameIndex: 0 }
  ), true)
})

test("only a changed animation frame reloads an animated image", () => {
  const animated: RoomV2AvatarRenderLayer = {
    ...layer(firstSource),
    animation: {
      frames: [
        { key: "walk-1", source: firstSource },
        { key: "walk-2", source: secondSource }
      ],
      frameDurationMs: 120,
      loop: true
    }
  }
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: animated, frameIndex: 0 },
    { layer: { ...animated }, frameIndex: 1 }
  ), true)
  assert.equal(shouldRerenderRoomAvatarLayer(
    { layer: animated, frameIndex: 0 },
    { layer: { ...animated }, frameIndex: 2 }
  ), false)
})

function animatedLayer(id: string, keys: string[], frameDurationMs = 120, loop?: boolean): RoomV2AvatarRenderLayer {
  const frames = keys.map((key, index) => ({ key, source: 200 + index }))
  return {
    ...layer(firstSource),
    id,
    animation: {
      frames: frames as [typeof frames[number], ...typeof frames],
      frameDurationMs,
      ...(loop === undefined ? {} : { loop })
    }
  }
}

// The frame index the JS ticker renderer computed from a tick offset.
function previousFrameIndex(offset: number, frameCount: number, loops: boolean): number {
  return loops ? offset % frameCount : Math.min(offset, frameCount - 1)
}

test("animation state keeps the frame rate, frame count and loop rules", () => {
  const layers = [
    layer(firstSource),
    animatedLayer("hair", ["h1", "h2", "h3", "h4"], 150),
    animatedLayer("top", ["t1", "t2"], 120, false)
  ]
  assert.deepEqual(
    { ...getRoomAvatarLayerAnimationState(layers, true), signature: undefined },
    { hasAnimation: true, frameCount: 4, frameDurationMs: 120, loops: true, signature: undefined }
  )
  assert.equal(getRoomAvatarLayerAnimationState([animatedLayer("a", ["1", "2"], 40)], true).frameDurationMs, 80)
  assert.equal(getRoomAvatarLayerAnimationState([animatedLayer("a", ["1", "2"], 120, false)], true).loops, false)
  // Reduce Motion and static avatars never animate.
  assert.deepEqual(getRoomAvatarLayerAnimationState(layers, false), {
    hasAnimation: false,
    frameCount: 1,
    frameDurationMs: ROOM_AVATAR_FRAME_DURATION_MS,
    loops: false,
    signature: "static"
  })
  assert.equal(getRoomAvatarLayerAnimationState([layer(firstSource)], true).hasAnimation, false)
  assert.notEqual(
    getRoomAvatarLayerAnimationState([animatedLayer("a", ["1", "2"])], true).signature,
    getRoomAvatarLayerAnimationState([animatedLayer("a", ["1", "3"])], true).signature
  )
})

test("the UI-thread frame index follows the ticker's order for looping and one-shot motion", () => {
  for (const frameCount of [1, 2, 4, 6]) {
    for (const loops of [true, false]) {
      for (let offset = 0; offset < 20; offset += 1) {
        assert.equal(getRoomAvatarFrameIndex(offset, frameCount, loops), previousFrameIndex(offset, frameCount, loops))
      }
    }
  }
})

test("the UI-thread clock advances one frame per frame duration, from frame 0", () => {
  const frameDurationMs = 120
  const startedAt = 10_050
  const baseTick = getRoomAvatarFrameTick(startedAt, frameDurationMs)
  const shown: number[] = []
  for (let now = startedAt; now < startedAt + 1_000; now += 1000 / 60) {
    const index = getRoomAvatarFrameIndex(getRoomAvatarFrameTick(now, frameDurationMs) - baseTick, 4, true)
    if (shown.at(-1) !== index) shown.push(index)
  }
  assert.deepEqual(shown, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1])
  // Every change lands on a shared tick boundary, so avatars stay in phase.
  assert.equal(getRoomAvatarFrameTick(10_079.9, frameDurationMs), 83)
  assert.equal(getRoomAvatarFrameTick(10_080, frameDurationMs), 84)
})

test("frame slots mount each distinct image once and pick the ticker's asset for every frame", () => {
  const animated = animatedLayer("hair", ["f1", "f2", "f1", "f3"])
  animated.animation!.frames[2] = animated.animation!.frames[0]
  const slots = getRoomAvatarLayerFrameSlots(animated)
  assert.deepEqual(slots.assets.map((asset) => asset.key), ["f1", "f2", "f3"])
  for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
    assert.equal(
      slots.assets[getRoomAvatarLayerFrameSlot(slots.slotByFrame, frameIndex)],
      getRoomAvatarLayerFrameAsset(animated, frameIndex)
    )
  }
  const still = getRoomAvatarLayerFrameSlots(layer(firstSource))
  assert.deepEqual(still.assets, [layer(firstSource).asset])
  assert.deepEqual(still.slotByFrame, [0])
})

test("a frame that has not displayed keeps the previous loaded pose visible", () => {
  const slots = [0, 1, 2, 3]
  assert.equal(getRoomAvatarReadyFrameSlot(slots, 2, []), 0)
  assert.equal(getRoomAvatarReadyFrameSlot(slots, 2, [0, 1]), 0)
  assert.equal(getRoomAvatarReadyFrameSlot(slots, 2, [0, 2]), 2)
  // The caller can hold its selected pose, or defer the change with a sentinel.
  assert.equal(getRoomAvatarReadyFrameSlot([0], 3, []), 0)
  assert.equal(getRoomAvatarReadyFrameSlot(slots, 2, [0, 1], 1), 1)
  assert.equal(getRoomAvatarReadyFrameSlot([4], 0, [0, 1], -1), -1)
  assert.equal(getRoomAvatarReadyFrameSlot([4], 0, [0, 1, 4], -1), 4)
})

test("idle and walking keep the same mounted image identities across stop and restart", () => {
  const idle = layer(firstSource).asset
  const walking = animatedLayer("top", ["w1", "w2", "w3", "w4"]).animation!.frames
  const initial = retainRoomAvatarFrameSlots([], [idle])
  const walk = retainRoomAvatarFrameSlots(initial.assets, walking)
  assert.equal(walk.assets[0], idle)
  assert.deepEqual(walk.slotByFrame, [1, 2, 3, 4])
  assert.deepEqual(initial.assets, [idle])
  const stopped = retainRoomAvatarFrameSlots(walk.assets, [idle])
  assert.equal(stopped.assets, walk.assets)
  assert.deepEqual(stopped.slotByFrame, [0])
  const restarted = retainRoomAvatarFrameSlots(stopped.assets, walking)
  assert.equal(restarted.assets, stopped.assets)
  assert.deepEqual(restarted.slotByFrame, walk.slotByFrame)
  const repeated = retainRoomAvatarFrameSlots(restarted.assets, [walking[0]!, walking[0]!])
  assert.equal(repeated.assets, restarted.assets)
  assert.deepEqual(repeated.slotByFrame, [1, 1])
})
