import assert from "node:assert/strict"
import test from "node:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const criticalFiles = [
  "src/components/IncomingInviteCallout.tsx",
  "src/components/ReportModal.tsx",
  "src/components/DiscoverFiltersBottomSheet.tsx",
  "src/components/MatchResultModal.tsx",
  "src/components/CountryCallingCodePicker.tsx",
  "src/screens/InboxScreen.tsx",
  "src/screens/ChatThreadScreen.tsx",
  "src/features/chat/thread/ChatThreadHeader.tsx",
  "src/features/chat/thread/ChatThreadEmptyState.tsx",
  "src/features/chat/thread/ChatTimelineRow.tsx",
  "src/features/chat/thread/ChatLoadEarlierButton.tsx",
  "src/features/chat/thread/ChatComposer.tsx",
  "src/screens/SettingsScreen.tsx",
  "src/features/settings/SettingsRow.tsx",
  "src/features/settings/BlockedUserRow.tsx",
  "src/features/settings/SettingsMatchingSection.tsx",
  "src/features/settings/SettingsNotificationsSection.tsx",
  "src/features/settings/SettingsSafetySection.tsx",
  "src/features/settings/SettingsPrivacySection.tsx",
  "src/features/settings/SettingsInfoSections.tsx",
  "src/features/settings/SettingsAccountSection.tsx",
  "src/features/settings/AccountVerificationModals.tsx",
  "src/screens/YouScreen.tsx",
  "src/screens/WardrobeV2Screen.tsx",
  "src/features/avatarV2/wardrobe/wardrobeTryOn.ts",
  "src/features/avatarV2/wardrobe/useWardrobeTryOn.ts",
  "src/features/avatarV2/wardrobe/WardrobeCatalogCard.tsx",
  "src/features/avatarV2/wardrobe/WardrobeCategoryTabs.tsx",
  "src/features/avatarV2/wardrobe/WardrobeSectionSwitcher.tsx",
  "src/features/avatarV2/wardrobe/WardrobeTopBar.tsx",
  "src/features/avatarV2/wardrobe/WardrobePreviewStage.tsx",
  "src/features/avatarV2/wardrobe/WardrobeSaveError.tsx",
  "src/features/avatarV2/wardrobe/WardrobeCatalogEmpty.tsx",
  "src/features/avatarV2/wardrobe/WardrobeCatalogList.tsx",
  "src/screens/AvatarSetupScreen.tsx",
  "src/screens/MyRoomEditorScreen.tsx",
  "src/screens/MyRoomScreen.tsx",
  "src/screens/ProfilePreviewScreen.tsx",
  "src/screens/ProfileEditScreen.tsx",
  "src/screens/RoomDebriefScreen.tsx",
  "src/screens/RegisterScreen.tsx",
  "src/features/session/register/RegisterCreateView.tsx",
  "src/features/session/register/RegisterSignInView.tsx",
  "src/features/session/register/RegisterPhoneEntry.tsx",
  "src/features/session/register/RegisterOtpEntry.tsx",
  "src/features/session/register/RegisterTermsConsent.tsx",
  "src/features/session/register/RegisterLegalLinks.tsx",
  "src/features/session/register/RegisterErrorNotice.tsx",
  "src/features/session/register/RegisterFormMetaRow.tsx",
  "src/features/session/register/AccountRecoveryModal.tsx",
  "src/screens/ProfileSetupScreen.tsx",
  "src/features/miniRoom/scene/MiniRoomHud.tsx",
  "src/features/miniRoom/scene/MiniRoomScene.tsx",
  "src/features/miniRoom/scene/HotspotLayer.tsx",
  "src/ui/errorBoundary.tsx",
  "src/ui/primitives.tsx",
  "src/ui/toast.tsx",
  "src/ui/vibeTilePicker.tsx"
]

const registerDirectory = resolve(mobileRoot, "src/features/session/register")
const readRegister = (fileName) =>
  readFileSync(resolve(registerDirectory, fileName), "utf8")
const readRegisterScreen = () =>
  readFileSync(resolve(mobileRoot, "src/screens/RegisterScreen.tsx"), "utf8")
// The whole registration surface: the screen plus every non-test register module.
const readRegisterSurface = () => [
  readRegisterScreen(),
  ...readdirSync(registerDirectory)
    .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
    .map(readRegister)
].join("\n")

test("critical journey controls expose accessible roles and names", () => {
  const failures = []
  for (const relativePath of criticalFiles) {
    const source = readFileSync(resolve(mobileRoot, relativePath), "utf8")
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
    inspectNode(sourceFile, sourceFile, relativePath, failures)
  }
  assert.deepEqual(failures, [])
})

test("registration exposes one progressive primary action", () => {
  const screen = readRegisterScreen()
  const surface = readRegisterSurface()
  const signInView = readRegister("RegisterSignInView.tsx")
  const phoneEntry = readRegister("RegisterPhoneEntry.tsx")
  const otpEntry = readRegister("RegisterOtpEntry.tsx")
  const metaRow = readRegister("RegisterFormMetaRow.tsx")
  const model = readRegister("registerScreenModel.ts")
  const controller = readRegister("useRegisterFlowController.ts")

  assert.match(phoneEntry, /testID="register-phone-step"/)
  assert.match(otpEntry, /testID="register-code-step"/)
  assert.match(signInView, /testID="register-primary-action"/)
  assert.match(signInView, /accessibilityRole="header"/)
  assert.match(otpEntry, /authCopy\.changePhoneNumber/)
  assert.match(
    readFileSync(resolve(mobileRoot, "src/features/session/authEntryCopy.ts"), "utf8"),
    /changePhoneNumber:\s*"Change phone number"/
  )
  assert.match(otpEntry, /disabled=\{busy\}/)
  assert.doesNotMatch(surface, /YOUR BLUMI ACCOUNT/)
  assert.match(model, /const progressTotal = authIntent === "create" \? 4 : 2/)
  assert.match(model, /const progressCurrent = authIntent === "create"/)
  assert.match(signInView, /testID=\{`register-progress-\$\{index\}`\}/)
  assert.match(signInView, /accessibilityRole="progressbar"/)
  assert.match(signInView, /accessibilityValue=\{\{\s*min: 1,\s*max: progressTotal,\s*now: progressCurrent/)
  assert.match(metaRow, /authCopy\.phoneQuestion/)
  assert.doesNotMatch(surface, /YOUR BLUMI JOURNEY/)
  assert.doesNotMatch(surface, /\bAI\b|artificial intelligence/i)
  assert.match(signInView, /authCopy\.phonePrivacy/)
  assert.doesNotMatch(surface, /Example format: \+90/)
  assert.match(otpEntry, /testID=\{`register-otp-cell-\$\{index\}`\}/)
  assert.match(otpEntry, /importantForAccessibility="no-hide-descendants"/)
  assert.match(otpEntry, /accessibilityElementsHidden/)
  assert.match(otpEntry, /textContentType="oneTimeCode"/)
  assert.match(otpEntry, /resendCooldownSeconds/)
  assert.match(controller, /setPhoneTouched\(true\)/)
  assert.match(controller, /setOtpTouched\(true\)/)
  assert.match(model, /phoneTouched[^\n]*\|\|[^\n]*attemptedPrimaryAction/)
  assert.match(model, /otpTouched[^\n]*\|\|[^\n]*attemptedPrimaryAction/)
  assert.doesNotMatch(surface, /disabled=\{busy \|\| !primaryEnabled\}/)
  assert.match(screen, /navigation\.navigate\("Legal", \{ type: "privacy" \}\)/)
  assert.match(screen, /navigation\.navigate\("Legal", \{ type: "terms" \}\)/)
})

test("registration distributes its primary sections across the viewport", () => {
  assert.match(
    readRegister("registerStyles.ts"),
    /content:\s*\{[^}]*flexGrow:\s*1,[^}]*justifyContent:\s*"space-between"/
  )
  assert.match(readRegister("RegisterSignInView.tsx"), /contentContainerStyle=\{styles\.content\}/)
})

test("country calling code picker is searchable and modal-accessible", () => {
  const source = readFileSync(
    resolve(mobileRoot, "src/components/CountryCallingCodePicker.tsx"),
    "utf8"
  )

  assert.match(source, /accessibilityLabel=\{copy\.choose\}/)
  assert.match(source, /accessibilityState=\{\{ expanded: visible/)
  assert.match(source, /accessibilityViewIsModal/)
  assert.match(source, /accessibilityLabel=\{copy\.search\}/)
  assert.match(source, /accessibilityState=\{\{ selected/)
  assert.match(source, /style=\{styles\.sheetGlassTint\}/)
  assert.match(source, /selectedOption\.flag/)
  assert.match(source, /country\.flag/)
})

test("onboarding explains the full account-to-room journey", () => {
  const progress = readFileSync(
    resolve(mobileRoot, "src/features/session/setupFlow/SetupFlowProgress.tsx"),
    "utf8"
  )
  const profile = readFileSync(
    resolve(mobileRoot, "src/screens/ProfileSetupScreen.tsx"),
    "utf8"
  )
  const avatar = readFileSync(
    resolve(mobileRoot, "src/screens/AvatarSetupScreen.tsx"),
    "utf8"
  )
  const room = readFileSync(
    resolve(mobileRoot, "src/screens/RoomSetupScreen.tsx"),
    "utf8"
  )
  const shellModel = readFileSync(
    resolve(mobileRoot, "src/features/session/setupFlow/setupFlowShellModel.ts"),
    "utf8"
  )

  assert.match(progress, /accessibilityRole="progressbar"/)
  assert.match(progress, /accessibilityValue=\{\{[\s\S]*now: current/)
  assert.match(shellModel, /profile:[\s\S]*avatar:[\s\S]*room:[\s\S]*phone:/)
  assert.match(profile, /step="profile"/)
  assert.match(profile, /copy\.publicNameHint/)
  assert.match(
    readFileSync(resolve(mobileRoot, "src/features/session/profileSetupCopy.ts"), "utf8"),
    /publicNameHint:\s*"This name is public\. A first name or nickname is enough\."/
  )
  assert.match(avatar, /step="avatar"/)
  assert.match(room, /step="room"/)
})

test("profile setup is one page by default with an accessible overflow fallback", () => {
  const source = readFileSync(
    resolve(mobileRoot, "src/screens/ProfileSetupScreen.tsx"),
    "utf8"
  )
  const layoutSource = readFileSync(
    resolve(mobileRoot, "src/features/session/profileSetupLayout.ts"),
    "utf8"
  )
  const shellSource = readFileSync(
    resolve(mobileRoot, "src/features/session/setupFlow/BlumiSetupShell.tsx"),
    "utf8"
  )

  assert.match(source, /useWindowDimensions/)
  assert.match(shellSource, /scrollEnabled=\{metrics\.shouldScroll \|\| keyboardVisible\}/)
  assert.match(shellSource, /useWindowDimensions/)
  assert.match(source, /accessibilityLabel=\{copy\.displayName\}/)
  assert.match(source, /copy\.publicNameHint/)
  assert.match(source, /accessibilityLabel=\{copy\.gender\}/)
  assert.match(source, /accessibilityLiveRegion="polite"/)
  assert.match(source, /primaryActionDisabled=\{!canSubmit\}/)
  assert.doesNotMatch(source, /\bAI\b|artificial intelligence/i)
  assert.match(layoutSource, /MIN_NO_SCROLL_HEIGHT/)
  assert.match(layoutSource, /MAX_INLINE_FONT_SCALE/)
})

test("avatar setup is a no-scroll direct-manipulation stylist", () => {
  const source = readFileSync(
    resolve(mobileRoot, "src/screens/AvatarSetupScreen.tsx"),
    "utf8"
  )
  const stageSource = readFileSync(
    resolve(
      mobileRoot,
      "src/features/avatarV2/components/AvatarSetupStudioStage.tsx"
    ),
    "utf8"
  )
  const layoutSource = readFileSync(
    resolve(mobileRoot, "src/features/avatarV2/avatarSetupLayout.ts"),
    "utf8"
  )

  assert.doesNotMatch(source, /ScrollView/)
  assert.match(source, /useWindowDimensions/)
  assert.match(stageSource, /avatar-style-previous/)
  assert.match(stageSource, /avatar-style-next/)
  assert.match(stageSource, /avatar-gender-woman/)
  assert.match(stageSource, /avatar-gender-man/)
  assert.match(
    stageSource,
    /accessibilityState=\{\{ disabled, selected: active \}\}/
  )
  assert.match(source, /fontScale/)
  assert.match(layoutSource, /height < 700/)
  assert.match(
    stageSource,
    /accessibilityState=\{\{ disabled, selected: active \}\}/
  )
  assert.match(source, /Karakterim hazır/)
  assert.match(source, /FEMALE_STARTER_BODY_ID/)
  assert.match(source, /MALE_STARTER_BODY_ID/)
  assert.match(stageSource, /accessibilityRole="radio"/)
  assert.match(stageSource, /accessibilityRole="tab"/)
  assert.match(stageSource, /testID=\{`avatar-zone-\$\{category\.type\}`\}/)
  assert.match(stageSource, /minHeight: 44/)
  assert.doesNotMatch(source, /avatar-surprise-me|avatar-edit-profile/)
})

test("field validation errors are announced", () => {
  const source = readFileSync(resolve(mobileRoot, "src/ui/fieldInput.tsx"), "utf8")
  assert.match(source, /accessibilityRole="alert"/)
  assert.match(source, /accessibilityLiveRegion="polite"/)
})

test("critical continuous motion honors the operating system Reduce Motion preference", () => {
  const contracts = [
    {
      relativePath: "src/ui/backgrounds.tsx",
      patterns: [
        /const motionEnabled = animated && !reduceMotion/,
        /if \(!motionEnabled\) \{[\s\S]*pulseAnim\.stopAnimation\(\)[\s\S]*pulseAnim\.setValue\(0\)/,
        /const scaleInterp = motionEnabled/
      ]
    },
    {
      relativePath: "src/ui/BlumiLoadingScreen.tsx",
      patterns: [
        /if \(shouldReduceMotion\) \{[\s\S]*scanRows\.stopAnimation\(\)[\s\S]*scanSweep\.stopAnimation\(\)[\s\S]*scanRows\.setValue\(1\)[\s\S]*scanSweep\.setValue\(1\)/
      ]
    },
    {
      relativePath: "src/ui/connectionBanner.tsx",
      patterns: [
        /if \(reduceMotion\) \{[\s\S]*slideAnim\.stopAnimation\(\)[\s\S]*slideAnim\.setValue\(targetValue\)/,
        /if \(!shouldShow \|\| reduceMotion\) \{[\s\S]*pulseAnim\.stopAnimation\(\)[\s\S]*pulseAnim\.setValue\(1\)/
      ]
    },
    {
      relativePath: "src/components/DiscoverCard.tsx",
      patterns: [
        /if \(!active \|\| reduceMotion\) \{[\s\S]*anim\.stopAnimation\(\)[\s\S]*anim\.setValue\(1\)/
      ]
    },
    {
      relativePath: "src/components/MatchResultModal.tsx",
      patterns: [
        /const motion = getMatchCelebrationMotion\(reduceMotion\)/,
        /if \(!motion\.entranceSpring\) \{[\s\S]*scaleAnim\.setValue\(1\)[\s\S]*return[\s\S]*const animation = Animated\.sequence/,
        /<ConfettiOverlay playing=\{visible && motion\.confetti\}/,
        /animationType=\{motion\.modalAnimationType\}/
      ]
    },
    {
      relativePath: "src/screens/InboxScreen.tsx",
      patterns: [
        /if \(!hasUnreadThread \|\| reduceMotion\) \{[\s\S]*unreadPulseAnim\.stopAnimation\(\)[\s\S]*unreadPulseAnim\.setValue\(1\)/
      ]
    },
    {
      relativePath: "src/features/roomV2/components/RoomRenderer2D.tsx",
      patterns: [
        /if \(reduceMotion\) \{[\s\S]*pulseRef\.stopAnimation\(\)[\s\S]*pulseRef\.setValue\(0\)/,
        /!avatarMotion\.usesAnimatedAssets &&[\s\S]*!reduceMotion/,
        /item\.kind !== "avatar" \|\|[\s\S]*reduceMotion \|\|[\s\S]*!avatarMotion\.usesRuntimeGesture/
      ]
    },
    {
      relativePath: "src/features/avatarV2/room/components/RoomAvatarRenderer2D.tsx",
      patterns: [
        /getLayerAnimationState\(layers, !reduceMotion\)/,
        /animation\.hasAnimation[\s\S]*subscribeRoomAvatarFrameTicker[\s\S]*: \(\) => undefined/,
        /const frameIndex = !animation\.hasAnimation[\s\S]*\? 0/
      ]
    }
  ]

  for (const { relativePath, patterns } of contracts) {
    const source = readFileSync(resolve(mobileRoot, relativePath), "utf8")
    assert.match(
      source,
      /useReducedMotion(?:Preference)?\(\)/,
      `${relativePath} must read the OS motion preference`
    )
    for (const pattern of patterns) {
      assert.match(source, pattern, `${relativePath} must stop and stabilize its motion path`)
    }
  }
})

test("connection banner stays compact without covering safe-area content", () => {
  const source = readFileSync(
    resolve(mobileRoot, "src/ui/connectionBanner.tsx"),
    "utf8"
  )

  assert.match(source, /useSafeAreaInsets\(\)/)
  assert.match(source, /top: Math\.max\(0, insets\.top - 12\)/)
  assert.doesNotMatch(source, /paddingTop:\s*54/)
})

test("profile editing exposes radio semantics and announces validation and save status", () => {
  const source = readFileSync(
    resolve(mobileRoot, "src/screens/ProfileEditScreen.tsx"),
    "utf8"
  )
  const copy = readFileSync(
    resolve(mobileRoot, "src/features/session/profileEditCopy.ts"),
    "utf8"
  )

  assert.match(source, /accessibilityRole="radiogroup"/)
  assert.match(source, /accessibilityRole="radio"/)
  assert.match(source, /accessibilityRole="alert"/)
  assert.match(source, /accessibilityLiveRegion="polite"/)
  assert.match(source, /\{copy\.savedStatus\}/)
  assert.match(copy, /savedStatus: "Profile saved"/)
  assert.match(source, /\{copy\.interestHint\}/)
  assert.match(copy, /interestHint: "One interest per line"/)
  assert.match(source, /\(currentInterests \?\? \[\]\)\.join\("\\n"\)/)
  assert.match(
    source,
    /accessibilityLabel=\{copy\.interestsAccessibility\}[\s\S]*?multiline/
  )
  assert.match(copy, /interestsAccessibility: "Interests, one interest per line"/)
})

test("settings phone change reuses the country-aware phone contract", () => {
  const modal = readFileSync(
    resolve(mobileRoot, "src/features/settings/AccountVerificationModals.tsx"),
    "utf8"
  )
  const flow = readFileSync(
    resolve(mobileRoot, "src/features/settings/usePhoneChange.ts"),
    "utf8"
  )

  assert.match(modal, /<CountryCallingCodePicker/)
  assert.match(flow, /analyzeLocalPhoneNumber\(newPhoneNumber, newPhoneCountry\)/)
  assert.match(flow, /newPhoneAnalysis\.normalizedPhoneNumber/)
  assert.match(flow, /newPhoneAnalysis\.valid/)
  assert.match(flow, /formatLocalPhoneNumber\(value, newPhoneCountry\)/)
})

test("room starter choices stay reachable on narrow screens and larger text", () => {
  const source = readFileSync(
    resolve(mobileRoot, "src/screens/RoomSetupScreen.tsx"),
    "utf8"
  )
  const shell = readFileSync(
    resolve(mobileRoot, "src/features/session/setupFlow/BlumiSetupShell.tsx"),
    "utf8"
  )

  assert.match(source, /const \{ fontScale, height, width \} = useWindowDimensions\(\)/)
  assert.match(source, /getSetupLayoutMetrics\(\{ fontScale, height, width \}\)/)
  assert.match(source, /taskCardMinHeight=\{roomTaskCardMinHeight\}/)
  assert.match(shell, /scrollEnabled=\{metrics\.shouldScroll \|\| keyboardVisible\}/)
})

test("account recovery remains keyboard-safe and scrollable on short screens", () => {
  const modal = readRegister("AccountRecoveryModal.tsx")
  const layoutHook = readRegister("useRegisterLayout.ts")
  const model = readRegister("registerScreenModel.ts")

  assert.match(modal, /<KeyboardAvoidingView[\s\S]*recoveryKeyboard/)
  assert.match(modal, /keyboardShouldPersistTaps="handled"/)
  assert.match(modal, /recoveryScrollContent/)
  assert.match(layoutHook, /useWindowDimensions/)
  assert.match(model, /const stackRecoveryActions = viewportWidth < 360 \|\| viewportFontScale >= 1\.25/)
  assert.match(modal, /stackRecoveryActions/)
  assert.match(modal, /recoveryActionsStacked/)
  assert.match(readRegister("RegisterSignInView.tsx"), /stackRecoveryActions=\{layout\.stackRecoveryActions\}/)
})

function inspectNode(node, sourceFile, relativePath, failures) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile)
    const attributes = new Set(
      node.attributes.properties
        .filter(ts.isJsxAttribute)
        .map((attribute) => attribute.name.getText(sourceFile))
    )
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    if (tagName === "Pressable") {
      requireAttribute("accessibilityRole")
      requireAttribute("accessibilityLabel")
    }
    if (tagName === "FieldInput") requireAttribute("accessibilityLabel")
    if (tagName === "TextInput") requireAttribute("accessibilityLabel")

    function requireAttribute(attributeName) {
      if (!attributes.has(attributeName)) {
        failures.push(`${relativePath}:${position.line + 1} missing ${attributeName}`)
      }
    }
  }
  ts.forEachChild(node, (child) => inspectNode(child, sourceFile, relativePath, failures))
}
