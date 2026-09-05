import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveOnboardingRunAssetMode,
  shouldUseOnboardingArrivalAssets
} from "./onboardingRunAssetGate"

test("keeps candidate motion only in explicit QA builds and never promotes release by accident", () => {
  assert.equal(
    resolveOnboardingRunAssetMode({
      buildProfile: "native-ui-test",
      isDevelopmentRuntime: false,
      rawQaFlag: undefined,
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    "walk-fallback"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      buildProfile: "native-ui-test",
      isDevelopmentRuntime: false,
      rawQaFlag: "1",
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    "candidate"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      buildProfile: "development",
      isDevelopmentRuntime: true,
      rawQaFlag: "1",
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    "candidate"
  )
})

test("approved-run stays closed for release unless the release promotion is explicit", () => {
  const base = {
    isDevelopmentRuntime: false,
    rawQaFlag: "1"
  }
  assert.equal(
    resolveOnboardingRunAssetMode({
      ...base,
      buildProfile: "production",
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    "walk-fallback"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      ...base,
      buildProfile: "production",
      independentReviewApproved: true,
      finalUserApproval: false
    }),
    "walk-fallback"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      ...base,
      buildProfile: "production",
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "walk-fallback"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      ...base,
      buildProfile: "production",
      independentReviewApproved: true,
      finalUserApproval: true,
      productionApproved: true
    }),
    "approved-run"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      buildProfile: "development",
      isDevelopmentRuntime: true,
      rawQaFlag: undefined,
      independentReviewApproved: false,
      finalUserApproval: false,
      productionApproved: true
    }),
    "approved-run"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      buildProfile: "native-ui-test",
      isDevelopmentRuntime: false,
      rawQaFlag: "1",
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "approved-run"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      buildProfile: "development",
      isDevelopmentRuntime: true,
      rawQaFlag: "1",
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "approved-run"
  )
  assert.equal(
    resolveOnboardingRunAssetMode({
      buildProfile: "development",
      isDevelopmentRuntime: true,
      rawQaFlag: undefined,
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "walk-fallback"
  )
})

test("approved runtime keeps the exact authored arrival instead of falling back", () => {
  assert.equal(shouldUseOnboardingArrivalAssets("walk-fallback"), false)
  assert.equal(shouldUseOnboardingArrivalAssets("candidate"), true)
  assert.equal(shouldUseOnboardingArrivalAssets("approved-run"), true)
})
