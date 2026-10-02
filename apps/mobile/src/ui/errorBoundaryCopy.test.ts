import assert from "node:assert/strict"
import test from "node:test"
import { getErrorBoundaryCopy } from "./errorBoundaryCopy"

test("Turkish and English recovery text never promises saved data or delivered reporting", () => {
  for (const locale of ["tr", "en"] as const) {
    for (const repeated of [false, true]) {
      const copy = getErrorBoundaryCopy(locale, repeated)
      assert.doesNotMatch(Object.values(copy).join(" "), /\b(saved|safe|reported|kaydedildi|güvende|bildirildi)\b/i)
      assert.equal(copy.canRetry, !repeated)
    }
  }
  assert.equal(getErrorBoundaryCopy("tr").retryLabel, "Tekrar dene")
  assert.equal(getErrorBoundaryCopy("en").retryLabel, "Try again")
})
