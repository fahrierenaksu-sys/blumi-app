import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import type { RoomV2AssetRef } from "../../roomV2/roomV2.types"

// Metro asset IDs are represented by absolute file paths in Node.
const nodeRequire = createRequire(__filename)
for (const extension of [".png", ".webp", ".jpg", ".jpeg"]) {
  nodeRequire.extensions[extension] = (module, filename) => {
    module.exports = filename
  }
}

const sharp = nodeRequire("sharp") as typeof import("sharp").default
const manifest = nodeRequire("./roomAvatarMotionAtlas.json") as typeof import("./roomAvatarMotionAtlas.json")
const { ROOM_AVATAR_CATALOG } =
  nodeRequire("./avatarRoomCatalog") as typeof import("./avatarRoomCatalog")
const { ROOM_AVATAR_MOTION_ATLAS_SOURCES } =
  nodeRequire("./roomAvatarMotionAtlasSources") as typeof import("./roomAvatarMotionAtlasSources")

const mobileRoot = resolve(__dirname, "../../../..")
const MAX_ATLAS_SIDE = 2048

interface Rgba {
  data: Buffer
  width: number
  height: number
}

async function readRgba(path: string): Promise<Rgba> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.channels, 4, `${path} must decode to RGBA`)
  return { data, width: info.width, height: info.height }
}

function collectCroppedAssets(value: unknown, found: RoomV2AssetRef[], seen = new Set<unknown>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  const candidate = value as Partial<RoomV2AssetRef>
  if (typeof candidate.key === "string" && candidate.crop) found.push(candidate as RoomV2AssetRef)
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectCroppedAssets(child, found, seen)
  }
}

test("every packed frame, cut from its atlas, equals its original PNG exactly (RGBA)", async () => {
  const atlases = await Promise.all(
    manifest.atlases.map((atlas) => readRgba(resolve(mobileRoot, manifest.atlasDirectory, atlas.file)))
  )
  manifest.atlases.forEach((atlas, index) => {
    assert.equal(atlases[index]!.width, atlas.width, `${atlas.file} width`)
    assert.equal(atlases[index]!.height, atlas.height, `${atlas.file} height`)
    assert.ok(atlas.width <= MAX_ATLAS_SIDE && atlas.height <= MAX_ATLAS_SIDE, `${atlas.file} is too large to decode cheaply`)
  })

  const { width: canvasWidth, height: canvasHeight } = manifest.canvas
  const frames = Object.entries(manifest.frames)
  assert.ok(frames.length > 0)
  for (const [name, frame] of frames) {
    const original = await readRgba(resolve(mobileRoot, manifest.sourceDirectory, `${name}.png`))
    assert.equal(original.width, canvasWidth, `${name} width`)
    assert.equal(original.height, canvasHeight, `${name} height`)
    const atlas = atlases[frame.atlas]
    assert.ok(atlas, `${name} points at a missing atlas`)
    assert.ok(frame.atlasX + frame.width <= atlas.width && frame.atlasY + frame.height <= atlas.height, `${name} crop leaves its atlas`)
    assert.ok(frame.x + frame.width <= canvasWidth && frame.y + frame.height <= canvasHeight, `${name} crop leaves its canvas`)

    // Composite the crop onto a transparent canvas, as the renderer draws it.
    const composite = Buffer.alloc(canvasWidth * canvasHeight * 4)
    for (let row = 0; row < frame.height; row += 1) {
      const from = ((frame.atlasY + row) * atlas.width + frame.atlasX) * 4
      atlas.data.copy(composite, ((frame.y + row) * canvasWidth + frame.x) * 4, from, from + frame.width * 4)
    }
    assert.ok(composite.equals(original.data), `${name} differs from its atlas crop`)

    // The crop keeps a transparent border, so clipping it on device never
    // cuts or blends a visible pixel.
    for (let row = 0; row < frame.height; row += 1) {
      for (let column = 0; column < frame.width; column += 1) {
        const onCropEdge = row === 0 || row === frame.height - 1 || column === 0 || column === frame.width - 1
        // Where the art reaches the canvas edge the crop ends with it, like the original image.
        const onCanvasEdge = frame.x + column === 0 || frame.x + column === canvasWidth - 1 ||
          frame.y + row === 0 || frame.y + row === canvasHeight - 1
        if (!onCropEdge || onCanvasEdge) continue
        const alpha = atlas.data[((frame.atlasY + row) * atlas.width + frame.atlasX + column) * 4 + 3]
        assert.equal(alpha, 0, `${name} has a visible pixel on its crop edge`)
      }
    }
  }
})

test("room catalog frames that use an atlas carry the packed crop and its atlas image", () => {
  const cropped: RoomV2AssetRef[] = []
  collectCroppedAssets(ROOM_AVATAR_CATALOG, cropped)
  assert.ok(cropped.length > 0, "the room catalog uses packed frames")
  const frames: Record<string, (typeof manifest.frames)[keyof typeof manifest.frames] | undefined> = manifest.frames
  for (const asset of cropped) {
    const crop = asset.crop!
    const frame = frames[crop.sourceName]
    assert.ok(frame, `${asset.key} uses ${crop.sourceName}, which is not packed`)
    const atlas = manifest.atlases[frame.atlas]!
    assert.equal(asset.source, ROOM_AVATAR_MOTION_ATLAS_SOURCES[frame.atlas], `${asset.key} draws the wrong atlas`)
    assert.ok(String(asset.source).endsWith(`/${atlas.file}`), `${asset.key} draws the wrong atlas`)
    assert.deepEqual(
      [crop.x, crop.y, crop.width, crop.height, crop.atlasX, crop.atlasY, crop.atlasWidth, crop.atlasHeight],
      [frame.x, frame.y, frame.width, frame.height, frame.atlasX, frame.atlasY, atlas.width, atlas.height],
      `${asset.key} crop`
    )
    assert.deepEqual([crop.canvasWidth, crop.canvasHeight], [manifest.canvas.width, manifest.canvas.height])
  }
})
