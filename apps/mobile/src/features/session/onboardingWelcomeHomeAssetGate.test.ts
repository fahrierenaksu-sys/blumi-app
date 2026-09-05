import assert from "node:assert/strict"
import test from "node:test"

import { resolveOnboardingWelcomeHomeAssetMode } from "./onboardingWelcomeHomeAssetGate"

test("welcome-home candidate stays closed by default", () => {
  assert.equal(
    resolveOnboardingWelcomeHomeAssetMode({
      buildProfile: "development",
      isDevelopmentRuntime: true,
      rawQaFlag: undefined,
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    "fallback"
  )
})

test("welcome-home candidate requires explicit QA plus both approvals", () => {
  assert.equal(
    resolveOnboardingWelcomeHomeAssetMode({
      buildProfile: "development",
      isDevelopmentRuntime: true,
      rawQaFlag: "1",
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    "fallback"
  )
  assert.equal(
    resolveOnboardingWelcomeHomeAssetMode({
      buildProfile: "native-ui-test",
      isDevelopmentRuntime: false,
      rawQaFlag: "1",
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "approved"
  )
  assert.equal(
    resolveOnboardingWelcomeHomeAssetMode({
      buildProfile: "development",
      isDevelopmentRuntime: true,
      rawQaFlag: undefined,
      independentReviewApproved: false,
      finalUserApproval: false,
      productionApproved: true
    }),
    "approved"
  )
})

test("welcome-home candidate fails closed for production builds", () => {
  assert.equal(
    resolveOnboardingWelcomeHomeAssetMode({
      buildProfile: "production",
      isDevelopmentRuntime: false,
      rawQaFlag: "1",
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    "fallback"
  )
  assert.equal(
    resolveOnboardingWelcomeHomeAssetMode({
      buildProfile: "production",
      isDevelopmentRuntime: false,
      rawQaFlag: "1",
      independentReviewApproved: true,
      finalUserApproval: true,
      productionApproved: true
    }),
    "approved"
  )
})
