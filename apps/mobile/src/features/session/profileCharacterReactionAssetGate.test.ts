import assert from "node:assert/strict"
import test from "node:test"

import { resolveProfileCharacterReactionAssetMode } from "./profileCharacterReactionAssetGate"

test("generated profile reactions stay QA-only until both reviews have happened", () => {
  const base = { buildProfile: "development", isDevelopmentRuntime: true, rawQaFlag: "1" }
  assert.equal(
    resolveProfileCharacterReactionAssetMode({
      ...base,
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    "candidate"
  )
  assert.equal(
    resolveProfileCharacterReactionAssetMode({
      ...base,
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "approved"
  )
})

test("generated profile reactions stay closed until an explicit release promotion", () => {
  assert.equal(
    resolveProfileCharacterReactionAssetMode({
      buildProfile: "production",
      isDevelopmentRuntime: false,
      rawQaFlag: "1",
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "fallback"
  )
  assert.equal(
    resolveProfileCharacterReactionAssetMode({
      buildProfile: "production",
      isDevelopmentRuntime: false,
      rawQaFlag: undefined,
      independentReviewApproved: false,
      finalUserApproval: false,
      productionApproved: true
    }),
    "approved"
  )
})
