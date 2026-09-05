import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
function read(relativePath) {
  if (relativePath === "src/screens/LobbyScreen.tsx") {
    return readFileSync(resolve(mobileRoot, "src/screens/LobbyScreen.tsx"), "utf8")
  }
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("auth entry makes account intent explicit", () => {
  const source = read("src/screens/AuthEntryScreen.tsx")
  const copy = read("src/features/session/authEntryCopy.ts")
  assert.match(source, /copy\.createAccount/)
  assert.match(source, /copy\.signIn/)
  assert.match(copy, /Create account/)
  assert.match(copy, /Sign in/)
  assert.doesNotMatch(source, /Save my vibe/)
})

test("sign-in intent uses sign-in-specific verification copy", () => {
  const source = read("src/screens/RegisterScreen.tsx")
  const copy = read("src/features/session/authEntryCopy.ts")
  assert.match(source, /authIntent === "sign-in"[\s\S]*authCopy\.signInCodeBody/)
  assert.match(source, /authIntent === "sign-in" \? authCopy\.signInToBlumi/)
  assert.match(copy, /If this phone is linked/)
  assert.match(copy, /Sign in to Blumi/)
})

test("invalid phone input returns focus to the field", () => {
  const source = read("src/screens/RegisterScreen.tsx")
  assert.match(source, /phoneInputRef = useRef<\s*TextInput\s*\|\s*null\s*>\(null\)/)
  assert.match(source, /phoneInputRef\.current\?\.focus\(\)/)
  assert.match(source, /ref=\{phoneInputRef\}/)
})

test("avatar onboarding has one progress surface and keeps identity editing separate", () => {
  const source = read("src/screens/AvatarSetupScreen.tsx")
  assert.equal((source.match(/<OnboardingProgress/g) ?? []).length, 1)
  assert.match(source, /<OnboardingProgress activeStep=\{1\}/)
  assert.doesNotMatch(source, /Edit profile\. Name,/)
  assert.match(source, /Edit profile details/)
})

test("Welcome, character setup, and Discover share Blumi's avatar-first low-pressure promise", () => {
  const welcome = read("src/screens/WelcomeScreen.tsx")
  const avatar = read("src/screens/AvatarSetupScreen.tsx")
  const discovery = read("src/features/discovery/EmptyDiscoveryDeck.tsx")
  assert.match(welcome, /Lead with your avatar/)
  assert.match(welcome, /low-pressure/)
  assert.match(avatar, /Build the first look people meet\./)
  assert.match(discovery, /match your vibe/)
})

test("discovery distinguishes loading, error, low supply, and exhausted states", () => {
  const empty = read("src/features/discovery/EmptyDiscoveryDeck.tsx")
  const lobby = read("src/screens/LobbyScreen.tsx")
  assert.match(empty, /state\?: "exhausted" \| "low-supply"/)
  assert.match(empty, /No new people to meet right now\./)
  assert.match(lobby, /<DiscoverErrorCard/)
  assert.match(lobby, /productionDiscoverError \? \(/)
  assert.match(lobby, /state=\{discoveryQuotaExhausted[\s\S]*productionSupplyState === "low"[\s\S]*"low-supply"[\s\S]*"exhausted"\}/)
})

test("room onboarding offers only the free starter bed before discovery", () => {
  const source = read("src/screens/RoomSetupScreen.tsx")
  assert.match(source, /STARTER_ROOM_BED_ITEM_ID/)
  assert.match(source, /FREE STARTER ITEM/)
  assert.match(source, /testID="starter-bed-card"/)
  assert.match(source, /Tap to place · Drag to move/)
  assert.match(source, /testID="starter-bed-rotate"/)
  assert.match(source, /testID="room-setup-submit"/)
  assert.doesNotMatch(source, /STARTER_ROOM_PRESETS/)
  assert.doesNotMatch(source, /Pick a starter mood\./)
})

test("phase 3 removes fake presence and photo affordances from avatar-first cards", () => {
  const source = read("src/components/DiscoverCard.tsx")
  assert.doesNotMatch(source, /photoProgressRow/)
  assert.match(source, /isOnline !== undefined \? \(/)
  assert.match(source, /isOnline !== undefined \?[\s\S]*label=\{presenceLabel\} variant=\{isOnline \? "success" : "muted"\}/)
})

test("phase 3 control targets stay at or above 44 points", () => {
  const filters = read("src/components/DiscoverFiltersBottomSheet.tsx")
  assert.match(filters, /closeButton:\s*\{[\s\S]*?width:\s*44,[\s\S]*?height:\s*44/)
  assert.match(filters, /segment:\s*\{[\s\S]*?minHeight:\s*44/)
})

test("activation milestones are captured as explicit product events", () => {
  const analytics = read("src/analytics/productAnalytics.ts")
  const lobby = read("src/screens/LobbyScreen.tsx")
  const room = read("src/features/session/useSessionState.ts")
  assert.match(analytics, /"activation_first_discovery_decision"/)
  assert.match(analytics, /"activation_first_room_change"/)
  assert.match(lobby, /captureProductEvent\("activation_first_discovery_decision"/)
  assert.match(room, /captureProductEvent\("activation_first_room_change"/)
})
