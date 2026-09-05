import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const mobileRoot = resolve(import.meta.dirname, "../..")

test("avatar setup promotes the character into an interactive studio stage", () => {
  const screen = readFileSync(
    resolve(mobileRoot, "screens/AvatarSetupScreen.tsx"),
    "utf8"
  )

  assert.match(screen, /AvatarSetupStudioStage/)
  assert.match(screen, /<BlumiSetupShell[\s\S]*?stageInteractive[\s\S]*?stage=\{/)
  assert.match(screen, /disabled=\{busy\}/)
  assert.match(screen, /motionActive=\{motionActive\}/)
  assert.match(screen, /initialGender\?: string/)
  assert.match(screen, /getOnboardingStarterBodyId\(initialGender\)/)
  assert.match(screen, /getAvatarSetupImmersiveStageHeight\(compact, height, veryCompact\)/)
  assert.match(screen, /item\.type === "body" && item\.id === preferredBodyId/)
  assert.match(screen, /reconciledBodyIdRef/)
  assert.match(screen, /useLayoutEffect\(\(\) => \{/)
  assert.match(screen, /getAvatarStarterBodyItems\(catalog, canEquipItem\)/)
  assert.match(screen, /const stageAvatar = useMemo\(/)
  assert.match(screen, /bodyId: firstFrameAvatar\.bodyId/)
  assert.match(
    screen,
    /preferredBodyId &&[\s\S]*?reconciledBodyIdRef\.current !== preferredBodyId[\s\S]*?applyOnboardingStarterBody\(avatar, preferredBodyId/
  )
  assert.match(
    screen,
    /getAvatarStarterCategoryItems\(\s*catalog,\s*type,\s*stageAvatar\.bodyId,\s*canEquipItem\s*\)/
  )
  assert.match(screen, /normalizeAvatarForStarterSetup\(stageAvatar, categoryItems\)/)
  assert.match(screen, /useReducedMotionPreference/)
  assert.match(screen, /getAvatarStudioNextIndex\(/)
  assert.doesNotMatch(screen, /styles\.categoryGrid|styles\.selectionRow/)
})

test("studio stage keeps each product group inside its own symmetric orbit pod", () => {
  const stage = readFileSync(
    resolve(mobileRoot, "features/avatarV2/components/AvatarSetupStudioStage.tsx"),
    "utf8"
  )

  assert.match(stage, /avatar-style-previous/)
  assert.match(stage, /avatar-style-next/)
  assert.match(stage, /styles\.avatarAnchor/)
  assert.match(stage, /bottom: metrics\.avatarBottomInset/)
  assert.match(stage, /useWindowDimensions/)
  assert.match(stage, /getAvatarStudioStageMetrics\(\s*compact,\s*width,\s*stageWidth > 0 \? stageWidth : undefined,\s*height,\s*veryCompact\s*\)/)
  assert.match(stage, /veryCompact: boolean/)
  assert.match(stage, /onLayout=\{onStageLayout\}/)
  assert.match(stage, /styles\.genderRail/)
  assert.match(stage, /genderRail:\s*\{[\s\S]*?borderWidth: 1\.5/)
  assert.match(stage, /borderColor: "rgba\(214, 70, 109, 0\.28\)"/)
  assert.match(stage, /testID="avatar-gender-woman"/)
  assert.match(stage, /testID="avatar-gender-man"/)
  assert.match(stage, /testID=\{`avatar-style-previous-\$\{category\.type\}`\}/)
  assert.match(stage, /testID=\{`avatar-style-next-\$\{category\.type\}`\}/)
  assert.match(stage, /<OrbitPod/)
  assert.match(stage, /styles\.orbitPod/)
  assert.match(stage, /styles\.orbitPodActive/)
  assert.match(stage, /styles\.orbitPodLeft/)
  assert.match(stage, /styles\.orbitPodRight/)
  assert.match(stage, /styles\.podCenter/)
  assert.match(stage, /styles\.podIcon/)
  assert.match(stage, /styles\.podText/)
  assert.match(stage, /styles\.podArrow/)
  assert.match(stage, /metrics\.orbitPod\[category\.type\]/)
  assert.match(stage, /styles\.orbitRing/)
  assert.match(stage, /styles\.sparkleDot/)
  assert.match(stage, /onCycle\(category\.type, -1\)/)
  assert.match(stage, /onCycle\(category\.type, 1\)/)
  assert.match(stage, /styles\.orbitalBackdrop/)
  assert.match(stage, /styles\.ambientBloom/)
  assert.match(stage, /styles\.backdropVeil/)
  assert.match(stage, /styles\.ambientBloom/)
  assert.match(stage, /ambientPulse/)
  assert.match(stage, /withRepeat/)
  assert.match(stage, /styles\.ambientSparkle/)
  assert.doesNotMatch(stage, /styles\.zoneLabel|styles\.zoneArrowLeft|styles\.zoneArrowRight|ORBIT_LABEL_SIDE|accessibilityRole="adjustable"/)
  assert.match(stage, /withTiming/)
  assert.doesNotMatch(stage, /styles\.categoryRail/)
  assert.equal((stage.match(/<AvatarPreview2D/g) ?? []).length, 1)
  assert.doesNotMatch(stage, /key=\{selectionKey\}/)
  assert.match(stage, /const POD_ARROW_VISUAL_SIZE = 26/)
  assert.match(stage, /const POD_ARROW_HIT_SLOP = 9/)
  assert.match(stage, /hitSlop=\{POD_ARROW_HIT_SLOP\}/)
  assert.doesNotMatch(stage, /width: 44/)
  assert.doesNotMatch(stage, /height: 44/)
})

test("studio outfit swaps establish their hidden start before paint", () => {
  const stage = readFileSync(
    resolve(mobileRoot, "features/avatarV2/components/AvatarSetupStudioStage.tsx"),
    "utf8"
  )

  assert.match(stage, /useLayoutEffect/)
  assert.match(
    stage,
    /useLayoutEffect\(\(\) => \{[\s\S]*selectionProgress\.value = 0[\s\S]*withTiming\(1, \{ duration: MOTION_MS \}\)/
  )
  assert.doesNotMatch(
    stage,
    /useEffect\(\(\) => \{[\s\S]*selectionProgress\.value = 0/
  )
})

test("avatar categories live in independent orbit pods without a full-width control rail", () => {
  const screen = readFileSync(
    resolve(mobileRoot, "screens/AvatarSetupScreen.tsx"),
    "utf8"
  )
  const stage = readFileSync(
    resolve(mobileRoot, "features/avatarV2/components/AvatarSetupStudioStage.tsx"),
    "utf8"
  )

  assert.doesNotMatch(screen, /styles\.categoryTabs/)
  assert.match(screen, /onSelectGender/)
  assert.match(screen, /onSelectCategory/)
  assert.doesNotMatch(screen, /styles\.genderRail/)
  assert.match(screen, /stageHeight=\{getAvatarSetupImmersiveStageHeight\(compact, height, veryCompact\)\}/)
  assert.match(screen, /headerTitle="İlk görünümün"/)
  assert.match(screen, /headerProgressStyle="fraction"/)
  assert.match(screen, /hideProgressRail/)
  assert.match(screen, /immersiveBottomSheet/)
  assert.match(screen, /hideHeading/)
  assert.match(screen, /taskCardTone="sheet"/)
  assert.match(screen, /taskCardMinHeight=\{getAvatarSetupTaskCardMinHeight\(compact, veryCompact, height\)\}/)
  assert.match(screen, /styles\.avatarFirstSheet/)
  assert.match(screen, /styles\.avatarFirstSummary/)
  assert.match(screen, /styles\.avatarFirstTitle/)
  assert.match(screen, /styles\.avatarFirstDescription/)
  assert.match(screen, /Karakterini hazırla/)
  assert.match(screen, /Bu sadece başlangıç\. Tarzını sonra da değiştirebilirsin\./)
  assert.match(screen, /Bu sadece başlangıç\./)
  assert.match(screen, /İstediğin zaman değiştir/)
  assert.match(screen, /Mağaza’da yeni parçalar keşfet/)
  assert.match(screen, /styles\.avatarFreedomNote/)
  assert.match(screen, /styles\.avatarFreedomItem/)
  assert.doesNotMatch(screen, /testID="avatar-ready-status"/)
  assert.doesNotMatch(screen, /Saç, üst, alt ve ayakkabı hazır\./)
  assert.doesNotMatch(screen, /Kadın görünümün seçili|Erkek görünümün seçili/)
  assert.doesNotMatch(screen, /hideTaskCard/)
  assert.doesNotMatch(screen, /avatar-surprise-me|avatar-edit-profile/)
  assert.match(stage, /styles\.orbitPodActive/)
  assert.match(stage, /styles\.podIconActive/)
  assert.match(stage, /metrics\.orbitPod\[category\.type\]/)
  assert.match(stage, /avatar-zone-\$\{category\.type\}/)
  assert.match(stage, /`\$\{categoryLabel\} için \$\{previous \? "önceki" : "sonraki"\} görünüm`/)
  assert.doesNotMatch(stage, /styles\.zoneControlRibbon|styles\.rowGlowActive|styles\.controlPodShell|styles\.zoneArrowRow|styles\.zoneLabel/)
})

test("studio selection motion stays bounded and respects Reduce Motion", () => {
  const stage = readFileSync(
    resolve(mobileRoot, "features/avatarV2/components/AvatarSetupStudioStage.tsx"),
    "utf8"
  )

  assert.match(stage, /useSharedValue/)
  assert.match(stage, /withTiming/)
  assert.match(stage, /reduceMotion/)
  assert.match(stage, /motionActive/)
  assert.match(stage, /\[0\.982, 1\]/)
  assert.match(stage, /withRepeat/)
  assert.doesNotMatch(stage, /setInterval/)
  assert.match(stage, /previousSelectionKeyRef/)
  assert.match(stage, /if \(previousSelectionKeyRef\.current === selectionKey\)/)
})
