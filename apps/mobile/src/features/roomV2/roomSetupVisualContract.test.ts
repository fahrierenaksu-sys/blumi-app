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
  assert.match(screen, /headerTitle=\{copy\.headerTitle\}/)
  assert.match(screen, /headerProgressStyle="fraction"/)
  assert.match(screen, /hideHeading/)
  assert.match(screen, /hideProgressRail/)
  assert.match(screen, /\{copy\.bedPlacedCard\}/)
  // Room setup text lives in roomSetupCopy.ts (Turkish and English).
  const copy = readFileSync(resolve(mobileRoot, "features/roomV2/roomSetupCopy.ts"), "utf8")
  assert.match(copy, /headerTitle: "İlk odan"/)
  assert.match(copy, /bedPlacedCard: "Yatak yerleştirildi"/)
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

test("room setup reports rejected placement and rotation before any success feedback", () => {
  const screen = readFileSync(
    resolve(mobileRoot, "screens/RoomSetupScreen.tsx"),
    "utf8"
  )

  assert.match(
    screen,
    /if \(!setUserRoomDecor\(nextDecor\)\) \{\s*setPlacementErrorMessage\(feedbackCopy\.mutationRejected\)\s*return\s*\}\s*setPlacementErrorMessage\(""\)\s*setBedSelected\(true\)\s*setPlacementMessage\(copy\.placement\.placed\)/
  )
  assert.match(
    screen,
    /if \(!setUserRoomDecor\(nextDecor\)\) \{\s*setPlacementErrorMessage\(feedbackCopy\.mutationRejected\)\s*return\s*\}\s*setPlacementErrorMessage\(""\)\s*setPlacementMessage\(copy\.placement\.rotated\)/
  )
  const copy = readFileSync(resolve(mobileRoot, "features/roomV2/roomSetupCopy.ts"), "utf8")
  assert.match(screen, /const feedbackCopy = copy\.feedback/)
  assert.match(copy, /placed: "Yatağın yerleşti\."/)
  assert.match(copy, /rotated: "Yatak çevrildi\. Taşımak için odaya dokun\."/)
  assert.match(copy, /mutationRejected:\s*"Oda değişikliği uygulanamadı\. Yeniden dene\."/)
  assert.match(copy, /mutationRejected:\s*"That room change could not be applied\. Please try again\."/)
})

test("room setup surfaces later persistence conflicts instead of leaving stale success copy", () => {
  const screen = readFileSync(
    resolve(mobileRoot, "screens/RoomSetupScreen.tsx"),
    "utf8"
  )

  assert.match(
    screen,
    /persistenceState === "failed" \? \([\s\S]*?accessibilityLiveRegion="assertive"[\s\S]*?accessibilityRole="alert"[\s\S]*?feedbackCopy\.persistenceAttention[\s\S]*?\) : placementErrorMessage \?/)
  const copy = readFileSync(resolve(mobileRoot, "features/roomV2/roomSetupCopy.ts"), "utf8")
  assert.match(copy, /persistenceAttention:\s*"Oda kaydıyla ilgili bir sorun var\. Güncel düzeni kontrol et\."/)
  assert.match(copy, /persistenceAttention:\s*"Room saving needs attention\. Review the current layout\."/)
})
