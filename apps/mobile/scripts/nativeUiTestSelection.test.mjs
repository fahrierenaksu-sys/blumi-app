import assert from "node:assert/strict"
import test from "node:test"
import {
  assertFullWaveQaSelectionIsBounded,
  resolveNativeUiOnlyTestingArgs
} from "./nativeUiTestSelection.mjs"

test("native UI runner can select one bounded release journey", () => {
  assert.deepEqual(
    resolveNativeUiOnlyTestingArgs(
      "BlumiMobileUITests/BlumiMobileUITests/testCriticalDemoJourneyRendersReleaseSurfaces"
    ),
    [
      "-only-testing:BlumiMobileUITests/BlumiMobileUITests/testCriticalDemoJourneyRendersReleaseSurfaces"
    ]
  )
})

test("native UI runner keeps the existing full-suite behavior without a selection", () => {
  assert.deepEqual(resolveNativeUiOnlyTestingArgs(undefined), [])
  assert.deepEqual(resolveNativeUiOnlyTestingArgs("   "), [])
})

test("native UI runner accepts a bounded comma-separated proof set", () => {
  assert.deepEqual(
    resolveNativeUiOnlyTestingArgs(
      [
        "BlumiMobileUITests/BlumiMobileUITests/testRoomVNextPinkCloudBedRendersEveryRotationAndPersists",
        "BlumiMobileUITests/BlumiMobileUITests/testRoomVNextCohesionPilotRendersAllSevenPiecesAndTabletopCombination",
      ].join(",")
    ),
    [
      "-only-testing:BlumiMobileUITests/BlumiMobileUITests/testRoomVNextPinkCloudBedRendersEveryRotationAndPersists",
      "-only-testing:BlumiMobileUITests/BlumiMobileUITests/testRoomVNextCohesionPilotRendersAllSevenPiecesAndTabletopCombination",
    ]
  )
})

test("native UI runner rejects unsafe or unrelated test selectors", () => {
  assert.throws(
    () => resolveNativeUiOnlyTestingArgs("../../OtherTests/testSomething"),
    /invalid_native_ui_test_selection/
  )
})

test("full-wave native QA requires an explicit full-wave-only bounded selector", () => {
  assertFullWaveQaSelectionIsBounded(
    "BlumiMobileUITests/BlumiMobileUITests/testRoomVNextFullWaveBatchOneRendersEveryAuthoredDirection"
  )
  assert.throws(
    () => assertFullWaveQaSelectionIsBounded(undefined),
    /full_wave_qa_requires_bounded_selection/
  )
  assert.throws(
    () => assertFullWaveQaSelectionIsBounded(
      "BlumiMobileUITests/BlumiMobileUITests/testRoomVNextPinkCloudBedRendersEveryRotationAndPersists"
    ),
    /full_wave_qa_requires_full_wave_only_selection/
  )
})
