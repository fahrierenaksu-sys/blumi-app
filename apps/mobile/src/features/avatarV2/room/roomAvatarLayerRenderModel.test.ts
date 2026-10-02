import assert from "node:assert/strict"
import test from "node:test"
import type { RoomV2AssetCrop, RoomV2AvatarRenderLayer } from "../../roomV2/roomV2.types"
import {
  getRoomAvatarAtlasCropLayout,
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

test("an atlas crop lands where contentFit contain would draw the whole frame", () => {
  const crop: RoomV2AssetCrop = {
    sourceName: "frame",
    canvasWidth: 256,
    canvasHeight: 384,
    x: 70,
    y: 205,
    width: 112,
    height: 140,
    atlasX: 336,
    atlasY: 96,
    atlasWidth: 1012,
    atlasHeight: 608
  }
  // Tall, wide and exact-ratio boxes, with iOS-like 1/3 pt rounding.
  const roundToPixel = (value: number) => Math.round(value * 3) / 3
  for (const box of [{ width: 120, height: 300 }, { width: 300, height: 180 }, { width: 128, height: 192 }]) {
    const layout = getRoomAvatarAtlasCropLayout(crop, box, roundToPixel)
    assert.ok(layout)
    const scale = Math.min(box.width / 256, box.height / 384)
    const containLeft = (box.width - 256 * scale) / 2
    const containTop = (box.height - 384 * scale) / 2
    // The crop's top-left canvas pixel is where contain puts it.
    assert.ok(Math.abs(layout.crop.left - (containLeft + crop.x * scale)) < 1e-9)
    assert.ok(Math.abs(layout.crop.top - (containTop + crop.y * scale)) < 1e-9)
    assert.ok(Math.abs(layout.crop.width - crop.width * scale) < 1e-9)
    assert.ok(Math.abs(layout.crop.height - crop.height * scale) < 1e-9)
    // The atlas pixel at (atlasX, atlasY) meets the clip's corner exactly,
    // and the atlas is drawn at the frame's scale within half a device pixel.
    const atlasScaleX = layout.atlas.width / crop.atlasWidth
    const atlasScaleY = layout.atlas.height / crop.atlasHeight
    assert.ok(Math.abs(layout.atlas.left + crop.atlasX * atlasScaleX) < 1e-9)
    assert.ok(Math.abs(layout.atlas.top + crop.atlasY * atlasScaleY) < 1e-9)
    assert.ok(Math.abs(layout.atlas.width - crop.atlasWidth * scale) <= 1 / 6 + 1e-9)
    assert.ok(Math.abs(layout.atlas.height - crop.atlasHeight * scale) <= 1 / 6 + 1e-9)
  }
  assert.equal(getRoomAvatarAtlasCropLayout(crop, { width: 0, height: 300 }), null)
})
