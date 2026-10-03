import assert from "node:assert/strict"
import test from "node:test"
import type { RoomV2AssetCrop, RoomV2AvatarRenderLayer } from "../../roomV2/roomV2.types"
import {
  getRoomAvatarAtlasCropLayout,
  getRoomAvatarFrameIndex,
  getRoomAvatarFrameTick,
  getRoomAvatarLayerAnimationState,
  addRoomAvatarTableToPool,
  getRoomAvatarFrameTable,
  getRoomAvatarFrameToApply,
  getRoomAvatarLayerFrameAsset,
  getRoomAvatarShownImages,
  pruneRoomAvatarPool
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

test("fresh layer objects with the same images keep the table; a new image or fit changes it", () => {
  const table = getRoomAvatarFrameTable([layer(firstSource)], false, 1)
  assert.equal(getRoomAvatarFrameTable([layer(firstSource)], false, 1).signature, table.signature)
  assert.notEqual(getRoomAvatarFrameTable([layer(secondSource)], false, 1).signature, table.signature)
  assert.notEqual(
    getRoomAvatarFrameTable([{ ...layer(firstSource), id: "other-top" }], false, 1).signature,
    table.signature
  )
})

test("each frame names every layer's image, and a repeated image mounts once", () => {
  const body = { ...layer(firstSource), id: "body", type: "base", layerOrder: 1 }
  const hair = animatedLayer("hair", ["f1", "f2", "f1", "f3"])
  hair.animation!.frames[2] = hair.animation!.frames[0]
  const table = getRoomAvatarFrameTable([body, hair], true, 4)
  assert.equal(table.frames.length, 4)
  for (let index = 0; index < 4; index += 1) {
    assert.equal(table.frames[index]!.length, 2, "every frame covers every layer")
    assert.equal(table.frames[index]![0], table.frames[0]![0], "a still layer keeps one image")
    assert.ok(table.frames[index]![1]!.includes(`|${getRoomAvatarLayerFrameAsset(hair, index).key}|`))
  }
  assert.equal(table.frames[2]![1], table.frames[0]![1])
  assert.equal(table.images.length, 4, "body plus three distinct hair images")
})

test("a frame replaces the one on screen only once every layer's image for it has displayed", () => {
  const body = animatedLayer("body", ["b1", "b2"])
  const top = animatedLayer("top-layer", ["t1", "t2"])
  const table = getRoomAvatarFrameTable([body, top], true, 2)
  const [frame0, frame1] = table.frames as [string[], string[]]
  const none = { signature: "", index: -1 }
  const displayed: Record<string, boolean> = {}
  assert.equal(getRoomAvatarFrameToApply(table, 0, displayed, none), -1, "nothing shows before it is complete")
  displayed[frame0[0]!] = true
  assert.equal(getRoomAvatarFrameToApply(table, 0, displayed, none), -1, "the body alone never shows")
  displayed[frame0[1]!] = true
  assert.equal(getRoomAvatarFrameToApply(table, 0, displayed, none), 0)
  const shownFrame0 = { signature: table.signature, index: 0 }
  assert.equal(getRoomAvatarFrameToApply(table, 0, displayed, shownFrame0), -1, "an applied frame is not re-applied")
  displayed[frame1[0]!] = true
  assert.equal(getRoomAvatarFrameToApply(table, 1, displayed, shownFrame0), -1,
    "the body does not walk ahead of a top that has not drawn its frame")
  displayed[frame1[1]!] = true
  assert.equal(getRoomAvatarFrameToApply(table, 1, displayed, shownFrame0), 1)
  assert.equal(getRoomAvatarFrameToApply(table, 3, displayed, shownFrame0), 1, "indexes wrap like the clock")
  assert.deepEqual(getRoomAvatarShownImages(table.layerKeys, frame1), {
    [table.layerKeys[0]!]: frame1[0], [table.layerKeys[1]!]: frame1[1]
  })
})

test("the image pool keeps the pose on screen until the next one shows, then only that pose and idle", () => {
  const idleLayers = [layer(firstSource)]
  const walkLayers = [animatedLayer("top", ["w1", "w2", "w3", "w4"])]
  const sitLayers = [animatedLayer("top", ["s1", "s2"])]
  const idle = getRoomAvatarFrameTable(idleLayers, false, 1)
  const walk = getRoomAvatarFrameTable(walkLayers, true, 4)
  const sit = getRoomAvatarFrameTable(sitLayers, true, 2)
  const keys = (pool: ReturnType<typeof addRoomAvatarTableToPool>) =>
    pool.flatMap((entry) => entry.images.map((image) => image.key))
  const start = addRoomAvatarTableToPool([], idleLayers, idle)
  assert.equal(addRoomAvatarTableToPool(start, [layer(firstSource)], idle), start, "same images: same pool")
  const walking = addRoomAvatarTableToPool(start, walkLayers, walk)
  assert.equal(keys(walking).length, 5, "idle stays mounted while the walk loads")
  const toSit = addRoomAvatarTableToPool(walking, sitLayers, sit)
  assert.equal(keys(toSit).length, 7, "the walk on screen stays mounted until the sit replaces it")
  const keep = new Set([...sit.images, ...idle.images].map((image) => image.key))
  const sitting = pruneRoomAvatarPool(toSit, keep)
  assert.deepEqual(new Set(keys(sitting)), keep, "only the current motion and idle remain")
  assert.equal(pruneRoomAvatarPool(sitting, keep), sitting)
})

test("an outfit change keeps the old layer mounted until the new look is shown", () => {
  const oldTop = { ...layer(firstSource), id: "old-top" }
  const newTop = { ...layer(secondSource), id: "new-top" }
  const before = getRoomAvatarFrameTable([oldTop], false, 1)
  const after = getRoomAvatarFrameTable([newTop], false, 1)
  const pool = addRoomAvatarTableToPool(addRoomAvatarTableToPool([], [oldTop], before), [newTop], after)
  assert.deepEqual(pool.map((entry) => entry.key), ["top:old-top", "top:new-top"])
  const shown = pruneRoomAvatarPool(pool, new Set(after.images.map((image) => image.key)))
  assert.deepEqual(shown.map((entry) => entry.key), ["top:new-top"])
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
