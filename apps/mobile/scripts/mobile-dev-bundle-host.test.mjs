import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const iosRoot = resolve(import.meta.dirname, "../ios")

const projectPath = resolve(iosRoot, "Blumi.xcodeproj/project.pbxproj")

test("the Xcode target uses Expo's development bundle resolver and an embedded release bundle", {
  skip: existsSync(projectPath) ? false : "The generated iOS project is absent in a clean checkout."
}, () => {
  const project = readFileSync(projectPath, "utf8")
  const delegatePath = project.match(/path = (Blumi\/AppDelegate\.swift);/)?.[1]
  assert.ok(delegatePath, "the Xcode target must reference its AppDelegate source")
  const source = readFileSync(resolve(iosRoot, delegatePath), "utf8")

  assert.match(source, /bridge\.bundleURL \?\? bundleURL\(\)/)
  assert.match(
    source,
    /#if DEBUG\s+return RCTBundleURLProvider\.sharedSettings\(\)\.jsBundleURL\(forBundleRoot: "\.expo\/\.virtual-metro-entry"\)\s+#else\s+return Bundle\.main\.url\(forResource: "main", withExtension: "jsbundle"\)/
  )
  assert.doesNotMatch(source, /packagerHost:\s*"127\.0\.0\.1"/)
})
