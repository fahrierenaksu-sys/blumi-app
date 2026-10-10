import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_STILL_MANIFEST, DEFAULT_FEMALE_AVATAR_LOADOUT, resolveAvatarStillLayers } from "@blumi/domain"
import { avatarStillWarmupSources } from "./avatarStillWarmup"

const everyAsset = (product: "full" | "bust") =>
  Object.fromEntries(
    Object.keys(AVATAR_STILL_MANIFEST.bodies).flatMap((rig) =>
      AVATAR_STILL_MANIFEST.bodies[rig as "female" | "male"].layers[product].map((entry, index) => [`${rig}/${product}/${entry.key}`, index + 1])
    )
  ) as Record<string, number>

test("warm-up sources are exactly the layers the still draws", () => {
  const assets = everyAsset("full")
  const drawn = resolveAvatarStillLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, "full").layers.map((layer) => assets[layer.asset])
  assert.deepEqual(avatarStillWarmupSources(DEFAULT_FEMALE_AVATAR_LOADOUT, "full", assets), drawn)
})

test("an old or unknown loadout warms the starter pieces instead of throwing", () => {
  const sources = avatarStillWarmupSources({ bodyId: "avatar_v2_body_gone", topId: "avatar_v2_top_gone" }, "bust", everyAsset("bust"), { gender: "man" })
  assert.ok(sources.length > 0)
})

test("a layer without a bundled asset is skipped", () => {
  assert.deepEqual(avatarStillWarmupSources(DEFAULT_FEMALE_AVATAR_LOADOUT, "full", {}), [])
})
