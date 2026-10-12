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
    for (const slot of Object.values(SLOT_BY_TYPE)) {
      const id = starter[slot]
      assert.equal(RETIRED_AVATAR_ITEM_IDS.has(id), false, id)
      const item = AVATAR_V2_CATALOG.find(x => x.id === id)
      assert.ok(item, id)
      assert.notEqual(item.hiddenFromWardrobe, true, id)
      assert.equal(canEquipAvatarV2Item({ ownedItemIds: [id] }, item, starter.bodyId), true, id)
      if (slot !== "shoesId") assertRoomAssetExists(id, slot === "hairId" ? "hairFrontId" : slot)
    }
    const resolved = resolveAvatarV2({ ...starter, accessoryIds: [] })
    for (const slot of Object.values(SLOT_BY_TYPE)) assert.equal(resolved[slot], starter[slot], `${starter.bodyId} ${slot}`)
  }
})
