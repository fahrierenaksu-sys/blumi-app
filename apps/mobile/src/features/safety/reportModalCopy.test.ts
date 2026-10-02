import assert from "node:assert/strict"
import test from "node:test"
import { REPORT_REASONS } from "@blumi/contracts"
import { getReportModalCopy } from "./reportModalCopy"

// Locale parity for the whole modal lives in
// features/discovery/copyLocaleParity.test.ts.

test("every server-accepted report reason has a translated label", () => {
  const turkish = getReportModalCopy("tr")
  const english = getReportModalCopy("en")
  for (const reason of REPORT_REASONS) {
    const tr = turkish.reasonLabel(reason)
    const en = english.reasonLabel(reason)
    assert.ok(tr?.trim(), `${reason} has a Turkish label`)
    assert.ok(en?.trim(), `${reason} has an English label`)
    assert.notEqual(tr, en, `${reason} is translated`)
  }
})

test("report and hide actions name the person they act on", () => {
  for (const locale of ["tr", "en"] as const) {
    const copy = getReportModalCopy(locale)
    for (const text of [
      copy.title("Ada", "reason"),
      copy.confirmBody("Ada"),
      copy.hiddenToast("Ada"),
      copy.hideAccessibilityLabel("Ada"),
      copy.reportAndHideAccessibilityLabel("Ada")
    ]) {
      assert.match(text, /Ada/, `${locale}: ${text}`)
    }
  }
})
