import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const packageJson = JSON.parse(
  readFileSync(resolve(mobileRoot, "package.json"), "utf8")
)

test("the default mobile launch uses the native development client on a stable LAN port", () => {
  assert.match(
    packageJson.scripts.start,
    /EXPO_PUBLIC_BLUMI_MEDIA_MODE=demo expo start --dev-client --host lan --scheme blumi --port 8081/
  )
  assert.doesNotMatch(packageJson.scripts.start, /--go/)
})

test("clean-cache, development-client, and Expo Go launch modes stay explicit", () => {
  assert.match(packageJson.scripts["start:clear"], /expo start --clear --dev-client --host lan --scheme blumi --port 8081/)
  assert.match(packageJson.scripts["start:dev-client"], /expo start --dev-client --host lan --scheme blumi --port 8081/)
  assert.match(packageJson.scripts["start:go"], /expo start --go --host lan --port 8081/)
})

test("the mobile runtime stays aligned with Expo SDK 57", () => {
  assert.equal(packageJson.dependencies.expo, "~57.0.26")
  assert.match(packageJson.dependencies["react-native"], /^0\.86\./)
  assert.match(packageJson.dependencies.react, /^19\.2\./)
  assert.match(packageJson.dependencies["react-dom"], /^19\.2\./)
})
