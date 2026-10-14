import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  resolveAvatarStillLayers
} from "@blumi/domain"
import type { Rig25 } from "../renderer/rigTypes"
import { AVATAR_RIG_STARTER } from "./avatarItemArt"
import { resolveAvatarDraw } from "./resolveAvatarDraw"

const girlRig = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/girl/rig25.json"), "utf8")) as Rig25
const boyRig = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/boy/rig25.json"), "utf8")) as Rig25
const RIGS = { female: girlRig, male: boyRig }

// A look an old account can hold: a V2 loadout wearing a catalog dress (the dress pair as top and bottom) and a
// face from the old catalog. Review A F1: every surface draws it as the body's rig starter, and never rewrites it.
const dress = AVATAR_LOADOUT_CATALOG.find((item) => item.slot === "top" && item.pairedItemId && /dress/.test(item.itemId))
const OLD_FACE = "avatar_v2_face_warm_peach_foundation"
const storedLook = () => ({
  ...DEFAULT_FEMALE_AVATAR_LOADOUT,
  schemaVersion: 2 as const,
  faceId: OLD_FACE,
  topId: dress!.itemId,
  bottomId: dress!.pairedItemId!,
  dressId: dress!.itemId,
  outerwearId: null
})

test("a valid old dress loadout is drawn as the girl's rig starter top and bottom, on every surface", () => {
  assert.ok(dress, "the catalog still holds an old dress to test with")
  const stored = storedLook()
  const before = JSON.stringify(stored)
  const starterLook = { ...DEFAULT_FEMALE_AVATAR_LOADOUT, ...{ topId: AVATAR_RIG_STARTER.female.top, bottomId: AVATAR_RIG_STARTER.female.bottom } }

  const live = resolveAvatarDraw(RIGS, { loadout: stored, state: "idle", direction: "front" })
  const starterLive = resolveAvatarDraw(RIGS, { loadout: starterLook, state: "idle", direction: "front" })
  assert.deepEqual(live.itemIds, starterLive.itemIds)
  assert.ok(live.itemIds.some((id) => id.startsWith("top_")) && live.itemIds.some((id) => id.startsWith("bottom_")))

  for (const product of ["full", "bust"] as const) {
    const still = resolveAvatarStillLayers(stored, product)
    assert.deepEqual(still.layers, resolveAvatarStillLayers(starterLook, product).layers, `${product} still`)
    assert.ok(still.layers.length > 0)
  }
  // the body has one face, baked into it: the old face id changes nothing in either drawing (compared above with
  // the starter look, which wears the default face)
  assert.notEqual(stored.faceId, starterLook.faceId)
  assert.equal(JSON.stringify(stored), before, "the stored loadout is never rewritten by drawing it")
})

// New item kinds (WB integration/slots_2140 DESIGN §5): a girl rig with a one-piece dress, glasses and an accessory
// (copies of her real items re-slotted), the fixture catalog's items mapped to them, drawn by the real resolver and
// compiled by the real renderer.
import { TEST_AVATAR_ITEM as FX, TEST_AVATAR_ITEM_RULES as FX_RULES, toAvatarLoadoutV2 } from "@blumi/domain"
import { compileAvatar } from "../renderer/avatar25Pose"
import { AVATAR_ITEM_ART } from "./avatarItemArt"

function rigWithNewKinds(): Rig25 {
  const rig = structuredClone(girlRig)
  const starterTop = AVATAR_ITEM_ART.female[AVATAR_RIG_STARTER.female.top!]!
  const starterHair = AVATAR_ITEM_ART.female[AVATAR_RIG_STARTER.female.hair!]!
  for (const view of [rig.views.front, rig.views.back]) {
    view.items.dress_test = { ...structuredClone(view.items[starterTop]!), slot: "dress" }
    view.items.glasses_test = { ...structuredClone(view.items[starterHair]!), slot: "glasses" }
    view.items.acc_test = { ...structuredClone(view.items[starterHair]!), slot: "accessory" }
  }
  return rig
}
const NEW_RIGS = { female: rigWithNewKinds(), male: boyRig }
const NEW_ART = {
  ...AVATAR_ITEM_ART,
  female: { ...AVATAR_ITEM_ART.female, [FX.onePieceDress]: "dress_test", [FX.paidEyewear]: "glasses_test", [FX.paidEarrings]: "acc_test" }
}
const look = (dressId: string | null, accessoryIds: string[] = []) =>
  ({ ...toAvatarLoadoutV2(FX_RULES.starters.female, FX_RULES), dressId, accessoryIds })
const drawOf = (loadout: unknown, direction: "front" | "back" = "front") =>
  resolveAvatarDraw(NEW_RIGS, { loadout, state: "idle", direction }, { art: NEW_ART, rules: FX_RULES }).itemIds

test("a worn one-piece dress is drawn instead of the top and the bottom, in both views", () => {
  for (const direction of ["front", "back"] as const) {
    const ids = drawOf(look(FX.onePieceDress), direction)
    assert.ok(ids.includes("dress_test"), direction)
    assert.ok(!ids.some((id) => id.startsWith("top_") || id.startsWith("bottom_")), ids.join())
    assert.ok(ids.some((id) => id.startsWith("hair_")) && ids.some((id) => id.startsWith("shoes_")))
    const compiled = compileAvatar(NEW_RIGS.female, direction, ids)
    assert.ok(compiled.indexData.length > 0)
  }
})

test("taking the dress off draws the separates stored under it again", () => {
  const separates = drawOf(look(null))
  assert.deepEqual(drawOf({ ...look(FX.onePieceDress), dressId: null }), separates)
  assert.ok(separates.some((id) => id.startsWith("top_")) && separates.some((id) => id.startsWith("bottom_")))
})

test("glasses and an accessory are drawn while worn and leave the look exactly as before when taken off", () => {
  const bare = drawOf(look(null))
  const worn = drawOf(look(null, [FX.paidEarrings, FX.paidEyewear]))
  assert.deepEqual(worn, [...bare, "glasses_test", "acc_test"])
  assert.deepEqual(drawOf(look(null, [])), bare)
})

test("a dress the body has no art for draws the separates, and the stored look is never rewritten", () => {
  const stored = look(FX.onePieceDress)
  const before = JSON.stringify(stored)
  const ids = resolveAvatarDraw(RIGS, { loadout: stored, state: "idle", direction: "front" }, { rules: FX_RULES }).itemIds
  assert.ok(ids.some((id) => id.startsWith("top_")) && ids.some((id) => id.startsWith("bottom_")))
  assert.equal(JSON.stringify(stored), before)
})
