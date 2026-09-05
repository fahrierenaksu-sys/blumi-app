import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_V3_FURNITURE_PILOT_CANDIDATES,
  validateRoomV3FurnitureCandidate
} from "./roomV3FurnitureCandidateGate"

test("complete declared evidence still cannot make a furniture candidate ready before artifact verification", () => {
  const candidate = {
    ...ROOM_V3_FURNITURE_PILOT_CANDIDATES[0],
    technicalEvidence: {
      alphaAuditId: "qa-cocoa-chair-alpha",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "qa-cocoa-chair-art",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "cocoa wood",
        "cream boucle",
        "soft brass",
        "mint or blush accent"
      ]
    },
    runtimeEvidence: {
      scaleSceneEvidenceId: "qa-cocoa-chair-scale",
      depthLaneEvidenceId: "qa-cocoa-chair-depth",
      collisionEvidenceId: "qa-cocoa-chair-collision",
      seatingEvidenceId: "qa-cocoa-chair-seating",
      simulatorEvidenceId: "qa-cocoa-chair-simulator",
      independentReviewId: "qa-cocoa-chair-independent"
    },
    artifactBaselinesByRotation: {
      front: declaredBaseline("a"),
      back: declaredBaseline("b"),
      left: declaredBaseline("c"),
      right: declaredBaseline("d")
    }
  }

  const validation = validateRoomV3FurnitureCandidate(candidate)

  assert.equal(validation.hasCompleteDeclaredEvidence, true)
  assert.equal(validation.isReadyForRuntime, false)
  assert.deepEqual(validation.issueIds, ["artifact_verifier_required"])
})

test("submitted chair pilots stay blocked until their real visual and runtime evidence exists", () => {
  const diningChairCandidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_dining_chair_a"
  )
  const loungeArmchairCandidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_lounge_armchair_a"
  )

  assert.ok(diningChairCandidate)
  assert.ok(loungeArmchairCandidate)

  const diningChair = validateRoomV3FurnitureCandidate(diningChairCandidate)
  const loungeArmchair = validateRoomV3FurnitureCandidate(loungeArmchairCandidate)

  assert.equal(diningChair.hasCompleteDeclaredEvidence, false)
  assert.ok(!diningChair.issueIds.includes("missing_verified_asset_hashes"))
  assert.ok(diningChair.issueIds.includes("style_review_not_approved"))
  assert.ok(diningChair.issueIds.includes("collection_material_mismatch"))
  assert.ok(diningChair.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(diningChair.issueIds.includes("missing_independent_review"))

  assert.equal(loungeArmchair.hasCompleteDeclaredEvidence, false)
  assert.ok(loungeArmchair.issueIds.includes("missing_directional_asset"))
  assert.ok(loungeArmchair.issueIds.includes("missing_verified_asset_hashes"))
  assert.ok(loungeArmchair.issueIds.includes("missing_seating_evidence"))
})

test("the regenerated Cocoa dining-chair pilot has four real artifacts but remains blocked pending visual and runtime QA", () => {
  const regeneratedChair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_dining_chair_b"
  )

  assert.ok(regeneratedChair)
  assert.deepEqual(Object.keys(regeneratedChair.assetPathsByRotation), [
    "front",
    "back",
    "left",
    "right"
  ])

  const validation = validateRoomV3FurnitureCandidate(regeneratedChair)

  assert.equal(validation.hasCompleteDeclaredEvidence, false)
  assert.ok(!validation.issueIds.includes("missing_directional_asset"))
  assert.ok(!validation.issueIds.includes("missing_verified_asset_hashes"))
  assert.ok(validation.issueIds.includes("style_review_not_approved"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(validation.issueIds.includes("missing_seating_evidence"))
})

test("the normalized Cocoa dining-chair D records its independent visual pass but stays runtime-blocked", () => {
  const normalizedChair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_dining_chair_d"
  )

  assert.ok(normalizedChair)

  const validation = validateRoomV3FurnitureCandidate(normalizedChair)

  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(!validation.issueIds.includes("inconsistent_floor_contact_line"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("the Cocoa lounge-armchair B records its independent visual hold without entering runtime", () => {
  const loungeArmchair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_lounge_armchair_b"
  )

  assert.ok(loungeArmchair)

  const validation = validateRoomV3FurnitureCandidate(loungeArmchair)

  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(!validation.issueIds.includes("inconsistent_floor_contact_line"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("the neutral side-table candidate passes independent art review but remains runtime-blocked", () => {
  const sideTable = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_petal_side_table_a"
  )

  assert.ok(sideTable)

  const validation = validateRoomV3FurnitureCandidate(sideTable)

  assert.equal(sideTable.homeTheme, "universal_core")
  assert.equal(sideTable.isSeatable, false)
  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(!validation.issueIds.includes("inconsistent_floor_contact_line"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(!validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("the neutral loveseat keeps its seating runtime evidence blocked after visual approval", () => {
  const loveseat = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_cloud_loveseat_a"
  )

  assert.ok(loveseat)

  const validation = validateRoomV3FurnitureCandidate(loveseat)

  assert.equal(loveseat.homeTheme, "universal_core")
  assert.equal(loveseat.isSeatable, true)
  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("the neutral floor-lamp candidate records the visual hold without becoming runtime-ready", () => {
  const floorLamp = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_orbit_floor_lamp_a"
  )

  assert.ok(floorLamp)

  const validation = validateRoomV3FurnitureCandidate(floorLamp)

  assert.equal(floorLamp.homeTheme, "universal_core")
  assert.equal(floorLamp.isSeatable, false)
  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(!validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("the neutral work-desk visual pass still remains blocked before Room V2 evidence", () => {
  const workDesk = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_tidy_work_desk_a"
  )

  assert.ok(workDesk)

  const validation = validateRoomV3FurnitureCandidate(workDesk)

  assert.equal(workDesk.homeTheme, "universal_core")
  assert.equal(workDesk.isSeatable, false)
  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(!validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("the painterly universal coffee-table B passes art review but remains runtime-blocked", () => {
  const coffeeTable = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_arc_coffee_table_b"
  )

  assert.ok(coffeeTable)

  const validation = validateRoomV3FurnitureCandidate(coffeeTable)

  assert.equal(coffeeTable.homeTheme, "universal_core")
  assert.equal(coffeeTable.isSeatable, false)
  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(!validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("the painterly universal accent-chair B remains seating-runtime-blocked after art approval", () => {
  const accentChair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_cloud_accent_chair_b"
  )

  assert.ok(accentChair)

  const validation = validateRoomV3FurnitureCandidate(accentChair)

  assert.equal(accentChair.homeTheme, "universal_core")
  assert.equal(accentChair.isSeatable, true)
  assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(!validation.issueIds.includes("style_review_not_approved"))
  assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
  assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
  assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
  assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
  assert.ok(validation.issueIds.includes("missing_seating_evidence"))
  assert.equal(validation.isReadyForRuntime, false)
})

test("new timeless universal decor candidates stay catalog-blocked until Room V2 evidence exists", () => {
  for (const id of [
    "universal_round_dining_table_a",
    "universal_soft_media_console_b",
    "universal_open_bookshelf_a"
  ] as const) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )

    assert.ok(candidate)
    const validation = validateRoomV3FurnitureCandidate(candidate)
    assert.equal(candidate.homeTheme, "universal_core")
    assert.equal(candidate.isSeatable, false)
    assert.ok(!validation.issueIds.includes("missing_alpha_or_grounding_review"))
    assert.ok(!validation.issueIds.includes("style_review_not_approved"))
    assert.ok(!validation.issueIds.includes("missing_mobile_readability_review"))
    assert.ok(!validation.issueIds.includes("directional_art_not_verified"))
    assert.ok(!validation.issueIds.includes("collection_material_mismatch"))
    assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
    assert.ok(!validation.issueIds.includes("missing_seating_evidence"))
    assert.equal(validation.isReadyForRuntime, false)
  }
})

test("universal long sofa keeps four genuine directions and remains fail-closed", () => {
  const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (entry) => entry.id === "universal_long_sofa_a"
  )

  assert.ok(candidate)
  assert.equal(candidate.homeTheme, "universal_core")
  assert.equal(candidate.isSeatable, true)
  assert.deepEqual(Object.keys(candidate.assetPathsByRotation).sort(), [
    "back",
    "front",
    "left",
    "right"
  ])
  assert.equal(
    new Set(Object.values(candidate.assetPathsByRotation)).size,
    4
  )

  const validation = validateRoomV3FurnitureCandidate(candidate)
  assert.equal(validation.isReadyForRuntime, false)
  assert.ok(validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(validation.issueIds.includes("artifact_verifier_required"))
})

test("universal lounge armchair has genuine directional artwork and stays held for alpha cleanup", () => {
  const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (entry) => entry.id === "universal_lounge_armchair_a"
  )

  assert.ok(candidate)
  assert.equal(candidate.isSeatable, true)
  assert.equal(Object.keys(candidate.assetPathsByRotation).length, 4)
  const validation = validateRoomV3FurnitureCandidate(candidate)
  assert.equal(validation.isReadyForRuntime, false)
  assert.ok(validation.issueIds.includes("missing_alpha_or_grounding_review"))
  assert.ok(validation.issueIds.includes("artifact_verifier_required"))
})

test("the existing neutral furniture wave covers bed, wardrobe, media, coat, pouf, and wall-mirror categories", () => {
  for (const id of [
    "universal_lounge_armchair_a",
    "universal_cloud_bed_b",
    "universal_rounded_wardrobe_a",
    "universal_soft_media_console_a",
    "universal_soft_coat_stand_a",
    "universal_soft_pouf_b",
    "universal_arch_wall_mirror_a"
  ] as const) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )
    assert.ok(candidate)
    const validation = validateRoomV3FurnitureCandidate(candidate)
    assert.equal(validation.isReadyForRuntime, false)
    assert.ok(validation.issueIds.includes("artifact_verifier_required"))
    assert.ok(!validation.issueIds.includes("missing_verified_asset_hashes"))
  }
})

test("surface-aware universal props preserve their placement contract and stay fail-closed", () => {
  for (const [id, placementSurface] of [
    ["universal_wall_artwork_a", "wall"],
    ["universal_arch_wall_mirror_a", "wall"],
    ["universal_ceiling_light_a", "ceiling"],
    ["universal_curtain_set_a", "wall"],
    ["universal_decorative_object_set_a", "tabletop"]
  ] as const) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )
    assert.ok(candidate)
    assert.equal(candidate.placementSurface, placementSurface)
    assert.equal(candidate.requiresDirectionalAssets, false)
    assert.equal(validateRoomV3FurnitureCandidate(candidate).isReadyForRuntime, false)
  }
})

test("universal candidate gate keeps floor and tabletop custom semantics aligned with runtime", () => {
  for (const [id, placementSurface] of [
    ["universal_small_speaker_a", "floor"],
    ["universal_rug_a", "floor"],
    ["universal_cushion_set_a", "floor"]
  ] as const) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )
    assert.ok(candidate)
    assert.equal(candidate.placementSurface, placementSurface)
    assert.equal(candidate.requiresDirectionalAssets, id !== "universal_cushion_set_a")
    assert.equal(validateRoomV3FurnitureCandidate(candidate).isReadyForRuntime, false)
  }
})

test("a rotation cannot reuse one source path or bypass material compatibility", () => {
  const candidate = {
    ...ROOM_V3_FURNITURE_PILOT_CANDIDATES[0],
    assetPathsByRotation: {
      front: "front.png",
      back: "front.png",
      left: "left.png",
      right: "right.png"
    },
    artifactBaselinesByRotation: {
      front: declaredBaseline("a"),
      back: declaredBaseline("b"),
      left: declaredBaseline("c"),
      right: declaredBaseline("d")
    },
    technicalEvidence: {
      alphaAuditId: "qa-technical",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "qa-art",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: ["cold chrome"]
    },
    runtimeEvidence: {
      scaleSceneEvidenceId: "qa-scale",
      depthLaneEvidenceId: "qa-depth",
      collisionEvidenceId: "qa-collision",
      seatingEvidenceId: "qa-seating",
      simulatorEvidenceId: "qa-simulator",
      independentReviewId: "qa-independent"
    }
  }

  const validation = validateRoomV3FurnitureCandidate(candidate)

  assert.ok(validation.issueIds.includes("reused_directional_asset"))
  assert.ok(validation.issueIds.includes("collection_material_mismatch"))
  assert.equal(validation.hasCompleteDeclaredEvidence, false)
})

test("a chair cannot assert shared grounding when its verified rotation baselines drift", () => {
  const candidate = {
    ...ROOM_V3_FURNITURE_PILOT_CANDIDATES[0],
    artifactBaselinesByRotation: {
      front: declaredBaseline("a"),
      back: declaredBaseline("b"),
      left: declaredBaseline("c"),
      right: {
        ...declaredBaseline("d"),
        alphaBounds: {
          minX: 50,
          minY: 50,
          maxXInclusive: 799,
          maxYInclusive: 1_004
        }
      }
    },
    technicalEvidence: {
      alphaAuditId: "qa-grounding",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    }
  }

  const validation = validateRoomV3FurnitureCandidate(candidate)

  assert.ok(validation.issueIds.includes("inconsistent_floor_contact_line"))
  assert.equal(validation.hasCompleteDeclaredEvidence, false)
})

test("a universal-core candidate is checked against the neutral cross-room material contract", () => {
  const candidate = {
    id: "universal_cloud_loveseat_a" as const,
    homeTheme: "universal_core" as const,
    categoryLabel: "Universal loveseat",
    isSeatable: true,
    assetPathsByRotation: {
      front: "front.png",
      back: "back.png",
      left: "left.png",
      right: "right.png"
    },
    artifactBaselinesByRotation: {
      front: declaredBaseline("a"),
      back: declaredBaseline("b"),
      left: declaredBaseline("c"),
      right: declaredBaseline("d")
    },
    technicalEvidence: {
      alphaAuditId: "qa-universal-alpha",
      hasCleanAlpha: true,
      hasNoHalo: true,
      hasTransparentCorners: true,
      hasNoBakedBackground: true,
      hasTightBounds: true,
      hasSharedFloorContact: true
    },
    artEvidence: {
      visualReviewId: "qa-universal-art",
      matchesBlumiPainterlyStyle: true,
      hasStrongMobileSilhouette: true,
      directionsAreGenuine: true,
      visibleMaterialFamilies: [
        "pale ash or pale oak",
        "cloud-white upholstery or ivory ceramic",
        "soft charcoal detail",
        "restrained soft brass"
      ]
    },
    runtimeEvidence: {
      scaleSceneEvidenceId: "qa-universal-scale",
      depthLaneEvidenceId: "qa-universal-depth",
      collisionEvidenceId: "qa-universal-collision",
      seatingEvidenceId: "qa-universal-seat",
      simulatorEvidenceId: "qa-universal-simulator",
      independentReviewId: "qa-universal-independent"
    }
  }

  const validation = validateRoomV3FurnitureCandidate(candidate)

  assert.equal(validation.hasCompleteDeclaredEvidence, true)
  assert.deepEqual(validation.issueIds, ["artifact_verifier_required"])
})

test("the universal soft floor cushion follows the production plan as decor, not seating", () => {
  const cushion = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_soft_floor_cushion_a"
  )

  assert.ok(cushion)
  assert.equal(cushion.isSeatable, false)
})

test("single-view wall and tabletop pilots do not require fake directional rotations", () => {
  for (const id of [
    "universal_table_lamp_a",
    "universal_wall_clock_a",
    "universal_small_tabletop_plant_a",
    "universal_ceramic_vase_set_a",
    "universal_books_magazine_stack_a",
    "universal_tea_coffee_tray_a"
  ] as const) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )
    assert.ok(candidate)
    assert.equal(candidate.requiresDirectionalAssets, false)
    const validation = validateRoomV3FurnitureCandidate(candidate)
    assert.ok(!validation.issueIds.includes("missing_directional_asset"))
    assert.ok(!validation.issueIds.includes("missing_verified_asset_hashes"))
    assert.ok(validation.issueIds.includes("missing_runtime_scale_evidence"))
    assert.equal(validation.isReadyForRuntime, false)
  }
})

test("runtime-v2 repair wave binds immutable artifacts while visual failures stay blocked", () => {
  const expectedDirectionsById = {
    universal_console_table_a: ["front", "back", "left", "right"],
    universal_large_standing_plant_a: ["front", "back", "left", "right"],
    universal_curtain_set_a: ["front"],
    universal_decorative_object_set_a: ["front"]
  } as const

  for (const [id, rotations] of Object.entries(expectedDirectionsById)) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )
    assert.ok(candidate, id)
    assert.equal(candidate.technicalEvidence?.hasCleanAlpha, true, id)
    assert.equal(candidate.technicalEvidence?.hasNoHalo, false, id)

    for (const rotation of rotations) {
      assert.match(
        candidate.assetPathsByRotation[rotation] ?? "",
        new RegExp(`${id}_${rotation}_runtime_v2\\.png$`),
        `${id}:${rotation}`
      )
    }
  }

  for (const id of [
    "universal_console_table_a",
    "universal_large_standing_plant_a"
  ] as const) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
      (entry) => entry.id === id
    )
    assert.ok(candidate)
    assert.equal(candidate.artEvidence?.hasStrongMobileSilhouette, false, id)
    assert.equal(candidate.artEvidence?.directionsAreGenuine, false, id)
  }
})

function declaredBaseline(seed: string) {
  return {
    sha256: seed.repeat(64),
    width: 850,
    height: 1040,
    alphaBounds: { minX: 50, minY: 50, maxXInclusive: 799, maxYInclusive: 999 },
    transparentPixelCount: 500_000,
    partialAlphaPixelCount: 5_000
  }
}
