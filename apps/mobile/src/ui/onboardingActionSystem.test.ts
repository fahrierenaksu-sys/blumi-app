import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const screen = (name: string): string =>
  readFileSync(resolve(process.cwd(), "src/screens", name), "utf8")

test("onboarding completion actions use the shared primary action system", () => {
  for (const fileName of [
    "RegisterScreen.tsx",
    "ProfileSetupScreen.tsx",
    "AvatarSetupScreen.tsx",
    "RoomSetupScreen.tsx"
  ]) {
    const source = screen(fileName)
    assert.match(source, /PrimaryButton|SetupFlowActionDock|BlumiSetupShell/)
  }

  assert.match(screen("AuthEntryScreen.tsx"), /CinematicActionButton/)
})

test("onboarding primary actions preserve busy and disabled feedback", () => {
  for (const fileName of [
    "RegisterScreen.tsx",
    "AvatarSetupScreen.tsx",
    "RoomSetupScreen.tsx"
  ]) {
    const source = screen(fileName)
    assert.match(source, /primaryActionBusy=\{/)
    assert.match(source, /primaryActionDisabled=\{/)
  }
})

test("the create-account handoff keeps the selected character in the phone scene", () => {
  const registerSource = screen("RegisterScreen.tsx")
  const coordinatorSource = screen("PreAuthSetupFlowScreen.tsx")

  assert.match(registerSource, /createFlowAvatar/)
  assert.match(registerSource, /AvatarPreview2D/)
  assert.doesNotMatch(registerSource, /SetupAnimatedAvatarPreview/)
  assert.match(coordinatorSource, /createFlowAvatar=\{draft\.avatar/)
  assert.doesNotMatch(registerSource, /Previous style|Next style/)
})

test("every setup step renders its primary action inside the shared safe-area dock", () => {
  for (const fileName of [
    "AvatarSetupScreen.tsx",
    "RoomSetupScreen.tsx",
    "RegisterScreen.tsx"
  ]) {
    const source = screen(fileName)
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
  assert.match(actionSource, /height:\s*58/)
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
