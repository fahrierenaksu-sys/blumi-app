import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const settings = readFileSync(
  resolve(mobileRoot, "src/screens/SettingsScreen.tsx"),
  "utf8"
)

test("Settings edits the same persisted filters used by Discover", () => {
  assert.match(settings, /label="Discovery preferences"/)
  assert.match(settings, /formatDiscoveryFiltersSummary\(matchingFilters\)/)
  assert.match(settings, /<DiscoverFiltersBottomSheet/)
  assert.match(settings, /loadDiscoveryFilters\(AsyncStorage, sessionActor\.profile\.userId\)/)
  assert.match(settings, /persistDiscoveryFilters\([\s\S]*?AsyncStorage,[\s\S]*?sessionActor\.profile\.userId/)
})

test("Settings does not expose unsupported matching toggles", () => {
  assert.doesNotMatch(settings, /Maximum distance|Discovery scope|Profile visibility|Match notifications/)
})
