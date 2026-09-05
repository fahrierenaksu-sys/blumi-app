import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveBlumiNativeUiTestSessionResetEnabled,
  resolveBlumiRoomVNextFullWaveQaEnabled,
  resolveBlumiRoomVNextRuntimeProofEnabled,
  resolveBlumiRoomV3DraftPreviewEnabled,
  resolveBlumiUniversalCoreQaEnabled
} from "./env"

test("enables the Room V3 draft preview only in an explicit development runtime", () => {
  assert.equal(
    resolveBlumiRoomV3DraftPreviewEnabled({
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawPreviewFlag: "1"
    }),
    true
  )
})

test("fails closed for missing flags, non-development profiles, and release runtimes", () => {
  assert.equal(
    resolveBlumiRoomV3DraftPreviewEnabled({
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawPreviewFlag: undefined
    }),
    false
  )
  assert.equal(
    resolveBlumiRoomV3DraftPreviewEnabled({
      isDevelopmentRuntime: true,
      buildProfile: "production",
      rawPreviewFlag: "1"
    }),
    false
  )
  assert.equal(
    resolveBlumiRoomV3DraftPreviewEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "development",
      rawPreviewFlag: "1"
    }),
    false
  )
})

test("keeps the Universal Core furniture QA gate independent from the shell flag", () => {
  const developmentInput = {
    isDevelopmentRuntime: true,
    buildProfile: "development"
  }
  assert.equal(
    resolveBlumiRoomV3DraftPreviewEnabled({
      ...developmentInput,
      rawPreviewFlag: "1"
    }),
    true
  )
  assert.equal(
    resolveBlumiUniversalCoreQaEnabled({
      ...developmentInput,
      rawPreviewFlag: undefined
    }),
    false
  )
  assert.equal(
    resolveBlumiUniversalCoreQaEnabled({
      ...developmentInput,
      rawPreviewFlag: "1"
    }),
    true
  )
})

test("allows native UI session reset only for an explicit native UI test build", () => {
  assert.equal(
    resolveBlumiNativeUiTestSessionResetEnabled({
      buildProfile: "native-ui-test",
      rawResetFlag: "1"
    }),
    true
  )
  assert.equal(
    resolveBlumiNativeUiTestSessionResetEnabled({
      buildProfile: "development",
      rawResetFlag: "1"
    }),
    false
  )
  assert.equal(
    resolveBlumiNativeUiTestSessionResetEnabled({
      buildProfile: "development",
      rawResetFlag: undefined
    }),
    false
  )
})

test("allows Room VNext proof in the isolated native UI test build only", () => {
  assert.equal(
    resolveBlumiRoomVNextRuntimeProofEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "native-ui-test",
      rawProofFlag: "1"
    }),
    true
  )
  assert.equal(
    resolveBlumiRoomVNextRuntimeProofEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "production",
      rawProofFlag: "1"
    }),
    false
  )
  assert.equal(
    resolveBlumiRoomVNextRuntimeProofEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "native-ui-test",
      rawProofFlag: undefined
    }),
    false
  )
})

test("allows full-wave Room VNext QA only in development or the isolated native UI test build", () => {
  assert.equal(
    resolveBlumiRoomVNextFullWaveQaEnabled({
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawQaFlag: "1"
    }),
    true
  )
  assert.equal(
    resolveBlumiRoomVNextFullWaveQaEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "native-ui-test",
      rawQaFlag: "1"
    }),
    true
  )
  assert.equal(
    resolveBlumiRoomVNextFullWaveQaEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "production",
      rawQaFlag: "1"
    }),
    false
  )
  assert.equal(
    resolveBlumiRoomVNextFullWaveQaEnabled({
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawQaFlag: undefined
    }),
    false
  )
})
