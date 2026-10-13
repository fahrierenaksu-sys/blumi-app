import assert from "node:assert/strict"
import test from "node:test"
import { ECONOMY_CATALOG, getDefaultOwnedItemIds } from "../economy/economyCatalog"
import { RETIRING_AVATAR_ITEM_IDS } from "../legacy/legacyItemIds"
import {
  BLUMI_R1_RELEASE_CATALOG,
  isReleaseCatalogItemHeld,
  resolveR1PublishedEconomyCatalog
} from "../release/releaseCatalog"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "./avatarLoadoutCatalog"
import { coerceAvatarLoadout } from "./avatarLoadoutCoercion"
import { validateAvatarLoadout } from "./avatarLoadoutRules"
import { AVATAR_STILL_MANIFEST } from "./avatarStills"
import { INTERIM_MALE_STARTER_ITEM_IDS, RETIRED_AVATAR_ITEM_IDS, isRetiredAvatarItemId } from "./retiredAvatarItems"

// Plan X15 (owner yes 2026-10-12): the old avatarV2 items are retired, never deleted; the 2.5D starters are free.
const STARTERS = [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]
const WORN_KEYS = ["bodyId", "faceId", "eyesId", "noseId", "mouthId", "hairId", "topId", "bottomId", "shoesId"] as const
const CATALOG_IDS = new Set([...AVATAR_LOADOUT_CATALOG.map((item) => item.itemId), ...ECONOMY_CATALOG.map((item) => item.itemId)])

test("every old avatar id is hidden except the boy's interim garments, and no hidden id leaves the catalogs", () => {
  for (const id of RETIRING_AVATAR_ITEM_IDS) {
    assert.equal(isRetiredAvatarItemId(id), !INTERIM_MALE_STARTER_ITEM_IDS.includes(id), id)
  }
  for (const id of RETIRED_AVATAR_ITEM_IDS) assert.ok(CATALOG_IDS.has(id), `${id} was deleted instead of hidden`)
  for (const id of INTERIM_MALE_STARTER_ITEM_IDS) assert.ok(CATALOG_IDS.has(id), id)
})

test("the girl's starter look is exactly the piece set her rig and stills draw", () => {
  const drawn = AVATAR_STILL_MANIFEST.bodies.female.starter
  const girl = DEFAULT_FEMALE_AVATAR_LOADOUT
  assert.deepEqual(
    { hair: girl.hairId, top: girl.topId, bottom: girl.bottomId, shoes: girl.shoesId },
    { hair: drawn.hair, top: drawn.top, bottom: drawn.bottom, shoes: drawn.shoes }
  )
})

test("both starter looks wear only active pieces, are free and owned by every account, and pass the strict rules", () => {
  const granted = getDefaultOwnedItemIds("avatar")
  for (const starter of STARTERS) {
    for (const key of WORN_KEYS) {
      const id = starter[key]
      assert.equal(isRetiredAvatarItemId(id), false, `${starter.bodyId} ${key}=${id} is retired`)
      const entry = ECONOMY_CATALOG.find((item) => item.itemId === id)
      assert.ok(entry, `${id} has no economy entry`)
      assert.equal(entry.ownedByDefault, true, `${id} is not owned by default`)
      assert.equal(entry.priceCoins, 0, `${id} is not free`)
      assert.ok(granted.includes(id), `${id} is not granted`)
    }
    const result = validateAvatarLoadout(starter, granted)
    assert.ok(result.ok, `${starter.bodyId}: ${result.ok ? "" : result.code}`)
  }
})

test("a new account is granted no hidden item", () => {
  for (const id of getDefaultOwnedItemIds("avatar")) assert.equal(isRetiredAvatarItemId(id), false, id)
})

test("a stored look made of retired pieces reads as the body's starter look and the stored value is untouched", () => {
  for (const starter of STARTERS) {
    const hiddenFor = (slot: string) =>
      AVATAR_LOADOUT_CATALOG.find((item) =>
        item.slot === slot && item.supportedBodyIds.includes(starter.bodyId) && isRetiredAvatarItemId(item.itemId))?.itemId
    const stored = {
      ...starter,
      hairId: hiddenFor("hair"),
      topId: hiddenFor("top"),
      bottomId: hiddenFor("bottom"),
      shoesId: hiddenFor("shoes"),
      accessoryIds: [hiddenFor("accessory")].filter((id) => id !== undefined)
    }
    assert.ok(stored.hairId && stored.shoesId, `${starter.bodyId} has no retired fixture`)
    const before = JSON.stringify(stored)
    const read = coerceAvatarLoadout(stored, { presetId: starter.bodyId })
    assert.equal(JSON.stringify(stored), before)
    for (const key of WORN_KEYS) {
      if (stored[key] && isRetiredAvatarItemId(stored[key])) assert.equal(read[key], starter[key], `${starter.bodyId} ${key}`)
    }
    assert.deepEqual(read.accessoryIds, [])
    assert.ok(validateAvatarLoadout(read, getDefaultOwnedItemIds("avatar")).ok, `${starter.bodyId} fallback is not wearable`)
  }
})

test("saving a look with a retired piece is refused even when the account owns it", () => {
  const girl = DEFAULT_FEMALE_AVATAR_LOADOUT
  const hair = AVATAR_LOADOUT_CATALOG.find((item) =>
    item.slot === "hair" && item.supportedBodyIds.includes(girl.bodyId) && isRetiredAvatarItemId(item.itemId))
  assert.ok(hair)
  const owned = [...getDefaultOwnedItemIds("avatar"), hair.itemId]
  const result = validateAvatarLoadout({ ...girl, hairId: hair.itemId }, owned)
  assert.equal(result.ok, false)
})

test("no receipt is left for an old, retired or starter item, and no sellable avatar item lacks one", () => {
  const receiptIds = BLUMI_R1_RELEASE_CATALOG.publishedItems.map((item) => item.itemId)
  for (const id of receiptIds) {
    assert.equal(RETIRING_AVATAR_ITEM_IDS.includes(id), false, `${id} is an old avatarV2 item with a receipt`)
    assert.equal(isRetiredAvatarItemId(id), false, `${id} is retired but keeps a receipt`)
    assert.notEqual(ECONOMY_CATALOG.find((item) => item.itemId === id)?.ownedByDefault, true, `${id} is a free starter with a receipt`)
  }
  const sellableAvatar = ECONOMY_CATALOG.filter((item) =>
    item.type === "avatar" && item.ownedByDefault !== true && !isRetiredAvatarItemId(item.itemId) &&
    !isReleaseCatalogItemHeld(item.itemId))
  for (const item of sellableAvatar) assert.ok(receiptIds.includes(item.itemId), `${item.itemId} is sellable without a receipt`)
})

test("the production catalog sells no retired avatar item", () => {
  const production = resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG)
  for (const item of production) {
    if (item.type !== "avatar" || !isRetiredAvatarItemId(item.itemId)) continue
    assert.equal(item.ownedByDefault, true, `${item.itemId} is a retired paid item in production`)
  }
})
