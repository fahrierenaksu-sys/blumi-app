import assert from "node:assert/strict"
import test from "node:test"
import {
  createPostMatchChatNavigationState,
  getBottomNavKeyForRoute,
  getBottomNavRoutePresentation,
  shouldClearMyRoomNavPreviewOnRouteChange,
  shouldClearMyRoomNavPreviewOnTransitionEnd,
  shouldRevealMyRoomNavDuringClosing,
  shouldShowMyRoomNavPreview,
  getChatLocale,
  getLobbyReturnStrategy,
  getReducedMotionScreenOptions,
  getOnboardingEntryRoute,
  goBackFromInbox,
  MAIN_TAB_SCREEN_OPTIONS,
  shouldDispatchMainTabNavigation,
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
  assert.deepEqual(createPostMatchChatNavigationState({
    partnerId: "user_b",
    partnerName: "B"
  }), {
    index: 1,
    routes: [
      { name: "Inbox" },
      { name: "ChatThread", params: { partnerId: "user_b", partnerName: "B" } }
    ]
  })
})

test("root routes use a stable fade transition by default", () => {
  assert.deepEqual(ROOT_STACK_SCREEN_OPTIONS, {
    headerShown: false,
    animation: "fade",
    animationDuration: 240
  })
})

test("main tabs switch without a full-screen fade or freezing the previous screen", () => {
  assert.deepEqual(MAIN_TAB_SCREEN_OPTIONS, {
    headerShown: false,
    animation: "none",
    gestureEnabled: false
  })
})

test("reselecting the focused main tab skips a redundant navigation action", () => {
  assert.equal(shouldDispatchMainTabNavigation("Lobby", "Lobby"), false)
  assert.equal(shouldDispatchMainTabNavigation("MyRoom", "MyRoom"), false)
  assert.equal(shouldDispatchMainTabNavigation("Lobby", "Inbox"), true)
  assert.equal(shouldDispatchMainTabNavigation(undefined, "Lobby"), true)
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

test("bottom navigation stays mounted across nested main routes and hides outside main tabs", () => {
  assert.deepEqual(getBottomNavRoutePresentation("MyRoom"), {
    mounted: true,
    visible: true,
    currentKey: "myroom"
  })
  assert.deepEqual(getBottomNavRoutePresentation("MyRoomEditor"), {
    mounted: true,
    visible: false,
    currentKey: null
  })
  assert.deepEqual(getBottomNavRoutePresentation("WardrobeV2"), {
    mounted: true,
    visible: false,
    currentKey: null
  })
  assert.deepEqual(getBottomNavRoutePresentation("CosmeticShop"), {
    mounted: true,
    visible: true,
    currentKey: "shop"
  })
  for (const route of ["You", "Settings", "ProfileEdit", "ChatThread", "RoomSetup"]) {
    assert.deepEqual(getBottomNavRoutePresentation(route), {
      mounted: true,
      visible: false,
      currentKey: null
    }, `${route} keeps the main navigator's animated state alive but hidden`)
  }
  assert.deepEqual(getBottomNavRoutePresentation(undefined), {
    mounted: false,
    visible: false,
    currentKey: null
  })
})

test("only a closing top MyRoomEditor over MyRoom may preview the returning nav", () => {
  const stack = {
    index: 1,
    routes: [
      { key: "room-1", name: "MyRoom" },
      { key: "editor-1", name: "MyRoomEditor" }
    ]
  }
  const input = {
    platform: "ios" as const,
    currentRouteName: "MyRoomEditor",
    editorRouteKey: "editor-1",
    closing: true,
    reduceMotion: false,
    stack
  }
  assert.equal(shouldRevealMyRoomNavDuringClosing(input), true)
  assert.deepEqual(getBottomNavRoutePresentation("MyRoomEditor", true), {
    mounted: true,
    visible: true,
    currentKey: "myroom"
  })
  assert.equal(shouldRevealMyRoomNavDuringClosing({ ...input, closing: false }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({ ...input, platform: "android" }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({ ...input, reduceMotion: true }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({ ...input, editorRouteKey: "stale-editor" }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({ ...input, currentRouteName: "WardrobeV2" }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({ ...input, stack: { ...stack, index: 0 } }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({
    ...input,
    stack: { index: 1, routes: [stack.routes[0]!, { key: "editor-1", name: "ChatThread" }] }
  }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({
    ...input,
    stack: { index: 1, routes: [{ key: "chat", name: "ChatThread" }, stack.routes[1]!] }
  }), false)
  assert.equal(shouldRevealMyRoomNavDuringClosing({
    ...input,
    stack: { index: 1, routes: [{ key: "shop", name: "CosmeticShop" }, stack.routes[1]!] }
  }), false)
})

test("iOS canceled editor swipe clears preview on gesture cancel or reappearance", () => {
  assert.equal(shouldClearMyRoomNavPreviewOnTransitionEnd({
    closing: false,
    editorRouteKey: "editor-1",
    previewedEditorRouteKey: "editor-1",
    currentRouteKey: "editor-1"
  }), true)
  assert.deepEqual(getBottomNavRoutePresentation("MyRoomEditor", false), {
    mounted: true,
    visible: false,
    currentKey: null
  })
})

test("successful pop keeps preview until route state changes, then clears it", () => {
  const transition = {
    closing: true,
    editorRouteKey: "editor-1",
    previewedEditorRouteKey: "editor-1"
  }
  assert.equal(shouldClearMyRoomNavPreviewOnTransitionEnd({
    ...transition,
    currentRouteKey: "editor-1"
  }), false)
  assert.equal(shouldClearMyRoomNavPreviewOnTransitionEnd({
    ...transition,
    currentRouteKey: "room-1"
  }), true)
  assert.equal(shouldClearMyRoomNavPreviewOnTransitionEnd({
    ...transition,
    currentRouteKey: undefined
  }), false)
  assert.equal(shouldClearMyRoomNavPreviewOnRouteChange({
    routeName: "MyRoom",
    routeKey: "room-1",
    previewedEditorRouteKey: "editor-1"
  }), true)
  assert.deepEqual(getBottomNavRoutePresentation("MyRoom"), {
    mounted: true,
    visible: true,
    currentKey: "myroom"
  })
})

test("editor preview cleanup ignores unrelated listeners and resets on a new editor key", () => {
  assert.equal(shouldClearMyRoomNavPreviewOnTransitionEnd({
    closing: false,
    editorRouteKey: "old-editor",
    previewedEditorRouteKey: "new-editor",
    currentRouteKey: "new-editor"
  }), false)
  assert.equal(shouldClearMyRoomNavPreviewOnRouteChange({
    routeName: "MyRoomEditor",
    routeKey: "new-editor",
    previewedEditorRouteKey: "old-editor"
  }), true)
  assert.equal(shouldClearMyRoomNavPreviewOnRouteChange({
    routeName: "MyRoomEditor",
    routeKey: "editor-1",
    previewedEditorRouteKey: "editor-1"
  }), false)
  assert.equal(shouldClearMyRoomNavPreviewOnRouteChange({
    routeName: undefined,
    routeKey: undefined,
    previewedEditorRouteKey: "editor-1"
  }), false)
})

test("MyRoom nav preview is visible only for the exact editor route being closed", () => {
  assert.equal(shouldShowMyRoomNavPreview({
    routeName: "MyRoomEditor",
    routeKey: "editor-current",
    previewedEditorRouteKey: "editor-current"
  }), true)
  assert.equal(shouldShowMyRoomNavPreview({
    routeName: "MyRoomEditor",
    routeKey: "editor-new",
    previewedEditorRouteKey: "editor-old"
  }), false)
  assert.equal(shouldShowMyRoomNavPreview({
    routeName: "MyRoom",
    routeKey: "room-current",
    previewedEditorRouteKey: "editor-current"
  }), false)
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
