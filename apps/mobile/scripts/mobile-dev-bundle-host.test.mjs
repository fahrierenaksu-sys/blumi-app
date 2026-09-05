import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const appDelegatePath = resolve(
  import.meta.dirname,
  "../ios/BlumiMobile/AppDelegate.swift"
)

test("iOS debug bundleURL pins the simulator packager host to 127.0.0.1", () => {
  const source = readFileSync(appDelegatePath, "utf8")

  assert.match(source, /targetEnvironment\(simulator\)/)
  assert.match(source, /packagerHost:\s*"127\.0\.0\.1"/)
  assert.match(
    source,
    /jsBundleURL\(\s*[\s\S]*forBundleRoot:\s*"\.expo\/\.virtual-metro-entry"/
  )
})
