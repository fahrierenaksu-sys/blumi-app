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
  assert.match(source, /label=\{copy\.alreadyHaveAccount\}\s*onPress=\{\(\) => \{ void openRegister\("sign-in"\) \}\}/)
  assert.match(source, /openRegister\("create"\)/)
  assert.match(copy, /alreadyHaveAccount: "I already have an account"/)
  assert.doesNotMatch(source, /Save my vibe/)
})

test("sign-in intent uses sign-in-specific verification copy", () => {
  const source = read("src/features/session/register/registerScreenModel.ts")
  const signInView = read("src/features/session/register/RegisterSignInView.tsx")
  const copy = read("src/features/session/authEntryCopy.ts")
  assert.match(source, /authIntent === "sign-in"[\s\S]*authCopy\.signInCodeBody/)
  assert.match(source, /authIntent === "sign-in" \? authCopy\.signInToBlumi/)
  assert.match(signInView, /label=\{resolveSignInPrimaryActionLabel\(/)
  assert.match(read("src/screens/RegisterScreen.tsx"), /resolveSignInHeroCopy\(\{/)
  assert.match(copy, /If this phone is linked/)
  assert.match(copy, /Sign in to Blumi/)
})

test("invalid phone input returns focus to the field", () => {
  const source = read("src/features/session/register/useRegisterFlowController.ts")
  assert.match(source, /phoneInputRef = useRef<\s*TextInput\s*\|\s*null\s*>\(null\)/)
  assert.match(source, /phoneInputRef\.current\?\.focus\(\)/)
  assert.match(read("src/features/session/register/RegisterPhoneEntry.tsx"), /ref=\{phoneInputRef\}/)
  for (const view of ["RegisterCreateView.tsx", "RegisterSignInView.tsx"]) {
    assert.match(
      read(`src/features/session/register/${view}`),
      /phoneInputRef=\{register\.phoneInputRef\}/
    )
  }
})

test("avatar onboarding has one progress surface and keeps identity editing separate", () => {
  const source = read("src/screens/AvatarSetupScreen.tsx")
  const shell = read("src/features/session/setupFlow/BlumiSetupShell.tsx")
  // The shell header fraction is the only progress surface on this step.
  assert.match(source, /<BlumiSetupShell[\s\S]*?headerProgressStyle="fraction"[\s\S]*?hideProgressRail[\s\S]*?step="avatar"/)
  assert.doesNotMatch(source, /<SetupFlowProgress|<OnboardingProgress/)
  assert.match(shell, /\{!hideProgressRail \? \(/)
  // Name and profile details are edited on the profile step, not here.
  assert.doesNotMatch(source, /Edit profile|ProfileEdit|setDisplayName|<TextInput/)
})

test("character setup and Discover share Blumi's avatar-first low-pressure promise", () => {
  const avatar = read("src/screens/AvatarSetupScreen.tsx")
  const discoveryCopy = read("src/features/discovery/discoverySurfaceCopy.ts")
  assert.match(avatar, /Bu sadece başlangıç\. Tarzını sonra da değiştirebilirsin\./)
  assert.match(discoveryCopy, /loadingTitle: "Finding people who match your vibe…"/)
})

test("discovery distinguishes loading, error, low supply, and exhausted states", () => {
  const empty = read("src/features/discovery/EmptyDiscoveryDeck.tsx")
  const surfaceCopy = read("src/features/discovery/discoverySurfaceCopy.ts")
  const lobby = read("src/screens/LobbyScreen.tsx")
  assert.match(empty, /state\?: "exhausted" \| "low-supply"/)
  assert.match(empty, /copy\.empty\.lowSupplyTitle/)
  assert.match(surfaceCopy, /lowSupplyTitle: "No new people to meet right now\."/)
  assert.match(lobby, /<DiscoverErrorCard/)
  assert.match(lobby, /productionDiscoverError \|\| discoveryPlaceholderState === "error" \|\| showStartupFailure \? \(/)
  assert.match(lobby, /discoveryPlaceholderState === "loading" \? \(\s*<LoadingDiscoveryDeck/)
  assert.match(lobby, /state=\{discoveryQuotaExhausted[\s\S]*productionSupplyState === "low"[\s\S]*"low-supply"[\s\S]*"exhausted"\}/)
})

test("room onboarding offers only the free starter bed before discovery", () => {
  const source = read("src/screens/RoomSetupScreen.tsx")
  assert.match(source, /STARTER_ROOM_BED_ITEM_ID/)
  assert.match(source, /ücretsiz başlangıç eşyası/)
  assert.match(source, /testID="starter-bed-card"/)
  assert.match(source, /Dokun veya odana sürükle/)
  assert.match(source, /testID="starter-bed-rotate"/)
  assert.match(source, /primaryActionTestID="room-setup-submit"/)
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
