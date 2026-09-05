import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import test from "node:test"

import { getMaleRigLayerThumbnailPresentation } from "./maleRigThumbnailPresentation"
import { isAvatarV2ItemCompatibleWithBody } from "./avatarBodyCompatibility"
import type { AvatarCatalogItem, AvatarItemType } from "./avatarV2.types"

interface DecodedPng {
  width: number
  height: number
  data: Uint8Array
}

const workspaceRequire = createRequire(join(process.cwd(), "package.json"))
const { PNG } = workspaceRequire("pngjs") as {
  PNG: { sync: { read: (buffer: Buffer) => DecodedPng } }
}

const expected = {
  shop: {
    hair: { scale: 2.7, top: 17 },
    top: { scale: 4, top: -39 },
    bottom: { scale: 5.5, top: -103 },
    shoes: { scale: 7.2, top: -163 },
    accessory: { scale: 4, top: 6 }
  },
  wardrobe: {
    hair: { scale: 3.2, top: 29 },
    top: { scale: 2.7, top: -60 },
    bottom: { scale: 3, top: -116 },
    shoes: { scale: 3, top: -130 },
    accessory: { scale: 3, top: 0 }
  }
} as const

test("male full-canvas rig layers use category-aware crop and scale on both surfaces", () => {
  for (const surface of ["shop", "wardrobe"] as const) {
    for (const type of ["hair", "top", "bottom", "shoes", "accessory"] as const) {
      assert.deepEqual(
        getMaleRigLayerThumbnailPresentation(type, surface),
        expected[surface][type],
        `${surface}:${type}`
      )
    }
  }

  assert.equal(getMaleRigLayerThumbnailPresentation("eyes", "wardrobe"), undefined)
})

test("all promoted male eyewear stays visible inside Shop and Wardrobe rig stages", () => {
  const root = process.cwd()
  const glasses = [
    "tortoiseshell_smoke_sunglasses",
    "matte_black_panto_sunglasses"
  ]
  const surfaces = {
    shop: { width: 82, height: 60 },
    wardrobe: { width: 114, height: 100 }
  } as const

  for (const slug of glasses) {
    const png = PNG.sync.read(readFileSync(join(
      root,
      "src/features/avatarV2/assets/room",
      `avatar_room_accessory_male_${slug}_v1.png`
    )))
    const alphaBounds = getAlphaBounds(png)

    for (const [surface, stage] of Object.entries(surfaces) as [keyof typeof surfaces, (typeof surfaces)[keyof typeof surfaces]][]) {
      const presentation = getMaleRigLayerThumbnailPresentation("accessory", surface)
      assert.ok(presentation, `${surface}:${slug} presentation`)
      const projected = projectContainedAlphaBounds({
        source: png,
        alphaBounds,
        stage,
        scale: presentation.scale,
        top: presentation.top
      })
      const label = `${surface}:${slug}`
      assert.ok(projected.left >= 0, `${label} clips left at ${projected.left}`)
      assert.ok(projected.right <= stage.width, `${label} clips right at ${projected.right}`)
      assert.ok(projected.top >= 0, `${label} clips top at ${projected.top}`)
      assert.ok(projected.bottom <= stage.height, `${label} clips bottom at ${projected.bottom}`)
      assert.ok(projected.right - projected.left >= 40, `${label} eyewear is too small`)
    }
  }
})

test("every promoted male rig layer alpha stays inside Shop and Wardrobe stages", () => {
  const root = process.cwd()
  const sourceMap = readFileSync(
    join(root, "src/features/avatarV2/maleCapsulePreviewSources.ts"),
    "utf8"
  )
  const itemIds = [...sourceMap.matchAll(/^\s+(avatar_v2_(hair|top|bottom|shoes)_male_[a-z0-9_]+):/gm)]
    .map((match) => ({ id: match[1], type: match[2] as AvatarItemType }))

  assert.deepEqual(
    itemIds.reduce<Record<string, number>>(
      (counts, item) => ({ ...counts, [item.type]: (counts[item.type] ?? 0) + 1 }),
      {}
    ),
    { hair: 4, top: 8, bottom: 5, shoes: 4 },
    "the alpha-bound suite must track every shared male rig thumbnail source"
  )

  const surfaces = {
    shop: { width: 82, height: 60 },
    wardrobe: { width: 114, height: 100 }
  } as const

  for (const item of itemIds) {
    const assetType = item.type === "hair" ? "hair_front" : item.type
    const assetSlug = item.id.replace(`avatar_v2_${item.type}_`, "")
    const assetPath = join(
      root,
      "src/features/avatarV2/assets/room",
      `avatar_room_${assetType}_${assetSlug}_v1.png`
    )
    const png = PNG.sync.read(readFileSync(assetPath))
    const alphaBounds = getAlphaBounds(png)

    for (const [surface, stage] of Object.entries(surfaces) as [keyof typeof surfaces, (typeof surfaces)[keyof typeof surfaces]][]) {
      const presentation = getMaleRigLayerThumbnailPresentation(item.type, surface)
      assert.ok(presentation, `${surface}:${item.id} presentation`)

      const projected = projectContainedAlphaBounds({
        source: png,
        alphaBounds,
        stage,
        scale: presentation.scale,
        top: presentation.top
      })
      const label = `${surface}:${item.id}`
      assert.ok(projected.left >= 0, `${label} clips left at ${projected.left}`)
      assert.ok(projected.right <= stage.width, `${label} clips right at ${projected.right}`)
      assert.ok(projected.top >= 0, `${label} clips top at ${projected.top}`)
      assert.ok(projected.bottom <= stage.height, `${label} clips bottom at ${projected.bottom}`)
    }
  }
})

test("shared presentation is consumed by Shop and Wardrobe without duplicating magic", () => {
  const root = process.cwd()
  const shop = readFileSync(join(root, "src/screens/CosmeticShopScreen.tsx"), "utf8")
  const wardrobe = readFileSync(join(root, "src/screens/WardrobeV2Screen.tsx"), "utf8")

  assert.match(shop, /getMaleRigLayerThumbnailPresentation\(item\.type, "shop"\)/)
  assert.match(wardrobe, /getMaleRigLayerThumbnailPresentation\(item\.type, "wardrobe"\)/)
  assert.doesNotMatch(shop, /function getRigLayerThumbnailPresentation/)
  assert.doesNotMatch(wardrobe, /if \(item\.type === "hair"\) return \{ scale:/)
})

test("thumbnail filtering preserves male and female body isolation", () => {
  const makeItem = (
    id: string,
    type: AvatarItemType,
    compatibleBodyIds?: string[]
  ): AvatarCatalogItem => ({
    id,
    type,
    name: id,
    sortOrder: 1,
    layerOrder: 1,
    assets: {},
    compatibleBodyIds
  })
  const male = makeItem("male-top", "top", ["avatar_v2_body_male_light"])
  const female = makeItem("female-top", "top")

  assert.equal(isAvatarV2ItemCompatibleWithBody(male, "avatar_v2_body_male_light"), true)
  assert.equal(isAvatarV2ItemCompatibleWithBody(female, "avatar_v2_body_male_light"), false)
  assert.equal(isAvatarV2ItemCompatibleWithBody(male, "avatar_v2_body_default"), false)
  assert.equal(isAvatarV2ItemCompatibleWithBody(female, "avatar_v2_body_default"), true)
})

interface PixelBounds {
  left: number
  right: number
  top: number
  bottom: number
}

function getAlphaBounds(png: DecodedPng): PixelBounds {
  let left = png.width
  let right = -1
  let top = png.height
  let bottom = -1

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }

  assert.ok(right >= left && bottom >= top, "rig thumbnail asset must contain visible pixels")
  return { left, right, top, bottom }
}

function projectContainedAlphaBounds(input: {
  source: Pick<DecodedPng, "width" | "height">
  alphaBounds: PixelBounds
  stage: { width: number; height: number }
  scale: number
  top: number
}): PixelBounds {
  const containScale = Math.min(
    input.stage.width / input.source.width,
    input.stage.height / input.source.height
  )
  const renderedWidth = input.source.width * containScale
  const renderedHeight = input.source.height * containScale
  const renderedLeft = (input.stage.width - renderedWidth) / 2
  const renderedTop = (input.stage.height - renderedHeight) / 2
  const centerX = input.stage.width / 2
  const centerY = input.stage.height / 2
  const projectX = (sourceX: number) =>
    centerX + (renderedLeft + sourceX * containScale - centerX) * input.scale
  const projectY = (sourceY: number) =>
    centerY + (renderedTop + sourceY * containScale - centerY) * input.scale + input.top

  return {
    left: projectX(input.alphaBounds.left),
    right: projectX(input.alphaBounds.right),
    top: projectY(input.alphaBounds.top),
    bottom: projectY(input.alphaBounds.bottom)
  }
}
