import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_STUDIO_QA_RUNTIME_FLAG,
  resolveRoomStudioRuntimeGate
} from "./roomStudioRuntimeGate"

const BASE = {
  isDevelopmentRuntime: true,
  buildProfile: "development",
  rawFlag: "1",
  visualReviewApproved: true,
  directionalAssetsApproved: false
} as const

test("Home Studio is disabled by default and in every production build", () => {
  assert.equal(ROOM_STUDIO_QA_RUNTIME_FLAG, "EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA")
  assert.deepEqual(resolveRoomStudioRuntimeGate({ ...BASE, rawFlag: undefined }), {
    enabled: false,
    mode: "disabled",
    canPreview: false,
    canRotate: false,
    reason: "disabled"
  })
  assert.deepEqual(resolveRoomStudioRuntimeGate({
    ...BASE,
    isDevelopmentRuntime: false,
    buildProfile: "production"
  }), {
    enabled: false,
    mode: "disabled",
    canPreview: false,
    canRotate: false,
    reason: "disabled"
  })
})

test("explicit QA builds stay blocked until visual review passes", () => {
  assert.deepEqual(resolveRoomStudioRuntimeGate({
    ...BASE,
    visualReviewApproved: false
  }), {
    enabled: true,
    mode: "blocked",
    canPreview: false,
    canRotate: false,
    reason: "visual-review-blocked"
  })
})

test("approved front art enables preview but never fakes four-direction rotation", () => {
  assert.deepEqual(resolveRoomStudioRuntimeGate(BASE), {
    enabled: true,
    mode: "preview-only",
    canPreview: true,
    canRotate: false,
    reason: "directional-assets-blocked"
  })
})

test("guided remix rotation requires separately approved real four-direction assets", () => {
  assert.deepEqual(resolveRoomStudioRuntimeGate({
    ...BASE,
    buildProfile: "native-ui-test",
    isDevelopmentRuntime: false,
    directionalAssetsApproved: true
  }), {
    enabled: true,
    mode: "guided-remix",
    canPreview: true,
    canRotate: true,
    reason: "guided-remix"
  })
})

test("near-miss flags and unauthorized release-like profiles fail closed", () => {
  for (const rawFlag of ["true", "01", " 1 ", "0", ""]) {
    assert.equal(resolveRoomStudioRuntimeGate({ ...BASE, rawFlag }).enabled, false)
  }
  assert.equal(resolveRoomStudioRuntimeGate({
    ...BASE,
    isDevelopmentRuntime: false,
    buildProfile: "release"
  }).enabled, false)
})
