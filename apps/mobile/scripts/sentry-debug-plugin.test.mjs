import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
const require = createRequire(import.meta.url)

test("Sentry debug settings are reproducible without generated Xcode files", () => {
  const { configureBuildConfigurations } = require("../plugins/withSentryDebugSettings.js")
  const source = {
    debug: { name: "Debug", buildSettings: { KEEP: "value" } },
    release: { name: "Release", buildSettings: { KEEP: "release" } },
    debug_comment: "Debug"
  }
  const result = configureBuildConfigurations(source)
  assert.equal(result.debug.buildSettings.SENTRY_DISABLE_AUTO_UPLOAD, "true")
  assert.equal(result.debug.buildSettings.KEEP, "value")
  assert.deepEqual(result.release, source.release)
  assert.equal(source.debug.buildSettings.SENTRY_DISABLE_AUTO_UPLOAD, undefined)
  assert.equal(result.debug_comment, "Debug")
})
