import assert from "node:assert/strict"
import test from "node:test"
import { resolveRoomVNextRuntimeGate } from "./roomVNextRuntimeGate"

const enabledInput = {
  isDevelopmentRuntime: true,
  buildProfile: "development",
  rawFlag: "1"
}

test("VNext runtime is disabled by default and outside development", () => {
  assert.deepEqual(
    resolveRoomVNextRuntimeGate({
      ...enabledInput,
      rawFlag: undefined,
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    { enabled: false, mode: "disabled", reason: "disabled" }
  )
  assert.deepEqual(
    resolveRoomVNextRuntimeGate({
      ...enabledInput,
      isDevelopmentRuntime: false,
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    { enabled: false, mode: "disabled", reason: "disabled" }
  )
})

test("explicit QA flag enables candidate proof but never self-promotes", () => {
  assert.deepEqual(
    resolveRoomVNextRuntimeGate({
      ...enabledInput,
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    { enabled: true, mode: "candidate-proof", reason: "promotion-locked" }
  )
})

test("the isolated native UI build exercises candidate proof without opening promotion", () => {
  assert.deepEqual(
    resolveRoomVNextRuntimeGate({
      isDevelopmentRuntime: false,
      buildProfile: "native-ui-test",
      rawFlag: "1",
      independentReviewApproved: false,
      finalUserApproval: false
    }),
    { enabled: true, mode: "candidate-proof", reason: "promotion-locked" }
  )
})

test("promotion requires both independent review and final user approval", () => {
  assert.equal(
    resolveRoomVNextRuntimeGate({
      ...enabledInput,
      independentReviewApproved: true,
      finalUserApproval: false
    }).mode,
    "candidate-proof"
  )
  assert.equal(
    resolveRoomVNextRuntimeGate({
      ...enabledInput,
      independentReviewApproved: true,
      finalUserApproval: true
    }).mode,
    "promoted"
  )
})
