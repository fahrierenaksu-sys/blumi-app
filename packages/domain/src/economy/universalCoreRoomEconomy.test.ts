import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import {
  ECONOMY_CATALOG,
  findEconomyCatalogItem,
  resolveEconomyCatalog
} from "./economyCatalog"
import {
  UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES,
  UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
  UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
  UNIVERSAL_CORE_ROOM_ITEM_IDS,
  UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
  UNIVERSAL_CORE_ROOM_PROMOTION_RECORD,
  UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
  resolvePromotedUniversalCoreRoomEconomyItems,
  type UniversalCoreRoomPromotionRecord
} from "./universalCoreRoomEconomy"

function createCompletePromotionRecord(): UniversalCoreRoomPromotionRecord {
  return {
    schemaVersion: UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
    buildIdentity: `git:${"a".repeat(40)}`,
    evidenceManifestId: "room-v3-universal-core-45-sku-evidence-v1",
    evidenceVerifierId: UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
    evidenceBundleSha256: `sha256:${"b".repeat(64)}`,
    artifactManifestId: UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
    candidateSetDigest: UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
    approvedItemIds: [...UNIVERSAL_CORE_ROOM_ITEM_IDS]
  }
}

test("the prepared Universal Core economy wave covers 45 unique, purchasable room products", () => {
  assert.equal(UNIVERSAL_CORE_ROOM_ITEM_IDS.length, 45)
  assert.equal(new Set(UNIVERSAL_CORE_ROOM_ITEM_IDS).size, 45)
  assert.equal(UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES.length, 45)
  assert.deepEqual(
    UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES.map((item) => item.itemId),
    [...UNIVERSAL_CORE_ROOM_ITEM_IDS]
  )

  for (const item of UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES) {
    assert.equal(item.type, "room")
    assert.ok(item.title.trim().length > 0, `${item.itemId} needs a player-facing title`)
    assert.ok(Number.isInteger(item.priceCoins), `${item.itemId} needs an integer price`)
    assert.equal(
      item.priceCoins % 10,
      0,
      `${item.itemId} must use the consistent 10-coin price ladder`
    )
    assert.ok(
      item.priceCoins >= 100 && item.priceCoins <= 650,
      `${item.itemId} must stay inside the accessible home price ladder`
    )
    assert.equal(item.ownedByDefault, undefined)
  }
})

test("the canonical candidate-set digest is reproducible from the ordered shared IDs", () => {
  const digest = createHash("sha256")
    .update(UNIVERSAL_CORE_ROOM_ITEM_IDS.join("\n"))
    .digest("hex")

  assert.equal(UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST, `sha256:${digest}`)
})

test("the home price ladder preserves believable product value tiers", () => {
  const price = (itemId: (typeof UNIVERSAL_CORE_ROOM_ITEM_IDS)[number]): number => {
    const item = UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES.find(
      (candidate) => candidate.itemId === itemId
    )
    assert.ok(item, `${itemId} needs an economy candidate`)
    return item.priceCoins
  }

  assert.ok(price("universal_long_sofa_a") >= price("universal_cloud_loveseat_a"))
  assert.ok(price("universal_cloud_loveseat_a") > price("universal_cloud_accent_chair_b"))
  assert.ok(price("universal_cloud_bed_b") >= price("universal_long_sofa_a"))
  assert.ok(price("universal_rounded_wardrobe_a") >= price("universal_storage_cabinet_a"))
  assert.ok(price("universal_storage_cabinet_a") > price("universal_shoe_cabinet_a"))
  assert.ok(price("universal_arc_coffee_table_b") > price("universal_table_lamp_a"))
  assert.ok(price("universal_round_dining_table_a") > price("universal_arc_coffee_table_b"))
  assert.ok(price("universal_arc_coffee_table_b") > price("universal_petal_side_table_a"))
  assert.ok(price("universal_tidy_work_desk_a") > price("universal_books_magazine_stack_a"))
  assert.ok(price("universal_orbit_floor_lamp_a") > price("universal_table_lamp_a"))
  assert.ok(
    price("universal_large_standing_plant_a") >
      price("universal_small_tabletop_plant_a")
  )
  assert.ok(
    price("universal_full_length_mirror_a") >
      price("universal_arch_wall_mirror_a")
  )
  assert.ok(price("universal_lounge_armchair_a") > price("universal_soft_pouf_b"))
})

test("Universal Core economy remains fail-closed without one complete immutable promotion record", () => {
  assert.equal(UNIVERSAL_CORE_ROOM_PROMOTION_RECORD, null)
  assert.deepEqual(resolvePromotedUniversalCoreRoomEconomyItems(), [])
  assert.deepEqual(resolvePromotedUniversalCoreRoomEconomyItems(null), [])
  assert.doesNotThrow(() => {
    assert.deepEqual(
      resolvePromotedUniversalCoreRoomEconomyItems(
        {} as UniversalCoreRoomPromotionRecord
      ),
      []
    )
    assert.deepEqual(
      resolvePromotedUniversalCoreRoomEconomyItems({
        schemaVersion: UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
        buildIdentity: "forged-build",
        evidenceManifestId: "forged-evidence",
        artifactManifestId: UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
        candidateSetDigest: UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
        approvedItemIds: null
      } as unknown as UniversalCoreRoomPromotionRecord),
      []
    )
  })

  const complete = createCompletePromotionRecord()
  for (const invalidRecord of [
    { ...complete, schemaVersion: "room-v3-universal-core-promotion-v0" },
    { ...complete, buildIdentity: " " },
    { ...complete, buildIdentity: "mutable-build-label" },
    { ...complete, evidenceManifestId: "" },
    { ...complete, evidenceVerifierId: "untrusted-verifier" },
    { ...complete, evidenceBundleSha256: "sha256:not-a-digest" },
    { ...complete, artifactManifestId: " " },
    { ...complete, artifactManifestId: "untrusted-artifact-manifest" },
    { ...complete, candidateSetDigest: "sha256:untrusted" },
    { ...complete, approvedItemIds: complete.approvedItemIds.slice(1) },
    {
      ...complete,
      approvedItemIds: [
        ...complete.approvedItemIds.slice(0, -1),
        complete.approvedItemIds[0]!
      ]
    },
    {
      ...complete,
      approvedItemIds: [
        ...complete.approvedItemIds.slice(0, -1),
        "untrusted_room_item"
      ]
    }
  ] satisfies UniversalCoreRoomPromotionRecord[]) {
    assert.deepEqual(resolvePromotedUniversalCoreRoomEconomyItems(invalidRecord), [])
  }
})

test("one complete shared promotion record unlocks exactly 45 immutable economy copies", () => {
  const first = resolvePromotedUniversalCoreRoomEconomyItems(
    createCompletePromotionRecord()
  )
  const second = resolvePromotedUniversalCoreRoomEconomyItems(
    createCompletePromotionRecord()
  )

  assert.equal(first.length, 45)
  assert.deepEqual(first, UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES)
  assert.notEqual(first, second)
  assert.notEqual(first[0], second[0])

  const canonicalTitle = UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES[0]?.title
  if (first[0]) first[0] = { ...first[0], title: "mutated output" }
  const third = resolvePromotedUniversalCoreRoomEconomyItems(
    createCompletePromotionRecord()
  )
  assert.equal(third[0]?.title, canonicalTitle)
})

test("the live server-authoritative economy catalog does not expose the unpromoted wave", () => {
  const liveUniversalCoreIds = ECONOMY_CATALOG
    .filter((item) => item.type === "room")
    .map((item) => item.itemId)
    .filter((itemId) => itemId.startsWith("universal_"))

  assert.deepEqual(liveUniversalCoreIds, [])
})

test("an injected complete promotion record yields a promoted lookup without mutating the live economy catalog", () => {
  const promotedCatalog = resolveEconomyCatalog(createCompletePromotionRecord())

  assert.equal(
    findEconomyCatalogItem("universal_cloud_loveseat_a", "room"),
    null
  )

  const promotedLoveseat = findEconomyCatalogItem(
    "universal_cloud_loveseat_a",
    "room",
    promotedCatalog
  )
  assert.deepEqual(promotedLoveseat, {
    itemId: "universal_cloud_loveseat_a",
    type: "room",
    title: "Cloud Loveseat",
    priceCoins: 520,
    grantedItemIds: undefined
  })

  if (promotedCatalog[0]) promotedCatalog[0] = { ...promotedCatalog[0], title: "mutated" }
  assert.notEqual(
    resolveEconomyCatalog(createCompletePromotionRecord())[0]?.title,
    "mutated"
  )
  assert.equal(
    findEconomyCatalogItem("universal_cloud_loveseat_a", "room"),
    null
  )
})
