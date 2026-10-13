import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_ITEM_RULES,
  AVATAR_STILL_MANIFEST,
  type AvatarItemRules,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  coerceAvatarLoadout
} from "@blumi/domain"
import { avatarTryOnRenderer } from "./avatarTryOnModel"

// Phase 4 4.1 (lane G): Wardrobe, Shop and avatar setup draw a try-on as static images. A look the 2.5D art covers is
// the showcase figure; a look with any piece the 2.5D art lacks keeps the old drawing whole, so a try-on never shows
// a different piece than the one being tried on or bought.

const female = AVATAR_STILL_MANIFEST.bodies.female
const GIRL_2_5D = {
  ...DEFAULT_FEMALE_AVATAR_LOADOUT,
  hairId: female.starter.hair!,
  topId: female.starter.top!,
  bottomId: female.starter.bottom!,
  shoesId: female.starter.shoes!,
  accessoryIds: []
}

/**
 * Test-only "old pieces": after X15 every real old item is retired, so coercion would turn one into the starter.
 * These fixture items are wearable on the girl and have no 2.5D art, which is what an old piece used to be.
 */
const OLD_PIECE = {
  hairId: "fixture_old_hair",
  topId: "fixture_old_top",
  bottomId: "fixture_old_bottom",
  shoesId: "fixture_old_shoes"
} as const
const OLD_PIECE_RULES: AvatarItemRules = {
  ...AVATAR_ITEM_RULES,
  items: [
    ...AVATAR_ITEM_RULES.items,
    ...(["hair", "top", "bottom", "shoes"] as const).map((slot) => ({
      itemId: OLD_PIECE[`${slot}Id`],
      slot,
      supportedBodyIds: [DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId]
    }))
  ]
}

/** A piece the girl can wear in `slotKey` that has no 2.5D art for her (an old piece). */
function oldGirlItem(slotKey: "hairId" | "topId" | "bottomId" | "shoesId"): string {
  const worn = OLD_PIECE[slotKey]
  assert.equal(female.items[worn], undefined, "the old piece has no 2.5D art in this fixture")
  return worn
}

test("a look the 2.5D art fully covers draws as the showcase figure", () => {
  assert.equal(avatarTryOnRenderer(GIRL_2_5D), "showcase")
})

test("trying on one old piece keeps the old drawing for the whole figure, for every slot", () => {
  for (const slotKey of ["hairId", "topId", "bottomId", "shoesId"] as const) {
    const look = { ...GIRL_2_5D, [slotKey]: oldGirlItem(slotKey) }
    // the piece is a valid, kept choice: coercion does not turn it into the starter
    assert.equal(coerceAvatarLoadout(look, {}, OLD_PIECE_RULES)[slotKey], look[slotKey])
    assert.equal(avatarTryOnRenderer(look, { rules: OLD_PIECE_RULES }), "legacy", `${slotKey} with an old piece must not draw as the starter`)
  }
})

test("another face than the body's one drawn face keeps the old drawing", () => {
  const otherEyes = "avatar_v2_eyes_sage_glass"
  const look = { ...GIRL_2_5D, eyesId: otherEyes }
  if (coerceAvatarLoadout(look).eyesId !== otherEyes) return // not wearable here: coercion already drops it
  assert.equal(avatarTryOnRenderer(look), "legacy")
})

test("a body without 2.5D pieces (the boy before his art lands) keeps the old drawing, never a bald base", () => {
  assert.equal(avatarTryOnRenderer(DEFAULT_MALE_AVATAR_LOADOUT), "legacy")
})

test("once the boy's pieces have 2.5D art, his look draws as the showcase figure", () => {
  const boyPieces = {
    hair: ["boy_hair", "hair"],
    top: ["boy_top", "top"],
    bottom: ["boy_bottom", "bottom"],
    shoes: ["boy_shoes", "shoes"]
  } as const
  const boy = coerceAvatarLoadout(DEFAULT_MALE_AVATAR_LOADOUT)
  const items = Object.fromEntries(
    ([["hair", boy.hairId], ["top", boy.topId], ["bottom", boy.bottomId], ["shoes", boy.shoesId]] as const).map(
      ([slot, id]) => [id, { slot, rigItemId: boyPieces[slot][0], thumb: id }]
    )
  )
  const manifest = {
    ...AVATAR_STILL_MANIFEST,
    bodies: { ...AVATAR_STILL_MANIFEST.bodies, male: { ...AVATAR_STILL_MANIFEST.bodies.male, items } }
  }
  assert.equal(avatarTryOnRenderer(DEFAULT_MALE_AVATAR_LOADOUT, { manifest }), "showcase")
})

test("total for anything stored or received: never throws and never changes the look", () => {
  for (const raw of [undefined, null, 7, "dusk", {}, { bodyId: "nope", hairId: 3 }, { ...GIRL_2_5D, hairId: "unknown_item" }]) {
    const before = JSON.stringify(raw)
    assert.ok(["showcase", "legacy"].includes(avatarTryOnRenderer(raw)))
    assert.equal(JSON.stringify(raw), before)
  }
})
