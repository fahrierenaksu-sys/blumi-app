import assert from "node:assert/strict"
import test from "node:test"
import {
  createPostMatchChatNavigationState,
  getBottomNavKeyForRoute,
  getChatLocale,
  getLobbyReturnStrategy,
  getReducedMotionScreenOptions,
  getOnboardingEntryRoute,
  goBackFromInbox,
  MAIN_TAB_SCREEN_OPTIONS,
  ROOT_STACK_SCREEN_OPTIONS
} from "./rootNavigationModel"

test("Inbox opened as the root returns to discovery without dispatching GO_BACK", () => {
  const actions: string[] = []
  goBackFromInbox({
    canGoBack: () => false,
    goBack: () => actions.push("GO_BACK"),
    replace: (route) => actions.push(`REPLACE:${route}`)
  })
  assert.deepEqual(actions, ["REPLACE:Lobby"])
})

test("Inbox preserves real navigation history when going back", () => {
  const actions: string[] = []
  goBackFromInbox({
    canGoBack: () => true,
    goBack: () => actions.push("GO_BACK"),
    replace: (route) => actions.push(`REPLACE:${route}`)
  })
  assert.deepEqual(actions, ["GO_BACK"])
})

test("opening a match chat leaves Inbox under the conversation, not the match screen", () => {
  assert.deepEqual(createPostMatchChatNavigationState({ threadId: "thread_1" }), {
    index: 1,
    routes: [
      { name: "Inbox" },
      { name: "ChatThread", params: { threadId: "thread_1" } }
    ]
  })
})

test("root routes use a stable fade transition by default", () => {
  assert.deepEqual(ROOT_STACK_SCREEN_OPTIONS, {
    headerShown: false,
    animation: "fade"
  })
})

test("main tabs use a stable fade transition instead of the stack slide", () => {
  assert.deepEqual(MAIN_TAB_SCREEN_OPTIONS, {
    headerShown: false,
    animation: "fade",
    gestureEnabled: false
  })
})

test("root and tab transitions stop when the system requests reduced motion", () => {
  assert.deepEqual(getReducedMotionScreenOptions(true), { animation: "none" })
  assert.deepEqual(getReducedMotionScreenOptions(false), {})
})

test("bottom navigation maps only product-owned main routes", () => {
  assert.equal(getBottomNavKeyForRoute("Lobby"), "discover")
  assert.equal(getBottomNavKeyForRoute("Inbox"), "chats")
  assert.equal(getBottomNavKeyForRoute("MyRoom"), "myroom")
  assert.equal(getBottomNavKeyForRoute("CosmeticShop"), "shop")
  assert.equal(getBottomNavKeyForRoute("Settings"), null)
  assert.equal(getBottomNavKeyForRoute(undefined), null)
})

test("onboarding entry is bounded to the three resumable setup routes", () => {
  assert.equal(getOnboardingEntryRoute("ProfileSetup"), "ProfileSetup")
  assert.equal(getOnboardingEntryRoute("AvatarSetup"), "AvatarSetup")
  assert.equal(getOnboardingEntryRoute("RoomSetup"), "RoomSetup")
  assert.equal(getOnboardingEntryRoute("Main"), null)
  assert.equal(getOnboardingEntryRoute("Splash"), null)
})

test("chat locale collapses platform locale variants to the supported contract", () => {
  assert.equal(getChatLocale("tr-TR"), "tr")
  assert.equal(getChatLocale("tr"), "tr")
  assert.equal(getChatLocale("en-US"), "en")
  assert.equal(getChatLocale("de-DE"), "en")
  assert.equal(getChatLocale(undefined), "en")
})

test("profile preview returns with popTo only when Lobby already exists in the stack", () => {
  assert.equal(
    getLobbyReturnStrategy(["Lobby", "ProfilePreview"]),
    "popTo"
  )
  assert.equal(
    getLobbyReturnStrategy(["ProfilePreview"]),
    "replace"
  )
  assert.equal(
    getLobbyReturnStrategy(["Welcome", "LinkedProfile", "ProfilePreview"]),
    "replace"
  )
})
