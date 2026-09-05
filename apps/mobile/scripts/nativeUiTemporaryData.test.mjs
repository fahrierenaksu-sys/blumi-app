import assert from "node:assert/strict"
import test from "node:test"
import {
  resolveNativeUiDerivedDataPolicy,
  runWithTemporaryDerivedData
} from "./nativeUiTemporaryData.mjs"

test("cleans temporary native DerivedData when screenshot export fails", () => {
  const calls = []

  assert.throws(
    () => runWithTemporaryDerivedData({
      create: () => {
        calls.push("create")
        return "/tmp/blumi-native-ui-test"
      },
      cleanup: (path) => {
        calls.push(`cleanup:${path}`)
      },
      run: () => {
        calls.push("run")
        throw new Error("screenshot export failed")
      }
    }),
    /screenshot export failed/
  )

  assert.deepEqual(calls, [
    "create",
    "run",
    "cleanup:/tmp/blumi-native-ui-test"
  ])
})

test("returns the native test status after cleaning temporary DerivedData", () => {
  const calls = []

  const status = runWithTemporaryDerivedData({
    create: () => "/tmp/blumi-native-ui-test",
    cleanup: (path) => {
      calls.push(`cleanup:${path}`)
    },
    run: () => 0
  })

  assert.equal(status, 0)
  assert.deepEqual(calls, ["cleanup:/tmp/blumi-native-ui-test"])
})

test("an explicit native DerivedData path is reusable and never auto-deleted", () => {
  assert.deepEqual(
    resolveNativeUiDerivedDataPolicy(" /tmp/blumi-gold-native-cache "),
    {
      explicitPath: "/tmp/blumi-gold-native-cache",
      cleanupAfterRun: false
    }
  )
})

test("an absent native DerivedData path keeps ephemeral cleanup", () => {
  assert.deepEqual(resolveNativeUiDerivedDataPolicy(undefined), {
    explicitPath: null,
    cleanupAfterRun: true
  })
})
