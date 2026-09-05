import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  getProfileCharacterReactionGeometry,
  getProfileSetupInitialGender,
  PROFILE_SETUP_VISUAL
} from "./profileSetupVisualModel"

const sessionFeatureRoot = path.resolve(process.cwd(), "src/features/session")

function readSessionSource(relativePath: string): string {
  return readFileSync(path.resolve(sessionFeatureRoot, relativePath), "utf8")
}

test("profile setup defaults to the female character while preserving an explicit male choice", () => {
  assert.equal(getProfileSetupInitialGender(undefined), "woman")
  assert.equal(getProfileSetupInitialGender("woman"), "woman")
  assert.equal(getProfileSetupInitialGender("man"), "man")
})

test("profile setup keeps a fresh but touch-safe lower panel", () => {
  assert.equal(PROFILE_SETUP_VISUAL.ageFieldWidth, 104)
  assert.equal(PROFILE_SETUP_VISUAL.genderOptionMinHeight, 72)
  assert.ok(PROFILE_SETUP_VISUAL.genderIconSize >= 22)
  assert.ok(PROFILE_SETUP_VISUAL.selectedIndicatorSize >= 22)
  assert.ok(PROFILE_SETUP_VISUAL.formGap >= 12)
  assert.ok(PROFILE_SETUP_VISUAL.formMinHeight >= 250)
})

test("character badge shows only a real user name", () => {
  const source = readSessionSource("ProfileCharacterReactionStage.tsx")

  assert.doesNotMatch(source, /Erkek.*displayName|Kadın.*displayName|Karakterin/)
  assert.match(source, /characterName \? \(/)
  assert.match(source, /bottom: 0,/)
})

test("character art clears the identity badge rail", () => {
  const compactGeometry = getProfileCharacterReactionGeometry(true)
  const regularGeometry = getProfileCharacterReactionGeometry(false)

  assert.equal(compactGeometry.characterTop, 8)
  assert.equal(regularGeometry.characterTop, 8)
  assert.ok(compactGeometry.badgeOverlap > 0)
  assert.ok(regularGeometry.badgeOverlap > 0)

  const source = readSessionSource("ProfileCharacterReactionStage.tsx")

  assert.match(source, /getProfileCharacterReactionGeometry\(compact\)/)
  assert.match(source, /outputRange: \[10 \+ geometry\.characterLift, geometry\.characterLift\]/)
  assert.match(source, /height: geometry\.stageHeight/)
  assert.match(source, /const cellHeight = geometry\.characterHeight/)
})

test("profile keyboard mode hides the decorative hero and heading", () => {
  const profile = readSessionSource("../../screens/ProfileSetupScreen.tsx")
  const shell = readSessionSource("setupFlow/BlumiSetupShell.tsx")

  assert.match(profile, /collapseStageOnKeyboard/)
  assert.match(profile, /collapseHeadingOnKeyboard/)
  assert.match(shell, /collapseHeadingOnKeyboard && keyboardVisible/)
})

test("canonical profile preview starts a native idle loop for the selected gender", () => {
  const source = readSessionSource("ProfileCharacterReactionStage.tsx")

  assert.match(source, /const breath = useRef\(new Animated\.Value\(0\)\)/)
  assert.match(source, /const breathLoop = Animated\.loop\(/)
  assert.match(source, /breathLoop\.start\(\)/)
  assert.match(source, /useReducedMotionPreference\(\)/)
  assert.match(source, /motionPreferenceResolved/)
  assert.match(source, /useLayoutEffect\(\(\) => \{/)
  assert.doesNotMatch(source, /entrance\.setValue\(0\)/)
  assert.doesNotMatch(source, /const arrival = Animated\.timing\(entrance/)
  assert.match(source, /\[breath, entrance, gender, halo, motionActive, motionPreferenceResolved, reduceMotion\]/)
  assert.match(source, /useNativeDriver: true/)
})

test("field icon chip follows the text optical baseline", () => {
  const source = readSessionSource("../../ui/fieldInput.tsx")

  assert.match(source, /transform: \[\{ translateY: 3 \}\]/)
})

test("setup CTA keeps the shared intro bottom breathing room", () => {
  const source = readSessionSource("setupFlow/BlumiSetupShell.tsx")

  assert.match(source, /paddingBottom: ONBOARDING_PRIMARY_ACTION_LAYOUT\.bottomInset/)
})

test("profile setup keeps the task card surface clean and pattern-free", () => {
  const source = readSessionSource("../../screens/ProfileSetupScreen.tsx")

  assert.doesNotMatch(source, /taskCardTone="liquid"/)
  assert.match(source, /taskCardTone="default"/)
})

test("profile identity and gender controls share one alignment grid", () => {
  const profileSource = readSessionSource("../../screens/ProfileSetupScreen.tsx")
  const fieldSource = readSessionSource("../../ui/fieldInput.tsx")

  assert.match(profileSource, /style=\{styles\.identityHint\}/)
  assert.match(profileSource, /name="information-circle-outline"/)
  assert.doesNotMatch(profileSource, /labelAlign="center"/)
  assert.match(profileSource, /justifyContent: "flex-start"/)
  assert.doesNotMatch(profileSource, /backgroundColor: "rgba\(255, 248, 251, 0\.78\)"/)
  assert.match(profileSource, /marginBottom: uiTheme\.spacing\.sm/)
  assert.match(profileSource, /namePrivacyHint: \{[\s\S]*textAlign: "left"/)
  assert.match(profileSource, /identityHint: \{[\s\S]*alignItems: "flex-start"/)
  assert.match(profileSource, /identityHint: \{[\s\S]*alignSelf: "stretch"/)
  assert.match(profileSource, /identityHint: \{[\s\S]*maxWidth: "100%"/)
  assert.match(profileSource, /genderHeadingRow: \{[\s\S]*alignItems: "baseline"/)
  assert.match(profileSource, /right: uiTheme\.spacing\.sm,[\s\S]*top: uiTheme\.spacing\.sm/)
  assert.match(fieldSource, /labelAlign\?: "left" \| "center"/)
  assert.match(fieldSource, /borderRadius: 15/)
})
