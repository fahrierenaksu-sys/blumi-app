import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

function featureSource(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "src/features/session", fileName), "utf8")
}

test("candidate onboarding run assets are wired into the greeting pair and world runners", () => {
  const greetingPairSource = featureSource("OnboardingGreetingPair.tsx")
  const runnerSource = featureSource("OnboardingRunner.tsx")

  assert.match(greetingPairSource, /ONBOARDING_RUN_ASSET_MODE === "candidate"/)
  assert.match(greetingPairSource, /getOnboardingRunAssetSet\("candidate"\)/)
  assert.match(runnerSource, /ONBOARDING_RUN_ASSET_MODE === "candidate"/)
  assert.match(runnerSource, /getOnboardingRunAssetSet\("candidate"\)/)
})
