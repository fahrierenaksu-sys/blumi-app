import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const mobileRoot = resolve(import.meta.dirname, "..")
const uiTest = readFileSync(
  resolve(mobileRoot, "ios/BlumiMobileUITests/BlumiMobileUITests.swift"),
  "utf8"
)

test("native My Room perspective pilot captures every real desk rotation", () => {
  assert.match(
    uiTest,
    /testUniversalCorePerspectivePilotRendersEveryDeskRotation/
  )
  assert.match(uiTest, /my_room_current_viewport/)
  assert.match(uiTest, /openMyRoomForRoomQa\(\)/)
  assert.match(uiTest, /dismissDevelopmentWarningIfPresent\(\)/)
  assert.match(uiTest, /welcome-skip-action/)
  assert.match(uiTest, /Try the demo first/)
  assert.match(uiTest, /Open My Room tab/)
  assert.match(uiTest, /if !editRoom\.isHittable/)
  assert.match(uiTest, /app\.buttons\["Edit room"\]/)
  assert.match(uiTest, /app\.textFields\["Search room pieces"\]/)
  assert.match(uiTest, /typeTextReliably\("Tidy Work Desk", into: search\)/)
  assert.match(uiTest, /XCTAssertEqual\(field\.value as\? String, text\)/)
  assert.match(uiTest, /app\.swipeUp\(\)/)
  assert.doesNotMatch(uiTest, /let preview = app\.buttons/)
  assert.match(uiTest, /Place Tidy Work Desk in room/)
  for (const rotation of ["front", "back", "left", "right"]) {
    assert.match(
      uiTest,
      new RegExp(`universal_tidy_work_desk_a_${rotation}_my_room`)
    )
  }
})

test("native seating scale batch captures three high-risk products through the generic room editor route", () => {
  assert.match(
    uiTest,
    /testUniversalCoreSeatingScaleBatchRendersEveryRotation/
  )
  assert.match(uiTest, /captureRoomItemRotations\(/)
  assert.match(uiTest, /clearRoomSearch\(/)
  assert.match(uiTest, /Clear room piece search/)
  assert.match(uiTest, /value != "Search pieces"/)
  assert.match(uiTest, /assertUniversalCoreQaCatalogEnabled/)
  assert.match(uiTest, /45-piece room QA · catalog blocked/)
  assert.match(uiTest, /48-piece room QA · catalog blocked/)
  assert.match(uiTest, /label BEGINSWITH %@ OR label BEGINSWITH %@/)
  assert.match(
    uiTest,
    /private func assertUniversalCoreQaCatalogEnabled\(\) \{\s*let enabledCatalog = app\.descendants\(matching: \.any\)\.matching/s
  )
  assert.match(uiTest, /The Universal Core QA catalog must be enabled/)
  assert.match(uiTest, /assertNoReactNativeRedbox\(context:/)
  assert.match(uiTest, /waitForRoomQaEntryPoint\(timeout:/)
  assert.match(uiTest, /Date\(\) < deadline/)
  assert.match(uiTest, /app\.staticTexts\["redbox-error"\]/)
  assert.match(uiTest, /No script URL provided/)

  const products = [
    ["universal_cloud_loveseat_a", "Cloud Loveseat"],
    ["universal_dining_chair_a", "Cloud Dining Chair"],
    ["universal_cloud_bed_b", "Cloud Double Bed"]
  ]
  for (const [candidateId, name] of products) {
    assert.match(uiTest, new RegExp(`id: "${candidateId}"`))
    assert.match(uiTest, new RegExp(`name: "${name}"`))
  }
  assert.ok(uiTest.includes('app.buttons["Place \\(product.name) in room"]'))
  assert.ok(uiTest.includes('"Choose \\(rotation) view for \\(product.name)"'))
  assert.match(uiTest, /app\.buttons\["Remove selected room item"\]/)
})

test("full-wave native route accepts the dedicated cute v3 catalog label", () => {
  assert.match(uiTest, /assertActiveRoomQaCatalogEnabled\(\)/)
  assert.match(uiTest, /private func assertActiveRoomQaCatalogEnabled\(\)/)
  assert.match(
    uiTest,
    /Room VNext Full Wave · 45 candidate pieces · catalog blocked/
  )
  assert.match(
    uiTest,
    /Room VNext Cute v3 · 45 candidate pieces · catalog blocked/
  )
})

test("native seating fit batch proves the avatar enters and exits every calibrated seat", () => {
  assert.match(uiTest, /testUniversalCoreSeatingFitBatchRendersSitAndExit/)
  assert.match(uiTest, /captureRoomItemSeatingFit\(/)
  assert.match(uiTest, /removePlacedRoomItemIfPresent\(/)
  assert.match(uiTest, /selectRoomQaFrontRotation\(product\)/)
  assert.ok(uiTest.includes('"Choose front view for \\(product.name)"'))
  assert.ok(uiTest.includes('app.buttons["Sit on \\(product.name)"]'))
  assert.match(uiTest, /app\.buttons\["Walk in room"\]/)
  assert.match(uiTest, /app\.buttons\["Save room layout"\]/)
  assert.match(uiTest, /_sitting_current_my_room/)
  assert.match(uiTest, /_exit_current_my_room/)
  assert.match(uiTest, /waitForAvatarFrameChange\(/)
  assert.match(uiTest, /my-room-production-stage-item-my_room_owner_avatar/)
  assert.match(uiTest, /testCloudBedSeatFitCalibrationRendersSitAndExit/)
})

test("native seating persistence batch reopens and reuses every calibrated seat after relaunch", () => {
  assert.match(
    uiTest,
    /testUniversalCoreSeatingBatchPersistsAcrossRelaunch/
  )
  assert.match(uiTest, /captureRoomItemReloadedSeatingFit\(/)
  assert.match(uiTest, /app\.terminate\(\)/)
  assert.match(uiTest, /app\.launch\(\)/)
  assert.match(uiTest, /_sitting_after_relaunch_my_room/)
  assert.match(uiTest, /_exit_after_relaunch_my_room/)
  assert.match(uiTest, /Save the cleaned room layout/)
})

test("native male seating batch proves front sit/exit and fail-closed directional coverage", () => {
  assert.match(
    uiTest,
    /testUniversalCoreMaleSeatingBatchRendersEveryRotation/
  )
  assert.match(uiTest, /switchRoomQaAvatarToMale\(\)/)
  assert.match(uiTest, /clearRoomQaLayout\(\)/)
  assert.match(uiTest, /label BEGINSWITH %@ AND label CONTAINS %@/)
  assert.match(uiTest, /Open wardrobe/)
  assert.match(uiTest, /Open Bases wardrobe category/)
  assert.match(uiTest, /wardrobe-item-male_light/)
  assert.match(uiTest, /Masculine Light Base, Switch base/)
  assert.match(uiTest, /containing: "Wearing"/)
  assert.match(uiTest, /captureRoomItemDirectionalSeatingFit\(/)
  assert.match(uiTest, /if rotation == "front"/)
  assert.match(uiTest, /_male_sitting_my_room/)
  assert.match(uiTest, /_male_exit_my_room/)
  assert.match(uiTest, /Turn this seat to front to sit/)
  assert.match(uiTest, /_male_unsupported_sitting_my_room/)
  assert.match(uiTest, /waitForAvatarMotionValue\(/)
  assert.match(uiTest, /Sitting on \\\(product\.name\), \\\(rotation\) view/)
  assert.match(uiTest, /containing: "Standing,"/)
})

test("native room QA batches every remaining Universal Core SKU with rotation-bound screenshots", () => {
  assert.match(
    uiTest,
    /testUniversalCoreRemainingFurnitureBatchOneRendersRequiredRotations/
  )
  assert.match(
    uiTest,
    /testUniversalCoreRemainingFurnitureBatchTwoRendersRequiredRotations/
  )
  assert.match(
    uiTest,
    /testUniversalCoreRemainingFurnitureBatchThreeRendersRequiredRotations/
  )
  assert.match(uiTest, /captureRoomItemRequiredRotations/)
  assert.match(uiTest, /requiresTabletopSupport/)
  assert.match(uiTest, /placeTabletopSupportIfNeeded/)
  assert.match(uiTest, /Universal Round Dining Table/)
  assert.match(
    uiTest,
    /XCTAssertEqual\(remainingUniversalCoreProducts\.count,\s*42/
  )
  assert.ok(
    uiTest.includes(
      '"\\(product.id)_\\(rotation)_native_my_room"'
    )
  )
})

test("native room QA proves every remaining Universal Core seat survives save, relaunch, sit, and exit", () => {
  assert.match(
    uiTest,
    /testUniversalCoreRemainingSeatsPersistAcrossRelaunchAndRemainUsable/
  )
  assert.match(uiTest, /remainingUniversalCoreSeatProducts/)
  assert.match(uiTest, /XCTAssertEqual\(remainingUniversalCoreSeatProducts\.count,\s*6/)
  assert.match(uiTest, /captureRoomItemReloadedSeatingFit\(product\)/)

  for (const candidateId of [
    "universal_cloud_accent_chair_b",
    "universal_desk_chair_a",
    "universal_bench_a",
    "universal_long_sofa_a",
    "universal_lounge_armchair_a",
    "universal_soft_pouf_b"
  ]) {
    assert.match(uiTest, new RegExp(candidateId))
  }
})

test("native room QA visually recalibrates every Universal Core seat after seat-height changes", () => {
  assert.match(uiTest, /testUniversalCoreAllSeatsRenderSettledSittingPose/)
  assert.match(uiTest, /allUniversalCoreSeatProducts/)
  assert.match(uiTest, /XCTAssertEqual\(allUniversalCoreSeatProducts\.count,\s*9/)
  assert.match(uiTest, /captureRoomItemSettledSittingPose\(product\)/)
  assert.match(uiTest, /_settled_sitting_my_room/)
  assert.match(uiTest, /waitForAvatarMotionValue\(/)
})

test("native room QA captures a persisted cross-SKU furnished room with avatar movement", () => {
  assert.match(uiTest, /testUniversalCoreFurnishedRoomPersistsAndKeepsAvatarRoute/)
  assert.match(uiTest, /universal_core_furnished_room_before_relaunch/)
  assert.match(uiTest, /universal_core_furnished_room_after_relaunch/)
  assert.match(uiTest, /universal_core_furnished_room_avatar_route/)
  assert.match(uiTest, /placeRoomQaProduct\(product\)/)
  assert.match(uiTest, /app\.terminate\(\)/)
  assert.match(uiTest, /app\.launch\(\)/)
  assert.match(uiTest, /waitForAvatarFrameChange\(/)
})

test("native room QA captures all six current shells with the furnished avatar scene only after refresh settles", () => {
  assert.match(uiTest, /testSixRoomV3ShellCandidatesRenderWithFurnishedMyRoom/)
  for (const [id, name] of [
    ["apricot_sky_social_loft", "Apricot Sky"],
    ["blush_petal_cottage", "Blush Petal"],
    ["cocoa_navy_modern_studio", "Cocoa Navy"],
    ["sage_cloud_scandinavian", "Sage Cloud"],
    ["forest_terracotta_creative_loft", "Forest Terracotta"],
    ["lavender_moon_atelier", "Lavender Moon"]
  ]) {
    assert.match(uiTest, new RegExp(`id: "${id}"`))
    assert.match(uiTest, new RegExp(`name: "${name}"`))
  }
  assert.ok(uiTest.includes('"room_shell_\\(shell.id)_furnished_my_room"'))
  assert.ok(uiTest.includes('app.buttons["Choose \\(shell.name)"]'))
  assert.match(uiTest, /waitForRoomQaStable\(timeout:/)
  assert.match(uiTest, /label CONTAINS\[c\] %@/)
  assert.match(uiTest, /Refreshing/)
  assert.match(uiTest, /waitForNonExistence\(timeout:/)
})

test("native shell compatibility QA covers all 45 furniture SKUs in bounded batches on every shell", () => {
  assert.match(
    uiTest,
    /testSixRoomV3ShellCandidatesRenderFullFurnitureCatalogBatches/
  )
  assert.match(uiTest, /allUniversalCoreProducts/)
  assert.match(uiTest, /XCTAssertEqual\(allUniversalCoreProducts\.count,\s*45/)
  assert.match(uiTest, /catalogCompatibilityBatches/)
  assert.match(uiTest, /Array\(allUniversalCoreProducts\[start\.\.<end\]\)/)
  assert.match(uiTest, /XCTAssertLessThanOrEqual\(batch\.count,\s*8/)
  assert.match(
    uiTest,
    /for \(batchIndex, batch\) in batches\.enumerated\(\)[\s\S]*for shell in roomV3QaShells/,
    "each furniture batch must be placed once, then compared across all six shells"
  )
  assert.match(uiTest, /clearRoomQaLayout\(\)/)
  assert.match(uiTest, /placeTabletopSupportIfNeeded\(\)/)
  assert.match(uiTest, /try placeRoomQaProduct\(product\)/)
  assert.match(uiTest, /expectedPlacedItemCount\(for: batch\)/)
  assert.match(uiTest, /assertPersistedRoomQaStage\(/)
  assert.match(uiTest, /shellId: "room_v3_shell_\\\(shell\.id\)"/)
  assert.match(uiTest, /savedItemCount: expectedItemCount/)
  assert.match(uiTest, /renderedFurnitureCount: expectedItemCount/)
  assert.doesNotMatch(uiTest, /preferFastSearch|typeTextWithVerifiedFastPath/)
  assert.ok(
    uiTest.includes(
      '"room_shell_\\(shell.id)_catalog_batch_\\(String(format: "%02d", batchIndex + 1))"'
    )
  )
  assert.match(uiTest, /waitForRoomQaStable\(timeout:/)
})

test("Release-profile native QA has a focused fail-closed persistence smoke", () => {
  assert.match(uiTest, /testNativeUiQaReleasePersistsCandidateShellAndFurniture/)
  assert.match(uiTest, /native_ui_qa_release_persistence_smoke/)
  assert.match(
    uiTest,
    /shellId: "room_v3_shell_forest_terracotta_creative_loft"/
  )
  assert.match(uiTest, /savedItemCount: 1/)
  assert.match(uiTest, /renderedFurnitureCount: 1/)
  assert.match(uiTest, /Sit on Cloud Loveseat/)
})

test("native room QA has a focused stable recapture for the two reviewer-rejected screenshots", () => {
  assert.match(uiTest, /testUniversalCoreReviewerRejectedCapturesAreStable/)
  assert.match(uiTest, /id: "universal_desk_chair_a"/)
  assert.match(uiTest, /name: "Quiet Desk Chair"/)
  assert.match(uiTest, /id: "universal_room_divider_a"/)
  assert.match(uiTest, /name: "Soft Panel Room Divider"/)
  assert.match(uiTest, /captureRoomItemRequiredRotations\(product\)/)
})
