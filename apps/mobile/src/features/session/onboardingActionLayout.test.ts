import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  ONBOARDING_PRIMARY_ACTION_LAYOUT,
  getOnboardingPrimaryActionMetrics
} from "./onboardingActionLayout"

test("the complete onboarding flow shares one primary action geometry", () => {
  assert.deepEqual(ONBOARDING_PRIMARY_ACTION_LAYOUT, {
    height: 58,
    bottomInset: 26,
    horizontalInset: {
      compact: 16,
      regular: 20
    }
  })
})

test("long localized CTA labels preserve the shared rail under large text", () => {
  const sessionDirectory = path.dirname(new URL(import.meta.url).pathname)
  const setupAction = readFileSync(
    path.join(sessionDirectory, "setupFlow/SetupFlowPrimaryAction.tsx"),
    "utf8"
  )
  const authEntry = readFileSync(
    path.join(sessionDirectory, "../../screens/AuthEntryScreen.tsx"),
    "utf8"
  )

  for (const source of [setupAction, authEntry]) {
    assert.match(source, /adjustsFontSizeToFit/)
    assert.match(source, /maxFontSizeMultiplier=\{1\.25\}/)
    assert.match(source, /minimumFontScale=\{0\.82\}/)
    assert.match(source, /numberOfLines=\{1\}/)
  }
})

test("supported iPhone widths resolve to a stable responsive CTA rail", () => {
  const matrix = [
    { width: 320, inset: 16 },
    { width: 375, inset: 16 },
    { width: 390, inset: 20 },
    { width: 402, inset: 20 },
    { width: 414, inset: 20 },
    { width: 440, inset: 20 }
  ]

  for (const viewport of matrix) {
    assert.deepEqual(getOnboardingPrimaryActionMetrics(viewport.width), {
      height: 58,
      bottomInset: 26,
      horizontalInset: viewport.inset
    })
  }
})
