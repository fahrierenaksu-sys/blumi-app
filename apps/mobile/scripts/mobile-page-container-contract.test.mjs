import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sourceRoot = new URL("../src/", import.meta.url)

const directPageScreens = [
  "screens/AccountRestrictionScreen.tsx",
  "screens/AuthEntryScreen.tsx",
  "screens/ChatThreadScreen.tsx",
  "screens/CosmeticShopScreen.tsx",
  "screens/HomeStudioScreen.tsx",
  "screens/InboxScreen.tsx",
  "screens/LegalScreen.tsx",
  "screens/LobbyScreen.tsx",
  "screens/MatchResultScreen.tsx",
  "screens/MyRoomEditorScreen.tsx",
  "screens/MyRoomScreen.tsx",
  "screens/ProfileEditScreen.tsx",
  "screens/ProfilePreviewScreen.tsx",
  "screens/RegisterScreen.tsx",
  "screens/RoomDebriefScreen.tsx",
  "screens/SettingsScreen.tsx",
  "screens/WardrobeV2Screen.tsx",
  "screens/WelcomeScreen.tsx",
  "screens/YouScreen.tsx"
]

const delegatedPageScreens = new Map([
  ["screens/AvatarSetupScreen.tsx", "BlumiSetupShell"],
  ["screens/ProfileSetupScreen.tsx", "BlumiSetupShell"],
  ["screens/RoomSetupScreen.tsx", "BlumiSetupShell"],
  ["screens/MiniRoomScreen.tsx", "MiniRoomScene"],
  ["screens/MiniRoomRigPreviewScreen.tsx", "MiniRoomScene"],
  ["screens/PreAuthSetupFlowScreen.tsx", "ProfileSetupScreen"]
])

const regularContentPages = [
  "screens/InboxScreen.tsx",
  "screens/LegalScreen.tsx",
  "screens/MatchResultScreen.tsx",
  "screens/ProfileEditScreen.tsx",
  "screens/RoomDebriefScreen.tsx",
  "screens/SettingsScreen.tsx",
  "screens/WelcomeScreen.tsx",
  "screens/YouScreen.tsx"
]

test("every routed page uses the canonical safe-area container or an approved shell", async () => {
  for (const relativePath of directPageScreens) {
    const source = await readFile(new URL(relativePath, sourceRoot), "utf8")
    assert.match(
      source,
      /PageSafeArea as SafeAreaView/,
      `${relativePath} must use PageSafeArea`
    )
  }

  for (const [relativePath, shell] of delegatedPageScreens) {
    const source = await readFile(new URL(relativePath, sourceRoot), "utf8")
    assert.match(source, new RegExp(`\\b${shell}\\b`), `${relativePath} must delegate to ${shell}`)
  }
})

test("regular content pages opt into the adaptive Apple-style content gutter", async () => {
  for (const relativePath of regularContentPages) {
    const source = await readFile(new URL(relativePath, sourceRoot), "utf8")
    assert.match(source, /<SafeAreaView\s+(?:\n\s*)?contentGutter\b/)
  }
})

test("page and shared shell code never imports React Native's deprecated SafeAreaView", async () => {
  const files = [
    ...directPageScreens,
    "features/session/setupFlow/BlumiSetupShell.tsx",
    "features/miniRoom/scene/MiniRoomScene.tsx"
  ]

  for (const relativePath of files) {
    const source = await readFile(new URL(relativePath, sourceRoot), "utf8")
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*["']react-native["']/s,
      `${relativePath} must not import SafeAreaView from react-native`
    )
  }
})

test("every canonical safe-area boundary declares its gutter policy explicitly", async () => {
  const files = [
    ...directPageScreens,
    "features/session/setupFlow/BlumiSetupShell.tsx",
    "features/miniRoom/scene/MiniRoomScene.tsx"
  ]

  for (const relativePath of files) {
    const source = await readFile(new URL(relativePath, sourceRoot), "utf8")
    const openings = source.match(/<SafeAreaView\b[^>]*>/gs) ?? []
    for (const opening of openings) {
      assert.match(
        opening,
        /\bcontentGutter(?:=|\s|>)/,
        `${relativePath} must explicitly choose its gutter policy`
      )
    }
  }
})

test("the app seeds safe-area metrics on first render to avoid an inset jump", async () => {
  const source = await readFile(new URL("../App.tsx", import.meta.url), "utf8")
  assert.match(source, /initialMetrics=\{initialWindowMetrics\}/)
})
