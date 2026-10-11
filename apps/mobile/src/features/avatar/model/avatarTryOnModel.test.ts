import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_STILL_MANIFEST,
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

/** A catalog item the girl can wear in `slotKey` that has no 2.5D art for her yet (an old item). */
function oldGirlItem(slotKey: "hairId" | "topId" | "bottomId" | "shoesId"): string {
  const worn = DEFAULT_FEMALE_AVATAR_LOADOUT[slotKey]
  assert.equal(female.items[worn], undefined, "the default old piece has no 2.5D art in this fixture")
  return worn
}

test("a look the 2.5D art fully covers draws as the showcase figure", () => {
  assert.equal(avatarTryOnRenderer(GIRL_2_5D), "showcase")
})

test("trying on one old piece keeps the old drawing for the whole figure, for every slot", () => {
  for (const slotKey of ["hairId", "topId", "bottomId", "shoesId"] as const) {
    const look = { ...GIRL_2_5D, [slotKey]: oldGirlItem(slotKey) }
    // the piece is a valid, kept choice: coercion does not turn it into the starter
    assert.equal(coerceAvatarLoadout(look)[slotKey], look[slotKey])
    assert.equal(avatarTryOnRenderer(look), "legacy", `${slotKey} with an old piece must not draw as the starter`)
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
