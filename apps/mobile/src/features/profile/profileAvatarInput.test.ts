import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import type { AvatarSelection } from "@blumi/contracts"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  resolveAvatarStillLayers,
  type AvatarLoadoutCoercionHints
} from "@blumi/domain"
import { resolveAvatarDraw } from "../avatar/model/resolveAvatarDraw"
import type { Rig25 } from "../avatar/renderer/rigTypes"
import { avatarInputFromDraft, avatarInputFromSelection } from "./profileAvatarInput"

const readRig = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../avatar/rigs/${name}/rig25.json`), "utf8")) as Rig25
const RIGS = { female: readRig("girl"), male: readRig("boy") }

function drawnBy(input: { loadout: unknown; hints: AvatarLoadoutCoercionHints }) {
  const draw = resolveAvatarDraw(RIGS, { loadout: input.loadout, hints: input.hints, state: "idle", direction: "front" })
  const still = resolveAvatarStillLayers(input.loadout, "full", { hints: input.hints })
  return { draw, layers: still.layers.map((layer) => layer.asset) }
}

test("a stored loadout with a valid old dress and an old face is drawn in the body's starter outfit, and stays as stored", () => {
  const stored = Object.freeze({
    ...DEFAULT_FEMALE_AVATAR_LOADOUT,
    schemaVersion: 2,
    faceId: "avatar_v2_face_warm_peach_foundation",
    topId: "avatar_v2_top_boho_patchwork_maxi_dress",
    bottomId: "avatar_v2_bottom_boho_patchwork_maxi_dress",
    dressId: "boho_patchwork_maxi_dress",
    outerwearId: null,
    accessoryIds: []
  })
  const before = JSON.stringify(stored)
  const input = avatarInputFromSelection({ presetId: stored.bodyId, loadout: stored } as AvatarSelection)
  const dressed = drawnBy(input)
  const starter = drawnBy({ loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, hints: {} })

  assert.equal(dressed.draw.rig, "female")
  assert.deepEqual(dressed.draw.itemIds, starter.draw.itemIds, "the draw takes the rig's starter top and bottom")
  assert.deepEqual(dressed.layers, starter.layers, "the still takes the same starter layers")
  assert.equal(JSON.stringify(stored), before, "reading never changes what is stored")
})

test("a received selection without a loadout still draws, in the body its preset names", () => {
  const boy = drawnBy(avatarInputFromSelection({ presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId }))
  assert.equal(boy.draw.rig, "male")
  const legacyPresetMan = drawnBy(avatarInputFromSelection({ presetId: "dusk" }, "man"))
  assert.equal(legacyPresetMan.draw.rig, "male", "a legacy preset takes the profile's gender")
  assert.equal(drawnBy(avatarInputFromSelection(null)).draw.rig, "female")
})

test("a draft that is still being built (partial, or nothing yet) draws the body's starter", () => {
  assert.equal(drawnBy(avatarInputFromDraft(undefined)).draw.rig, "female")
  assert.equal(drawnBy(avatarInputFromDraft({ hairId: "avatar_v2_hair_made_up" })).draw.rig, "female")
  assert.equal(drawnBy(avatarInputFromDraft({}, "man")).draw.rig, "male")
  assert.equal(drawnBy(avatarInputFromDraft({ bodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId })).draw.rig, "male")
})

test("the hints are stable between calls, so a memoised avatar does not redraw", () => {
  assert.equal(avatarInputFromDraft(undefined).hints, avatarInputFromDraft(null).hints)
  assert.equal(avatarInputFromSelection(null).hints, avatarInputFromDraft({}).hints)
})
