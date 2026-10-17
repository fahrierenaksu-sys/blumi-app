import assert from "node:assert/strict"
import test from "node:test"
import { ECONOMY_CATALOG } from "../economy/economyCatalog"
import { RESERVED_ROOM_ITEM_IDS, ROOM_V3_FURNITURE, STARTER_ROOM_BED_ID } from "../economy/roomFurnitureIds"
import {
  BLUMI_R1_RELEASE_CATALOG,
  isReleaseCatalogItemHeld,
  resolveR1PublishedEconomyCatalog,
  resolveUnheldEconomyCatalog
} from "../release/releaseCatalog"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  type AvatarLoadoutSlot
} from "../avatar/avatarLoadoutCatalog"
import { coerceAvatarLoadout } from "../avatar/avatarLoadoutCoercion"
import { toAvatarLoadoutV2, validateAvatarLoadout } from "../avatar/avatarLoadoutRules"
import { AVATAR_STILL_MANIFEST } from "../avatar/avatarStills"
import { RETIRED_AVATAR_ITEM_IDS } from "../avatar/retiredAvatarItems"
import { LEGACY_AVATAR_ITEM_REPLACEMENTS } from "../economy/economyCatalog"
import {
  isLegacyItemId,
  isRetiringAvatarItemId,
  LEGACY_AVATAR_ITEM_IDS,
  LEGACY_ROOM_ITEM_IDS,
  RETIRING_AVATAR_ITEM_IDS
} from "./legacyItemIds"

/** The six old flat room pieces retired in X8: in the registry, never an active economy entry again. */
const RETIRED_FLAT_ROOM_IDS = new Set([
  "room_v2_cozy_bed",
  "room_v2_cute_bookshelf",
  "room_v2_heart_rug",
  "room_v2_lamp_heart",
  "room_v2_side_table",
  "room_v2_table_round"
])

/** The 45 Universal Core candidate IDs removed with their code in X6: kept in the registry forever. */
const RETIRED_UNIVERSAL_CORE_IDS = [
  "universal_petal_side_table_a",
  "universal_cloud_loveseat_a",
  "universal_orbit_floor_lamp_a",
  "universal_tidy_work_desk_a",
  "universal_arc_coffee_table_b",
  "universal_cloud_accent_chair_b",
  "universal_round_dining_table_a",
  "universal_soft_media_console_b",
  "universal_open_bookshelf_a",
  "universal_table_lamp_a",
  "universal_wall_clock_a",
  "universal_small_tabletop_plant_a",
  "universal_ceramic_vase_set_a",
  "universal_books_magazine_stack_a",
  "universal_tea_coffee_tray_a",
  "universal_dining_chair_a",
  "universal_desk_chair_a",
  "universal_bench_a",
  "universal_soft_floor_cushion_a",
  "universal_pet_bed_a",
  "universal_nightstand_a",
  "universal_laundry_basket_a",
  "universal_cushion_set_a",
  "universal_vanity_table_a",
  "universal_shoe_cabinet_a",
  "universal_long_sofa_a",
  "universal_lounge_armchair_a",
  "universal_cloud_bed_b",
  "universal_rounded_wardrobe_a",
  "universal_soft_coat_stand_a",
  "universal_soft_pouf_b",
  "universal_arch_wall_mirror_a",
  "universal_storage_cabinet_a",
  "universal_dresser_a",
  "universal_console_table_a",
  "universal_large_standing_plant_a",
  "universal_wall_artwork_a",
  "universal_ceiling_light_a",
  "universal_curtain_set_a",
  "universal_decorative_object_set_a",
  "universal_small_speaker_a",
  "universal_rug_a",
  "universal_full_length_mirror_a",
  "universal_open_display_shelf_a",
  "universal_room_divider_a",
] as const

/** The 10 QA-only room ids (3 Focus-12 candidates, 7 VNext pilot ids): their code is gone, the ids stay reserved. */
const RETIRED_QA_ROOM_IDS = [
  "universal_cloud_sectional_sofa_a",
  "universal_cozy_tv_media_unit_a",
  "universal_home_arcade_a",
  "room_vnext_lounge_chair",
  "room_vnext_round_table",
  "room_vnext_side_table",
  "room_vnext_lamp",
  "room_vnext_bookshelf",
  "room_vnext_rug",
  "room_vnext_tabletop_plant"
] as const

const ROOM_V3_IDS = ROOM_V3_FURNITURE.map((item) => item.itemId)

test("L14: no new, reserved or kept id is in the legacy registry, and old ids are never reused", () => {
  const registry = [...LEGACY_ROOM_ITEM_IDS, ...LEGACY_AVATAR_ITEM_IDS]
  assert.equal(new Set(registry).size, registry.length, "registry ids are unique")
  for (const id of [...ROOM_V3_IDS, ...RESERVED_ROOM_ITEM_IDS, "room_v2_chair_blush", "room_v2_shell_blumi_world_v1"]) {
    assert.equal(isLegacyItemId(id), false, `${id} is active or reserved but listed as legacy`)
  }
  for (const item of ECONOMY_CATALOG) {
    assert.equal(isLegacyItemId(item.itemId), false, `${item.itemId}: a legacy id is an active economy entry`)
  }
  for (const item of AVATAR_LOADOUT_CATALOG) {
    assert.equal(isLegacyItemId(item.itemId), false, `${item.itemId}: a legacy id is wearable`)
  }
  const everyRegistered = [...registry, ...RETIRING_AVATAR_ITEM_IDS]
  assert.equal(new Set(everyRegistered).size, everyRegistered.length, "an id is either legacy or retiring, never both")
  for (const [bodyId, body] of Object.entries(AVATAR_STILL_MANIFEST.bodies)) {
    for (const id of [...Object.keys(body.items), ...Object.values(body.starter).filter((id): id is string => typeof id === "string")]) {
      assert.equal(isLegacyItemId(id) || isRetiringAvatarItemId(id), false, `${bodyId}: rig art ${id} is an old id`)
    }
  }
})

test("the room part of the registry holds the six old flat pieces and all 45 universal core candidates", () => {
  for (const id of RETIRED_FLAT_ROOM_IDS) assert.ok(isLegacyItemId(id), id)
  assert.equal(new Set(RETIRED_UNIVERSAL_CORE_IDS).size, 45)
  for (const id of RETIRED_UNIVERSAL_CORE_IDS) {
    assert.ok(isLegacyItemId(id), id)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} must never be sold again`)
  }
  assert.equal(LEGACY_ROOM_ITEM_IDS.length, 51 + RETIRED_QA_ROOM_IDS.length)
})

test("the 10 QA-only room ids are reserved: legacy and never sold", () => {
  assert.equal(new Set(RETIRED_QA_ROOM_IDS).size, 10)
  for (const id of RETIRED_QA_ROOM_IDS) {
    assert.ok(isLegacyItemId(id), `${id} must stay reserved`)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} must never be sold`)
  }
})

test("the 29 approved 2.5D pieces and the blush chair are sellable with a receipt or held without one; the starter bed never is", () => {
  // 27 approved 2026-10-10, plus the bunny pouf's mint and yellow colourways the owner approved on 2026-10-17
  assert.equal(ROOM_V3_IDS.length, 29)
  assert.equal(new Set(ROOM_V3_IDS).size, 29)
  const receiptedIds = new Set(BLUMI_R1_RELEASE_CATALOG.publishedItems.map((item) => item.itemId))
  for (const id of [...ROOM_V3_IDS, "room_v2_chair_blush"]) {
    // a piece is either receipted (sellable, held by no scope) or held (never sold): never both, never neither
    assert.notEqual(isReleaseCatalogItemHeld(id), receiptedIds.has(id), `${id} must be receipted xor held`)
    assert.ok(ECONOMY_CATALOG.some((item) => item.itemId === id && item.type === "room"), `${id} has no economy entry`)
  }
  for (const id of RESERVED_ROOM_ITEM_IDS) {
    assert.equal(isReleaseCatalogItemHeld(id), false, `${id} must never be held`)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} has no art yet, so no entry`)
  }
})

test("every sellable room piece has a real price, so lifting its hold never sells it for free; the starter bed stays free", () => {
  const sellableRoomIds = [...ROOM_V3_IDS, "room_v2_chair_blush"]
  assert.ok(sellableRoomIds.length > 0, "the guard scanned the furniture")
  for (const id of sellableRoomIds) {
    const entry = ECONOMY_CATALOG.find((item) => item.itemId === id && item.type === "room")
    assert.ok(entry, `${id} has no economy entry`)
    assert.ok(Number.isInteger(entry.priceCoins) && entry.priceCoins > 0, `${id} is priced ${entry.priceCoins}`)
    assert.notEqual(entry.ownedByDefault, true, `${id} must not be owned by default`)
  }
  const starterBed = ECONOMY_CATALOG.find((item) => item.itemId === STARTER_ROOM_BED_ID)
  assert.ok(starterBed)
  assert.equal(starterBed.priceCoins, 0)
  assert.equal(starterBed.ownedByDefault, true)
})

test("held items are neither sold nor listed in production or development projections; receipted ones are", () => {
  const receiptedIds = new Set(BLUMI_R1_RELEASE_CATALOG.publishedItems.map((item) => item.itemId))
  for (const projection of [resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG), resolveUnheldEconomyCatalog(ECONOMY_CATALOG)]) {
    for (const id of [...ROOM_V3_IDS, "room_v2_chair_blush"]) {
      assert.equal(projection.some((item) => item.itemId === id), receiptedIds.has(id) && !isReleaseCatalogItemHeld(id), id)
    }
  }
  // ownedByDefault starters stay in both
  assert.ok(resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG).some((item) => item.itemId === "avatar_v2_body_default"))
  assert.ok(resolveUnheldEconomyCatalog(ECONOMY_CATALOG).some((item) => item.itemId === "avatar_v2_body_default"))
})

const STARTERS = [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT] as const
const SLOT_KEYS: readonly (readonly [AvatarLoadoutSlot, "hairId" | "topId" | "bottomId" | "shoesId"])[] = [
  ["hair", "hairId"],
  ["top", "topId"],
  ["bottom", "bottomId"],
  ["shoes", "shoesId"]
]
const CATALOG_IDS = AVATAR_LOADOUT_CATALOG.map((item) => item.itemId)

function assertValidLook(loadout: unknown, label: string): void {
  const result = validateAvatarLoadout(loadout, CATALOG_IDS)
  assert.ok(result.ok, `${label}: ${result.ok ? "" : result.code}`)
}

test("every old avatar id has one defined behaviour: legacy and replaced, or retiring and still readable", () => {
  // legacy now: in no catalog, so no one can buy or wear it; an old inventory that owns it is granted the replacement
  assert.deepEqual([...LEGACY_AVATAR_ITEM_IDS].sort(), Object.keys(LEGACY_AVATAR_ITEM_REPLACEMENTS).sort())
  for (const id of LEGACY_AVATAR_ITEM_IDS) {
    assert.ok(isLegacyItemId(id), id)
    assert.equal(CATALOG_IDS.includes(id), false, `${id} must not be wearable`)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} must not be sold`)
    assert.ok(CATALOG_IDS.includes(LEGACY_AVATAR_ITEM_REPLACEMENTS[id]), `${id}: its replacement is not readable`)
  }
  // retiring: still in the catalog, so every stored loadout and inventory that holds one keeps reading
  assert.ok(RETIRING_AVATAR_ITEM_IDS.length > 0, "the retiring list is empty")
  assert.equal(new Set(RETIRING_AVATAR_ITEM_IDS).size, RETIRING_AVATAR_ITEM_IDS.length, "a retiring id is listed twice")
  for (const id of RETIRING_AVATAR_ITEM_IDS) {
    assert.equal(LEGACY_AVATAR_ITEM_IDS.includes(id), false, `${id} is already in the legacy avatar list`)
  }
  for (const id of RETIRING_AVATAR_ITEM_IDS) {
    assert.equal(isLegacyItemId(id), false, `${id} is not legacy before the catalog switch`)
    assert.ok(CATALOG_IDS.includes(id), `${id} is retiring but no longer readable`)
  }
  // the hidden (retired) ids are retiring ids too, so the catalog switch takes them along
  for (const id of RETIRED_AVATAR_ITEM_IDS) assert.ok(isRetiringAvatarItemId(id), id)
})

test("only the kept ids stay out of the retiring list: bodies, face constants and the rig starters", () => {
  const kept = new Set<string>()
  for (const starter of STARTERS) {
    for (const id of [starter.bodyId, starter.faceId, starter.eyesId, starter.noseId, starter.mouthId]) kept.add(id)
  }
  for (const body of Object.values(AVATAR_STILL_MANIFEST.bodies)) {
    for (const id of Object.keys(body.items)) kept.add(id)
  }
  const notRetiring = CATALOG_IDS.filter((id) => !isRetiringAvatarItemId(id))
  assert.deepEqual(new Set(notRetiring), kept)
})

test("an account that wears only old ids reads as a valid look for its body and its stored value is unchanged", () => {
  for (const starter of STARTERS) {
    const bodyId = starter.bodyId
    // every retiring id, in its own slot: kept while wearable, the body's starter piece when hidden or other-body
    for (const [slot, key] of SLOT_KEYS) {
      for (const item of AVATAR_LOADOUT_CATALOG.filter((entry) => entry.slot === slot)) {
        if (!isRetiringAvatarItemId(item.itemId)) continue
        for (const stored of [{ ...starter, [key]: item.itemId }, { ...toAvatarLoadoutV2(starter), [key]: item.itemId }]) {
          const before = JSON.stringify(stored)
          const read = coerceAvatarLoadout(stored, { presetId: bodyId })
          assertValidLook(read, `${bodyId} ${key}=${item.itemId}`)
          assert.equal(JSON.stringify(stored), before)
          const wearable = item.supportedBodyIds.includes(bodyId) && !RETIRED_AVATAR_ITEM_IDS.has(item.itemId)
          if (!wearable) assert.equal(read[key], starter[key], `${bodyId} ${key}=${item.itemId}`)
        }
      }
    }
    // a look made only of legacy and hidden ids: every slot is the body's starter piece
    const legacy = [...LEGACY_AVATAR_ITEM_IDS]
    const hidden = [...RETIRED_AVATAR_ITEM_IDS]
    for (const ids of [legacy, hidden]) {
      const stored = {
        ...toAvatarLoadoutV2(starter),
        hairId: ids[0], topId: ids[1], bottomId: ids[2], shoesId: ids[3],
        dressId: ids[1], accessoryIds: ids.slice(4, 6)
      }
      const read = coerceAvatarLoadout(stored, { presetId: bodyId })
      assertValidLook(read, `${bodyId} old look`)
      for (const [, key] of SLOT_KEYS) assert.equal(read[key], starter[key], `${bodyId} ${key}`)
      assert.equal(read.bodyId, bodyId)
    }
  }
})
