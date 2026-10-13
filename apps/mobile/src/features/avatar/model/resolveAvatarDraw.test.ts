import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { BOY_WARDROBE_PREVIEW_ALL_IDS, DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { Rig25 } from "../renderer/rigTypes"
import { AVATAR_ITEM_ART, AVATAR_RIG_STARTER, listAvatarItemArt } from "./avatarItemArt"
import { resolveAvatarDraw } from "./resolveAvatarDraw"

const girlRig = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/girl/rig25.json"), "utf8")) as Rig25
const boyRig = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/boy/rig25.json"), "utf8")) as Rig25
const RIGS = { female: girlRig, male: boyRig }

const BOY_STARTER_ITEMS = ["shoes_male_basic_a", "bottom_male_basic_a", "top_male_basic_a", "hair_male_curls"]
const GIRL_STARTER_ITEMS = ["shoes_mint_ribbon_court_sneakers", "bottom_coral_wave_pants", "top_coral_wave_polo", "hair_ink_pageboy_star"]
const GIRL_RIG_OUTFIT = {
  ...DEFAULT_FEMALE_AVATAR_LOADOUT,
  hairId: "avatar_v2_hair_ink_pageboy_star",
  topId: "avatar_v2_top_coral_wave_polo",
  bottomId: "avatar_v2_bottom_coral_wave_pants",
  shoesId: "avatar_v2_shoes_mint_ribbon_court_sneakers",
  accessoryIds: []
}

test("a girl wearing pieces with rig art is drawn in them, in painter's slot order", () => {
  assert.deepEqual(resolveAvatarDraw(RIGS, { loadout: GIRL_RIG_OUTFIT, state: "walking", direction: "front" }), {
    rig: "female",
    view: "front",
    mirror: false,
    pose: "walk",
    itemIds: GIRL_STARTER_ITEMS
  })
})

test("today's default girl (old items without rig art) is drawn in the rig starter outfit, never left undrawn", () => {
  const spec = resolveAvatarDraw(RIGS, { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, state: "idle", direction: "front" })
  assert.equal(spec.rig, "female")
  assert.deepEqual(spec.itemIds, GIRL_STARTER_ITEMS)
  // one slot with art keeps it, the others fall back slot by slot (never all-or-nothing)
  const mixed = resolveAvatarDraw(RIGS, { loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: "avatar_v2_top_coral_wave_polo" } })
  assert.deepEqual(mixed.itemIds, GIRL_STARTER_ITEMS)
})

test("anyone's loadout resolves, however strange: unknown, retired or other-body IDs, garbage, nothing at all", () => {
  const strange: unknown[] = [
    undefined,
    null,
    "not a loadout",
    42,
    [],
    {},
    { bodyId: "avatar_v2_body_unknown" },
    { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: "avatar_v2_hair_made_up", topId: 7, accessoryIds: "x" },
    { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: DEFAULT_MALE_AVATAR_LOADOUT.topId },
    { ...DEFAULT_FEMALE_AVATAR_LOADOUT, schemaVersion: 2, dressId: "avatar_v2_dress_made_up", outerwearId: "x" },
    { ...GIRL_RIG_OUTFIT, accessoryIds: ["avatar_v2_accessory_made_up", null] }
  ]
  for (const loadout of strange) {
    const spec = resolveAvatarDraw(RIGS, { loadout, state: "idle", direction: "front" })
    assert.equal(spec.rig, "female", JSON.stringify(loadout))
    assert.deepEqual(spec.itemIds, GIRL_STARTER_ITEMS, JSON.stringify(loadout))
  }
})

test("a loadout without a body takes the body its hints imply (the stored preset, then the profile's gender)", () => {
  assert.equal(resolveAvatarDraw(RIGS, { loadout: {}, hints: { gender: "man" } }).rig, "male")
  assert.equal(resolveAvatarDraw(RIGS, { loadout: {}, hints: { presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId } }).rig, "male")
  assert.equal(resolveAvatarDraw(RIGS, { loadout: {}, hints: { gender: "woman" } }).rig, "female")
  assert.equal(resolveAvatarDraw(RIGS, { loadout: { bodyId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId }, hints: { gender: "man" } }).rig, "female")
})

test("the boy is drawn by his own rig; an item without his art, a girl's included, never draws on him", () => {
  const dressedAsHer = { ...GIRL_RIG_OUTFIT, bodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId }
  for (const loadout of [DEFAULT_MALE_AVATAR_LOADOUT, dressedAsHer]) {
    for (const state of ["idle", "walking", "sitting", "waving"] as const) {
      const spec = resolveAvatarDraw(RIGS, { loadout, state, direction: "right" })
      assert.equal(spec.rig, "male", state)
      // an item without his art is drawn as his rig starter piece (preview: curls + basic_a), never a girl's piece
      assert.deepEqual(spec.itemIds, BOY_STARTER_ITEMS, state)
    }
  }
})

test("the boy wearing his wardrobe pieces is drawn in them, in both views and every pose", () => {
  const look = {
    ...DEFAULT_MALE_AVATAR_LOADOUT,
    hairId: "avatar_v2_hair_male_textured_twists",
    topId: "avatar_v2_top_male_check_flannel_white_tee",
    bottomId: "avatar_v2_bottom_male_grey_wide_jeans",
    shoesId: "avatar_v2_shoes_male_tan_loafers"
  }
  for (const direction of ["left", "right", "back"] as const) {
    for (const state of ["idle", "walking", "sitting", "waving"] as const) {
      const spec = resolveAvatarDraw(RIGS, { loadout: look, state, direction })
      assert.equal(spec.rig, "male")
      assert.deepEqual(spec.itemIds, ["shoes_male_c2", "bottom_male_c14w", "top_male_c14w", "hair_male_twists"], `${direction} ${state}`)
    }
  }
})

test("every boy wardrobe ID maps to an item of his rig in both views, in its own slot", () => {
  const ids = Object.entries(AVATAR_ITEM_ART.male)
  assert.equal(ids.length, BOY_WARDROBE_PREVIEW_ALL_IDS.length)
  for (const [canonical, rigItem] of ids) {
    assert.ok(BOY_WARDROBE_PREVIEW_ALL_IDS.includes(canonical), canonical)
    for (const view of ["front", "back"] as const) {
      const art = boyRig.views[view].items[rigItem]
      assert.ok(art, `${rigItem} ${view}`)
      assert.ok(canonical.startsWith(`avatar_v2_${art.slot}_male_`), `${canonical} is a ${art.slot}`)
    }
  }
})

test("left/right are one drawing mirrored, back is the back drawing", () => {
  const at = (direction: "front" | "left" | "right" | "back") => resolveAvatarDraw(RIGS, { loadout: GIRL_RIG_OUTFIT, direction })
  assert.equal(at("right").view, at("left").view)
  assert.notEqual(at("right").mirror, at("left").mirror)
  assert.equal(at("back").view, "back")
})

test("with painted walk frames, trousers without walk cards are not drawn in any state (never switching mid-walk)", () => {
  const copy = JSON.parse(JSON.stringify(girlRig)) as Rig25
  for (const view of Object.values(copy.views)) {
    view.walk.frames = [{ x: 0, y: 0, w: 1, h: 1, drop: 0 }]
    view.items.bottom_coral_wave_pants.hasWalk = false
  }
  for (const state of ["idle", "walking", "sitting"] as const) {
    const spec = resolveAvatarDraw({ ...RIGS, female: copy }, { loadout: GIRL_RIG_OUTFIT, state, direction: "front" })
    assert.equal(spec.itemIds.includes("bottom_coral_wave_pants"), false, state)
  }
})

test("never mutates the loadout it reads", () => {
  const loadout = Object.freeze({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: Object.freeze(["avatar_v2_accessory_made_up"]) })
  const before = JSON.stringify(loadout)
  resolveAvatarDraw(RIGS, { loadout })
  assert.equal(JSON.stringify(loadout), before)
})

test("every item in the art map and every rig starter piece has its rig item in both views of its body's rig", () => {
  for (const { rig, itemId, rigItemId } of listAvatarItemArt()) {
    for (const view of ["front", "back"] as const) assert.ok(RIGS[rig].views[view].items[rigItemId], `${rig} ${view} ${itemId}`)
  }
  for (const [rig, slots] of Object.entries(AVATAR_RIG_STARTER) as [keyof typeof RIGS, Record<string, string>][]) {
    for (const itemId of Object.values(slots)) assert.ok(AVATAR_ITEM_ART[rig][itemId], `${rig} starter ${itemId} has art`)
  }
})
