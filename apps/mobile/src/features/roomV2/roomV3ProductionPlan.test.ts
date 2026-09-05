import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_V3_CATALOG_PRODUCTION_COUNTS,
  ROOM_V3_CANONICAL_SHELL_LANGUAGE,
  ROOM_V3_FURNITURE_CATEGORIES,
  ROOM_V3_HOME_COLLECTIONS,
  ROOM_V3_OPTIONAL_ROOM_DIRECTIONS,
  ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY,
  createRoomV3CatalogManifestPlan,
  createRoomV3UniversalCoreManifestPlan
} from "./roomV3ProductionPlan"

test("room V3 production plan exposes every required home, category, and asset count", () => {
  assert.equal(ROOM_V3_HOME_COLLECTIONS.length, 6)
  assert.deepEqual(
    ROOM_V3_HOME_COLLECTIONS.map((home) => home.catalogDirection),
    ["male", "male", "female", "female", "unisex", "unisex"]
  )
  assert.deepEqual(
    ROOM_V3_HOME_COLLECTIONS
      .filter((home) => home.catalogDirection === "male")
      .map((home) => home.id),
    ["cocoa_navy_modern_studio", "forest_terracotta_creative_loft"]
  )
  assert.deepEqual(
    ROOM_V3_HOME_COLLECTIONS.find((home) => home.id === "forest_terracotta_creative_loft")?.palette,
    ["muted forest green", "terracotta", "warm walnut", "soft beige"]
  )
  assert.ok(
    ROOM_V3_HOME_COLLECTIONS.every(
      (home) => home.furnitureCompatibility.requiredMaterialFamilies.length >= 3
    )
  )
  assert.deepEqual(
    ROOM_V3_HOME_COLLECTIONS.find((home) => home.id === "cocoa_navy_modern_studio")
      ?.furnitureCompatibility.requiredMaterialFamilies,
    ["cream boucle", "cocoa wood", "soft brass", "mint or blush accent"]
  )
  assert.deepEqual(
    ROOM_V3_HOME_COLLECTIONS.map((home) => home.architecturalVariation.door.wall),
    ["left", "left", "left", "left", "left", "left"]
  )
  assert.deepEqual(
    ROOM_V3_HOME_COLLECTIONS.map((home) => home.architecturalVariation.primaryWindow.wall),
    ["left", "left", "left", "left", "left", "left"]
  )
  assert.equal(
    new Set(
      ROOM_V3_HOME_COLLECTIONS.map((home) => home.architecturalVariation.primaryWindow.style)
    ).size,
    ROOM_V3_HOME_COLLECTIONS.length
  )
  assert.equal(
    new Set(ROOM_V3_HOME_COLLECTIONS.map((home) => home.architecturalVariation.floor.layout))
      .size,
    ROOM_V3_HOME_COLLECTIONS.length
  )
  assert.ok(
    ROOM_V3_HOME_COLLECTIONS.every(
      (home) => home.requiredVisualLanguage === ROOM_V3_CANONICAL_SHELL_LANGUAGE
    )
  )
  assert.equal(ROOM_V3_FURNITURE_CATEGORIES.length, 45)
  assert.equal(
    ROOM_V3_FURNITURE_CATEGORIES.find((category) => category.id === "wall_clock")?.placementRule,
    "wall_region"
  )
  assert.equal(
    ROOM_V3_FURNITURE_CATEGORIES.find((category) => category.id === "table_lamp")?.placementRule,
    "tabletop_support"
  )
  for (const categoryId of [
    "table_lamp",
    "small_tabletop_plant",
    "ceramic_vase_set",
    "books_magazine_stack",
    "tea_coffee_tray"
  ]) {
    const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
    assert.ok(category)
    assert.equal(category.placementSurface, "tabletop")
    assert.equal(category.placementRule, "tabletop_support")
  }
  for (const categoryId of ["small_speaker", "soft_floor_cushion", "rug", "cushion_set"]) {
    const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
    assert.ok(category)
    assert.equal(category.placementSurface, "floor")
    assert.equal(category.placementRule, "free_floor")
  }
  for (const categoryId of ["wall_clock", "wall_artwork"]) {
    const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId)
    assert.ok(category)
    assert.equal(category.placementSurface, "wall")
    assert.equal(category.placementRule, "wall_region")
  }
  const ceilingLight = ROOM_V3_FURNITURE_CATEGORIES.find(
    (category) => category.id === "ceiling_light"
  )
  assert.ok(ceilingLight)
  assert.equal(ceilingLight.placementSurface, "ceiling")
  assert.equal(ceilingLight.placementRule, "ceiling_region")
  assert.ok(
    ROOM_V3_FURNITURE_CATEGORIES
      .filter((category) => category.placementSurface === "floor")
      .every((category) => category.placementRule === "free_floor")
  )
  assert.equal(
    ROOM_V3_FURNITURE_CATEGORIES.filter((category) => category.requiresDirectionalAssets).length,
    33
  )
  assert.equal(
    ROOM_V3_FURNITURE_CATEGORIES.filter((category) => category.interactionType === "seat").length,
    9
  )
  assert.deepEqual(ROOM_V3_CATALOG_PRODUCTION_COUNTS, {
    roomShells: 6,
    logicalFurnitureProducts: 540,
    directionalFurnitureRenders: 1_584,
    singleViewFurnitureRenders: 144,
    interactionReadySeatingProducts: 108,
    metadataEntries: 546,
    catalogThumbnails: 540,
    minimumQaSheets: 601
  })
})

test("room V3 catalog manifest plan gives every future product a stable unique ID and two real variants", () => {
  const manifest = createRoomV3CatalogManifestPlan()

  assert.equal(manifest.length, 540)
  assert.equal(new Set(manifest.map((entry) => entry.id)).size, manifest.length)
  assert.equal(new Set(manifest.map((entry) => entry.thumbnailKey)).size, manifest.length)
  assert.equal(
    manifest.filter((entry) => entry.requiresDirectionalAssets).length,
    396
  )
  assert.equal(
    manifest.filter((entry) => entry.interactionType === "seat").length,
    108
  )
  for (const entry of manifest) {
    const materialFamilies = ROOM_V3_HOME_COLLECTIONS.find(
      (candidate) => candidate.id === entry.homeTheme
    )?.furnitureCompatibility.requiredMaterialFamilies

    assert.ok(materialFamilies)
    assert.deepEqual(entry.requiredMaterialFamilies, materialFamilies)
    assert.notEqual(entry.requiredMaterialFamilies, materialFamilies)
  }
  assert.equal(
    new Set(manifest.map((entry) => entry.requiredMaterialFamilies)).size,
    manifest.length
  )
  for (const home of ROOM_V3_HOME_COLLECTIONS) {
    for (const category of ROOM_V3_FURNITURE_CATEGORIES) {
      const variants = manifest.filter((entry) =>
        entry.homeTheme === home.id && entry.categoryId === category.id
      )
      assert.deepEqual(variants.map((entry) => entry.variant), ["a", "b"])
    }
  }
})

test("night cocoa direction keeps dark furniture readable and remains non-runtime", () => {
  assert.deepEqual(
    ROOM_V3_OPTIONAL_ROOM_DIRECTIONS.map((direction) => direction.id),
    ["ink_velvet_night_loft"]
  )

  const nightCocoa = ROOM_V3_OPTIONAL_ROOM_DIRECTIONS[0]

  assert.equal(nightCocoa.baseCollectionId, "cocoa_navy_modern_studio")
  assert.equal(nightCocoa.productionStatus, "direction_only")
  assert.equal(nightCocoa.runtimeEligible, false)
  assert.equal(nightCocoa.defaultSelection, false)
  assert.deepEqual(nightCocoa.furnitureCompatibility.requiredMaterialFamilies, [
    "warm ivory edge or upholstery",
    "cocoa walnut",
    "rose-brass detail",
    "muted amber accent"
  ])
  assert.deepEqual(nightCocoa.furnitureReadabilityRules, [
    "Every dark furniture silhouette needs a warm light edge, light upholstery, or rose-brass detail.",
    "No fully black rug or floor-hugging furniture silhouette.",
    "Keep the avatar and furniture readable at the vertical My Room card scale."
  ])
})

test("universal core furniture is deliberately compatible with every room rather than one theme", () => {
  const universalCore = createRoomV3UniversalCoreManifestPlan()
  const homeIds = ROOM_V3_HOME_COLLECTIONS.map((home) => home.id)

  assert.equal(universalCore.length, 45)
  assert.equal(new Set(universalCore.map((entry) => entry.id)).size, universalCore.length)
  assert.ok(
    universalCore.every((entry) => {
      assert.deepEqual(entry.compatibleHomeIds, homeIds)
      assert.notEqual(entry.compatibleHomeIds, homeIds)
      assert.deepEqual(entry.compatibleOptionalRoomDirectionIds, ["ink_velvet_night_loft"])
      assert.deepEqual(
        entry.requiredMaterialFamilies,
        ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY.requiredMaterialFamilies
      )
      assert.equal(
        entry.placementRule,
        entry.placementSurface === "floor"
          ? "free_floor"
          : entry.placementSurface === "wall"
            ? "wall_region"
            : entry.placementSurface === "ceiling"
              ? "ceiling_region"
              : "tabletop_support"
      )
      return entry.productionStatus === "planned"
    })
  )
  assert.ok(universalCore.every((entry) => entry.variant === "a"))
  assert.deepEqual(
    ROOM_V3_UNIVERSAL_CORE_FURNITURE_COMPATIBILITY.requiredMaterialFamilies,
    ["pale ash or pale oak", "cloud-white upholstery or ivory ceramic", "soft charcoal detail", "restrained soft brass"]
  )
})
