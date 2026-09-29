import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const screen = (name: string): string =>
  readFileSync(resolve(process.cwd(), "src/screens", name), "utf8")
const registerFeature = (name: string): string =>
  readFileSync(resolve(process.cwd(), "src/features/session/register", name), "utf8")
// RegisterScreen composes these two views: create inside the setup shell,
// sign-in as its own page with a PrimaryButton.
const registerCreateView = (): string => registerFeature("RegisterCreateView.tsx")
const registerSignInView = (): string => registerFeature("RegisterSignInView.tsx")

test("onboarding completion actions use the shared primary action system", () => {
  for (const fileName of [
    "ProfileSetupScreen.tsx",
    "AvatarSetupScreen.tsx",
    "RoomSetupScreen.tsx"
  ]) {
    const source = screen(fileName)
    assert.match(source, /PrimaryButton|SetupFlowActionDock|BlumiSetupShell/)
  }
  assert.match(screen("RegisterScreen.tsx"), /<RegisterCreateView[\s\S]*<RegisterSignInView/)
  assert.match(registerCreateView(), /<BlumiSetupShell/)
  assert.match(registerSignInView(), /<PrimaryButton/)

  assert.match(screen("AuthEntryScreen.tsx"), /CinematicActionButton/)
})

test("onboarding primary actions preserve busy and disabled feedback", () => {
  for (const source of [
    registerCreateView(),
    screen("AvatarSetupScreen.tsx"),
    screen("RoomSetupScreen.tsx")
  ]) {
    assert.match(source, /primaryActionBusy=\{/)
    assert.match(source, /primaryActionDisabled=\{/)
  }
  assert.match(registerSignInView(), /busy=\{busy\}/)
  assert.match(registerSignInView(), /disabled=\{register\.primaryDisabled\}/)
})

test("the create-account handoff keeps the selected character in the phone scene", () => {
  const registerSource = screen("RegisterScreen.tsx")
  const signInSource = registerSignInView()
  const coordinatorSource = screen("PreAuthSetupFlowScreen.tsx")

  assert.match(registerSource, /createFlowAvatar=\{createFlowAvatar\}/)
  assert.match(signInSource, /avatar=\{createFlowAvatar \?\? undefined\}/)
  assert.match(signInSource, /AvatarPreview2D/)
  for (const source of [registerSource, signInSource, registerCreateView()]) {
    assert.doesNotMatch(source, /SetupAnimatedAvatarPreview/)
    assert.doesNotMatch(source, /Previous style|Next style/)
  }
  assert.match(coordinatorSource, /createFlowAvatar=\{renderedDraft\.avatar\}/)
})

test("every setup step renders its primary action inside the shared safe-area dock", () => {
  for (const source of [
    screen("AvatarSetupScreen.tsx"),
    screen("RoomSetupScreen.tsx"),
    registerCreateView()
  ]) {
    assert.match(source, /BlumiSetupShell/)
  }

  const coordinatorSource = screen("PreAuthSetupFlowScreen.tsx")
  assert.doesNotMatch(coordinatorSource, /position:\s*["']absolute["']/)
})

test("hidden setup layers pause decorative background motion", () => {
  const shellSource = readFileSync(
    resolve(
      process.cwd(),
      "src/features/session/setupFlow/BlumiSetupShell.tsx"
    ),
    "utf8"
  )
  assert.match(shellSource, /animated=\{motionActive && !reduceMotion\}/)

  for (const fileName of [
    "AvatarSetupScreen.tsx",
    "RoomSetupScreen.tsx"
  ]) {
    const source = screen(fileName)
    assert.match(source, /motionActive=\{motionActive\}/)
    assert.doesNotMatch(source, /<SoftBlobBackground/)
  }
})

test("the shared action dock owns a consistent bottom surface", () => {
  const shellSource = readFileSync(
    resolve(
      process.cwd(),
      "src/features/session/setupFlow/BlumiSetupShell.tsx"
    ),
    "utf8"
  )
  const actionSource = readFileSync(
    resolve(
      process.cwd(),
      "src/features/session/setupFlow/SetupFlowPrimaryAction.tsx"
    ),
    "utf8"
  )

  assert.match(shellSource, /<View style=\{styles\.footer\}>/)
  assert.match(actionSource, /LinearGradient/)
  // The 58 pt height itself is pinned by onboardingActionLayout.test.ts.
  assert.match(actionSource, /height:\s*ONBOARDING_PRIMARY_ACTION_LAYOUT\.height/)
})

test("profile setup uses the full-height shared shell instead of assembling its own chrome", () => {
  const source = screen("ProfileSetupScreen.tsx")

  assert.match(source, /<BlumiSetupShell/)
  assert.match(source, /step="profile"/)
  assert.match(source, /stage=\{/)
  assert.match(source, /motionActive=\{motionActive\}/)
  assert.doesNotMatch(source, /<SetupFlowHeader/)
  assert.doesNotMatch(source, /<SetupFlowProgress/)
  assert.doesNotMatch(source, /<SetupFlowActionDock/)
})
