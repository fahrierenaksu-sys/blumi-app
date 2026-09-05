import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const mobileRoot = resolve(import.meta.dirname, "../..")

test("room setup uses a room-first surface while keeping the shared CTA dock", () => {
  const screen = readFileSync(
    resolve(mobileRoot, "screens/RoomSetupScreen.tsx"),
    "utf8"
  )

  assert.match(screen, /<BlumiSetupShell/)
  assert.match(screen, /immersiveBottomSheet/)
  assert.match(screen, /taskCardTone="sheet"/)
  assert.match(screen, /primaryActionTestID="room-setup-submit"/)
  assert.doesNotMatch(screen, /position:\s*["']absolute["'][\s\S]*room-setup-submit/)
  assert.match(screen, /headerTitle="İlk odan"/)
  assert.match(screen, /headerProgressStyle="fraction"/)
  assert.match(screen, /hideHeading/)
  assert.match(screen, /hideProgressRail/)
  assert.match(screen, /Yatak yerleştirildi/)
})

test("room setup follows the approved open-room composition", () => {
  const screen = readFileSync(
    resolve(mobileRoot, "screens/RoomSetupScreen.tsx"),
    "utf8"
  )
  assert.match(screen, /getRoomSetupTaskCardMinHeight/)
  assert.match(screen, /getRoomSetupStageHeight/)
  assert.match(screen, /getRoomSetupStageHeight\(setupMetrics\.compact, height\)/)
  assert.match(screen, /roomSceneSurface/)
  assert.match(screen, /backgroundColor:\s*uiTheme\.colors\.backgroundWarm/)
  assert.match(screen, /showDepthWash=\{false\}/)
  assert.doesNotMatch(screen, /selectedInstanceId=/)
  assert.match(screen, /roomFirstStatus:\s*\{[^}]*marginBottom:\s*uiTheme\.spacing\.md/)
  assert.doesNotMatch(screen, /stageFrameDense/)
  assert.match(screen, /setupMetrics\.dense \? styles\.roomFirstSheetDense : null/)
  assert.match(screen, /starterItemTitle:\s*\{[^}]*\.\.\.uiTheme\.font\.bodyBold/)
  assert.match(screen, /starterItemHint:\s*\{[^}]*\.\.\.uiTheme\.font\.bodySmall/)
  assert.doesNotMatch(screen, /roomInteractionCue/)
  assert.match(screen, /bedEditorToolbar/)
  assert.doesNotMatch(screen, /roomSceneSurface:\s*\{[^}]*borderWidth/)
  assert.doesNotMatch(screen, /primaryActionPlacement/)
})

test("room setup keeps its scene static and leaves continuous motion out of the editor", () => {
  const screen = readFileSync(
    resolve(mobileRoot, "screens/RoomSetupScreen.tsx"),
    "utf8"
  )

  assert.match(screen, /motionEnabled=\{false\}/)
  assert.doesNotMatch(screen, /RoomSetupProgressRail|withRepeat|setInterval/)
})
