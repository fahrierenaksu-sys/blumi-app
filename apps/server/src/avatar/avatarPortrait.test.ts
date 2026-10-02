import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT, cloneAvatarLoadout } from "@blumi/domain"
import type { AvatarLoadout } from "@blumi/contracts"
import {
  AVATAR_PORTRAIT_SIZE,
  createAvatarPortraitRenderer,
  loadBundledAvatarPortraitLayers
} from "./avatarPortrait"

const layers = loadBundledAvatarPortraitLayers()
const female = cloneAvatarLoadout(DEFAULT_FEMALE_AVATAR_LOADOUT as AvatarLoadout)
const male = cloneAvatarLoadout(DEFAULT_MALE_AVATAR_LOADOUT as AvatarLoadout)

test("the server build bundles the app's portrait layers, back to front, from files in the checkout", () => {
  assert.ok(layers, "dist/generated/avatarPortraitLayers.cjs is part of the server build")
  const still = layers.resolveAvatarPortraitStillLayers(female)
  assert.ok(still.length >= 5)
  assert.equal(still.at(-1)?.type, "hairFront", "front hair is drawn last, as in the app")
  assert.ok(still.findIndex((layer) => layer.type === "base") < still.findIndex((layer) => layer.type === "top"))
  for (const layer of still) assert.match(String(layer.source), /^apps\/mobile\/src\/.+\.(png|webp)$/)
  assert.match(layers.resolveAvatarPortraitBackground("seed"), /^#[0-9A-F]{6}$/i)
})

test("a portrait is a small square PNG, the same bytes for the same look, different for another look", async () => {
  assert.ok(layers)
  const renderer = createAvatarPortraitRenderer({ layers })
  const background = renderer.backgroundFor("user_seed")
  const first = await renderer.render({ loadout: female, background })
  const again = await createAvatarPortraitRenderer({ layers }).render({ loadout: cloneAvatarLoadout(female), background })
  const other = await renderer.render({ loadout: male, background })

  assert.equal(first.mimeType, "image/png")
  assert.ok(first.body.equals(again.body), "deterministic for a loadout")
  assert.ok(!first.body.equals(other.body))
  const metadata = await sharp(first.body).metadata()
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ["png", AVATAR_PORTRAIT_SIZE, AVATAR_PORTRAIT_SIZE])
  assert.ok(first.body.length < 64 * 1024, `portrait is ${first.body.length} bytes`)
  // The chibi covers the middle of the picture; the background fills the corner.
  const { data, info } = await sharp(first.body).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)]
  const hex = (rgb: number[]) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
  assert.equal(hex(pixel(1, 1)), background.toUpperCase())
  assert.notEqual(hex(pixel(info.width / 2, info.height / 2)), background.toUpperCase())
})

test("the portrait cache stays within its byte budget and a bad background is refused", async () => {
  assert.ok(layers)
  const renderer = createAvatarPortraitRenderer({ layers, maxCacheBytes: 1 })
  const background = "#FFD9E8"
  const first = await renderer.render({ loadout: female, background })
  const second = await renderer.render({ loadout: female, background })
  assert.ok(first.body.equals(second.body), "redrawn when it does not fit the cache")
  await assert.rejects(renderer.render({ loadout: female, background: "red" }))
})
