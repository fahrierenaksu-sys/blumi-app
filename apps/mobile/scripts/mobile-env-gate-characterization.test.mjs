import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

// Characterization of the derived asset-gate constants for representative
// EXPO_PUBLIC_* combinations. Each case runs in a fresh process because the
// constants are computed once at module load.
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const moduleUrl = (path) => pathToFileURL(resolve(mobileRoot, path)).href
const gateModules = {
  run: moduleUrl("src/features/session/onboardingRunAssetGate.ts"),
  profileReaction: moduleUrl("src/features/session/profileCharacterReactionAssetGate.ts")
}

const EVALUATOR = `
globalThis.__DEV__ = process.env.TEST_DEV === "1"
const load = async (url) => { const ns = await import(url); return { ...(ns.default ?? {}), ...ns } }
const run = await load(${JSON.stringify(gateModules.run)})
const profile = await load(${JSON.stringify(gateModules.profileReaction)})
console.log("RESULT:" + JSON.stringify({
  run: run.ONBOARDING_RUN_ASSET_MODE,
  profileReaction: profile.PROFILE_CHARACTER_REACTION_ASSET_MODE
}))
`

function evaluate({ dev, env }) {
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("EXPO_PUBLIC_"))
  )
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", EVALUATOR],
    {
      cwd: mobileRoot,
      encoding: "utf8",
      env: { ...childEnv, ...env, TEST_DEV: dev ? "1" : "0" }
    }
  )
  assert.equal(result.status, 0, result.stderr)
  const line = result.stdout.split("\n").find((entry) => entry.startsWith("RESULT:"))
  assert.ok(line, result.stdout)
  return JSON.parse(line.slice("RESULT:".length))
}

const QA = {
  EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_QA: "1",
  EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_QA: "1"
}
const APPROVALS = {
  EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED: "1",
  EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_USER_APPROVED: "1",
  EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_REVIEW_APPROVED: "1",
  EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_USER_APPROVED: "1"
}
const production = { EXPO_PUBLIC_BLUMI_BUILD_PROFILE: "production" }

const cases = [
  { name: "all flags unset", dev: false, env: {} },
  { name: "all flags unset in a dev runtime", dev: true, env: {} },
  { name: "QA flags in development profile", dev: true, env: { ...QA, EXPO_PUBLIC_BLUMI_BUILD_PROFILE: "development" } },
  { name: "QA flags with approvals in native-ui-test profile", dev: false, env: { ...QA, ...APPROVALS, EXPO_PUBLIC_BLUMI_BUILD_PROFILE: "native-ui-test" } },
  { name: "QA flags in production profile", dev: false, env: { ...QA, ...production } },
  { name: "QA flags with approvals in production profile", dev: false, env: { ...QA, ...APPROVALS, ...production } },
  { name: "approvals only in production profile", dev: false, env: { ...APPROVALS, ...production } }
]

// Values captured from the pre-refactor config/env.ts. The production promotion
// record currently approves every asset set, so all combinations resolve to the
// approved mode; the matrix guards against the wiring drifting.
const EXPECTED = {
  run: "approved-run",
  profileReaction: "approved"
}

for (const testCase of cases) {
  test(`derived asset gates: ${testCase.name}`, () => {
    assert.deepEqual(evaluate(testCase), EXPECTED)
  })
}
