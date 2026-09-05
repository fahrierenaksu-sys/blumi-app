const NATIVE_UI_TEST_SELECTION =
  /^BlumiMobileUITests\/BlumiMobileUITests\/test[A-Za-z0-9_]+$/

export function resolveNativeUiOnlyTestingArgs(rawSelection) {
  const selection = rawSelection?.trim()
  if (!selection) return []
  const selectors = selection.split(",").map((value) => value.trim())
  if (
    selectors.length === 0 ||
    selectors.some((value) => !NATIVE_UI_TEST_SELECTION.test(value))
  ) {
    throw new Error("invalid_native_ui_test_selection")
  }
  return selectors.map((value) => `-only-testing:${value}`)
}

export function assertFullWaveQaSelectionIsBounded(rawSelection) {
  const selection = rawSelection?.trim()
  if (!selection) {
    throw new Error("full_wave_qa_requires_bounded_selection")
  }
  const selectors = selection.split(",").map((value) => value.trim())
  if (
    selectors.length === 0 ||
    selectors.some((value) => !value.includes("/testRoomVNextFullWave"))
  ) {
    throw new Error("full_wave_qa_requires_full_wave_only_selection")
  }
}
