import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"
import { RETIRED_AVATAR_ITEM_IDS, DEFAULT_MALE_AVATAR_LOADOUT, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"

require.extensions[".png"] = (module, filename) => { module.exports = filename }
require.extensions[".webp"] = require.extensions[".png"]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AVATAR_V2_CATALOG } = require("./avatarV2Catalog") as typeof import("./avatarV2Catalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveAvatarV2, canEquipAvatarV2Item } = require("./avatarV2Selectors") as typeof import("./avatarV2Selectors")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoomCatalog") as typeof import("./room/avatarRoomCatalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AVATAR_ITEM_ART } = require("../avatar/model/avatarItemArt") as typeof import("../avatar/model/avatarItemArt")

function assertRoomAssetExists(id: string, slot: "topId" | "bottomId" | "hairFrontId") {
  const roomId = DEFAULT_AVATAR_ROOM_PROJECTION_MAP[id]?.[slot]
  const roomItem = ROOM_AVATAR_CATALOG.find(x => x.id === roomId)
  assert.ok(roomItem && existsSync(String(roomItem.asset.source)), id)
}

const SLOT_BY_TYPE = { hair: "hairId", top: "topId", bottom: "bottomId", shoes: "shoesId" } as const

// Plan X15 (owner yes 2026-10-12): every old avatarV2 item is retired; the IDs stay, the items are hidden.
test("retired wardrobe entries preserve IDs but cannot be browsed or equipped even when owned", () => {
  assert.ok(RETIRED_AVATAR_ITEM_IDS.size > 0)
  for (const id of RETIRED_AVATAR_ITEM_IDS) {
    const item = AVATAR_V2_CATALOG.find(x => x.id === id)
    if (!item) continue // a dress's paired bottom lives only in the domain loadout catalog
    assert.equal(item.hiddenFromShop, true, id)
    assert.equal(item.hiddenFromWardrobe, true, id)
    const starter = id.includes("_male_") ? DEFAULT_MALE_AVATAR_LOADOUT : DEFAULT_FEMALE_AVATAR_LOADOUT
    assert.equal(canEquipAvatarV2Item({ ownedItemIds: [id] }, item, starter.bodyId), false, id)
    const slot = SLOT_BY_TYPE[item.type as keyof typeof SLOT_BY_TYPE]
    if (!slot) continue
    const result = resolveAvatarV2({ ...starter, accessoryIds: [...starter.accessoryIds], [slot]: id })
    assert.equal(result[slot], starter[slot], id)
  }
})

test("both starter looks stay browsable and equippable with their room art", () => {
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    const rig = starter === DEFAULT_MALE_AVATAR_LOADOUT ? "male" : "female"
    for (const slot of Object.values(SLOT_BY_TYPE)) {
      const id = starter[slot]
      assert.equal(RETIRED_AVATAR_ITEM_IDS.has(id), false, id)
      const item = AVATAR_V2_CATALOG.find(x => x.id === id)
      assert.ok(item, id)
      assert.notEqual(item.hiddenFromWardrobe, true, id)
      assert.equal(canEquipAvatarV2Item({ ownedItemIds: [id] }, item, starter.bodyId), true, id)
      // the room draws each starter piece with its body's 2.5D rig
      assert.ok(AVATAR_ITEM_ART[rig][id], `${id} has no ${rig} rig art`)
      // the girl's starter also keeps its old room drawing (the legacy renderer fallback)
      if (rig === "female" && slot !== "shoesId") assertRoomAssetExists(id, slot === "hairId" ? "hairFrontId" : slot)
    }
    const resolved = resolveAvatarV2({ ...starter, accessoryIds: [] })
    for (const slot of Object.values(SLOT_BY_TYPE)) assert.equal(resolved[slot], starter[slot], `${starter.bodyId} ${slot}`)
  }
})

test("a boy still wearing his former starter (side part + interim garments) is shown in the curls and basic_a", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { normalizeAvatarV2ForBody } = require("./avatarBodyCompatibility") as typeof import("./avatarBodyCompatibility")
  const boy = DEFAULT_MALE_AVATAR_LOADOUT
  const former = {
    ...boy,
    accessoryIds: [],
    hairId: "avatar_v2_hair_male_soft_black_side_part",
    topId: "avatar_v2_top_male_powder_blue_crew_tee",
    bottomId: "avatar_v2_bottom_male_navy_straight_pants",
    shoesId: "avatar_v2_shoes_male_milk_tea_court"
  }
  const expected = [
    "avatar_v2_hair_male_blue_black_curls",
    "avatar_v2_top_male_white_basic_tee",
    "avatar_v2_bottom_male_black_straight_trousers",
    "avatar_v2_shoes_male_black_clean_sneakers"
  ]
  for (const shown of [resolveAvatarV2(former), normalizeAvatarV2ForBody(former, boy.bodyId, AVATAR_V2_CATALOG)]) {
    assert.deepEqual([shown.hairId, shown.topId, shown.bottomId, shown.shoesId], expected)
  }
  const girl = resolveAvatarV2({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: [] })
  assert.equal(girl.hairId, DEFAULT_FEMALE_AVATAR_LOADOUT.hairId, "the girl's starter is unchanged")
})
