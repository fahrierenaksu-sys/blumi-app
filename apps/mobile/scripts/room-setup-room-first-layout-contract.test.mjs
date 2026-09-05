import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const mobileRoot = resolve(import.meta.dirname, "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("room onboarding uses the room-first shell without duplicate heading or checklist chrome", () => {
  const screen = read("src/screens/RoomSetupScreen.tsx")
  const shell = read("src/features/session/setupFlow/BlumiSetupShell.tsx")
  const header = read("src/features/session/setupFlow/SetupFlowHeader.tsx")

  assert.match(screen, /headerTitle="İlk odan"/)
  assert.match(screen, /headerProgressStyle="fraction"/)
  assert.match(screen, /hideHeading/)
  assert.match(screen, /hideProgressRail/)
  assert.match(screen, /stageHeight=\{roomStageHeight\}/)
  assert.match(screen, /const roomStageHeight = getRoomSetupStageHeight\(setupMetrics\.compact, height\)/)
  assert.match(screen, /immersiveBottomSheet/)
  assert.match(screen, /taskCardTone="sheet"/)
  assert.match(screen, /HEDİYE/)
  assert.match(screen, /İlk köşen hazır/)
  assert.match(screen, /roomSceneSurface/)
  assert.match(screen, /backgroundColor:\s*uiTheme\.colors\.backgroundWarm/)
  assert.match(screen, /bedEditorToolbar/)
  assert.match(screen, /setupMetrics\.dense \? styles\.stageFrameDense : null/)
  assert.match(screen, /setupMetrics\.dense \? styles\.roomFirstSheetDense : null/)
  assert.doesNotMatch(screen, /roomInteractionCue/)
  assert.doesNotMatch(screen, /roomRenderer:\s*\{[^}]*borderWidth/)
  assert.doesNotMatch(screen, /RoomSetupProgressRail/)

  assert.match(shell, /headerTitle\?: string/)
  assert.match(shell, /headerProgressStyle\?: "fraction" \| "dots"/)
  assert.match(shell, /hideProgressRail\?: boolean/)
  assert.match(shell, /hideHeading\?: boolean/)
  assert.match(shell, /immersiveBottomSheet\?: boolean/)
  assert.match(shell, /!immersiveBottomSheet \? \(/)
  assert.match(shell, /backgroundColor: uiTheme\.colors\.backgroundWarm/)
  assert.match(shell, /bottomSheetSurface/)
  assert.match(shell, /immersiveFlow/)
  assert.match(shell, /immersiveBottomBleed/)
  assert.doesNotMatch(shell, /bottomSheetPanelRef|syncBottomSheetTop/)
  assert.match(header, /progressStyle\?: "fraction" \| "dots"/)
  assert.match(header, /progressStyle === "dots"/)

  assert.match(shell, /taskCardTone\?: "default" \| "liquid" \| "sheet"/)
})
