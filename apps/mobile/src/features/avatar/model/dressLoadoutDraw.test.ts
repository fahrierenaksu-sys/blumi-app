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
