import assert from "node:assert/strict"
import test from "node:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (relativePath) => readFileSync(resolve(mobileRoot, relativePath), "utf8")
const settings = read("src/screens/SettingsScreen.tsx")
const matchingSection = read("src/features/settings/SettingsMatchingSection.tsx")
const matchingPreferences = read("src/features/settings/useMatchingPreferences.ts")
const settingsSurfaces = [
  "src/screens/SettingsScreen.tsx",
  ...readdirSync(resolve(mobileRoot, "src/features/settings"))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => `src/features/settings/${name}`)
].map(read).join("\n")

test("Settings edits the same persisted filters used by Discover", () => {
  assert.match(matchingSection, /label=\{copy\.discoveryPreferences\}/)
  assert.match(matchingSection, /formatDiscoveryFiltersSummary\(matchingFilters, locale\)/)
  assert.match(settings, /<SettingsMatchingSection/)
  assert.match(settings, /<DiscoverFiltersBottomSheet/)
  assert.match(settings, /useMatchingPreferences\(sessionActor, onUpdateProfile\)/)
  assert.match(matchingPreferences, /loadDiscoveryFilters\(AsyncStorage, sessionActor\.profile\.userId\)/)
  assert.match(matchingPreferences, /persistDiscoveryFilters\([\s\S]*?AsyncStorage,[\s\S]*?sessionActor\.profile\.userId/)
})

test("Settings does not expose unsupported matching toggles", () => {
  assert.doesNotMatch(settingsSurfaces, /Maximum distance|Discovery scope|Profile visibility|Match notifications/)
})
