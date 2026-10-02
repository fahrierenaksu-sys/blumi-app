import assert from "node:assert/strict"
import test from "node:test"
import {
  createPostMatchChatNavigationState,
  getBottomNavKeyForRoute,
  getBottomNavRoutePresentation,
  getChatLocale,
  getLobbyReturnStrategy,
  getReducedMotionScreenOptions,
  getOnboardingEntryRoute,
  getChatThreadScreenOptions,
  getDetailScreenOptions,
  getStudioScreenOptions,
  CHAT_THREAD_SCREEN_OPTIONS,
  DETAIL_SCREEN_OPTIONS,
  MAIN_TAB_SCREEN_OPTIONS,
  shouldDispatchMainTabNavigation,
  ROOT_STACK_SCREEN_OPTIONS
} from "./rootNavigationModel"

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

test("detail screens open with the platform push so the edge swipe-back closes the same way", () => {
  assert.deepEqual(DETAIL_SCREEN_OPTIONS, { headerShown: false, animation: "default" })
  assert.deepEqual(getDetailScreenOptions(false), { headerShown: false, animation: "default" })
  assert.deepEqual(getDetailScreenOptions(true), { headerShown: false, animation: "none" })
  // Detail screens keep the edge-only swipe: MyRoomEditor drags objects across the canvas.
  assert.equal("fullScreenGestureEnabled" in getDetailScreenOptions(false), false)
  // The stack default stays a fade for onboarding and room entry screens.
  assert.equal(ROOT_STACK_SCREEN_OPTIONS.animation, "fade")
})

test("the avatar wardrobe and the room editor open and close with the soft fade, never the side slide", () => {
  const options = getStudioScreenOptions(false)
  assert.equal(options.headerShown, false)
  assert.equal(options.animation, "fade")
  assert.equal(options.animation, ROOT_STACK_SCREEN_OPTIONS.animation)
  assert.equal(options.animationDuration, ROOT_STACK_SCREEN_OPTIONS.animationDuration)
  // The iOS edge swipe-back plays the same fade instead of the native slide.
  assert.equal(options.animationMatchesGesture, true)
  // The editor drags furniture, so only the edge swipe may close it.
  assert.equal("fullScreenGestureEnabled" in options, false)
})

test("Reduce Motion: the avatar wardrobe and the room editor appear and leave without a transition", () => {
  const options = getStudioScreenOptions(true)
  assert.equal(options.animation, "none")
  assert.equal(options.headerShown, false)
})

test("faded routes close with the same fade when swiped back", () => {
  assert.equal(ROOT_STACK_SCREEN_OPTIONS.animation, "fade")
  assert.equal(ROOT_STACK_SCREEN_OPTIONS.animationMatchesGesture, true)
})

test("only the chat thread closes with a full-screen swipe, with or without motion", () => {
  // iOS runs the full-screen swipe as a simple push, so the thread opens with it too.
  assert.deepEqual(CHAT_THREAD_SCREEN_OPTIONS, {
    headerShown: false,
    animation: "simple_push",
    fullScreenGestureEnabled: true
  })
  assert.deepEqual(getChatThreadScreenOptions(false), CHAT_THREAD_SCREEN_OPTIONS)
  assert.deepEqual(getChatThreadScreenOptions(true), {
    headerShown: false,
    animation: "none",
    fullScreenGestureEnabled: true
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
