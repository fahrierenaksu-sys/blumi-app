import assert from "node:assert/strict"
import test from "node:test"
import {
  MAX_PENDING_DEEP_LINK_URL_LENGTH,
  PENDING_DEEP_LINK_TTL_MS,
  createPendingDeepLinkStore,
  matchDeepLinkUrl,
  type DeepLinkOwner,
  type DeepLinkRouteContext
} from "./pendingDeepLink"

const PREFIXES = ["blumi://"] as const
const SCREENS = {
  Lobby: "discover",
  Inbox: "inbox",
  ChatThread: "chat/:threadId",
  ProfilePreview: "profile/:userId",
  Settings: "settings",
  MyRoom: "room",
  MyRoomEditor: "room/edit",
  WardrobeV2: "wardrobe",
  CosmeticShop: "shop"
} as const
const MAIN_ROUTE_NAMES = ["Lobby", "Inbox", "ChatThread", "ProfilePreview", "Settings", "MyRoom", "MyRoomEditor", "WardrobeV2", "CosmeticShop"]

const OWNER_A: DeepLinkOwner = { userId: "user-a", sessionId: "session-a" }
const OWNER_A_NEXT_SESSION: DeepLinkOwner = { userId: "user-a", sessionId: "session-a2" }
const OWNER_B: DeepLinkOwner = { userId: "user-b", sessionId: "session-b" }

function context(
  sessionEntryRoute: DeepLinkRouteContext["sessionEntryRoute"],
  owner: DeepLinkOwner | null,
  isAccountRestricted = false
): DeepLinkRouteContext {
  return { sessionEntryRoute, owner, isAccountRestricted }
}

function createHarness() {
  let nowMs = 1_000_000
  let ready = false
  let routeNames: readonly string[] | undefined
  const routed: string[] = []
  const store = createPendingDeepLinkStore({
    prefixes: PREFIXES,
    screens: SCREENS,
    now: () => nowMs,
    navigation: {
      isReady: () => ready,
      getRouteNames: () => routeNames
    }
  })
  store.attachListener((url) => routed.push(url))
  return {
    store,
    routed,
    advance: (ms: number) => { nowMs += ms },
    showAuthEntry: () => {
      ready = true
      routeNames = ["AuthEntry", "PreAuthSetup", "Register", "Legal"]
      store.updateContext(context("AuthEntry", null))
    },
    showMain: (owner: DeepLinkOwner, { restricted = false } = {}) => {
      ready = true
      routeNames = restricted ? ["AccountRestriction", "Legal"] : MAIN_ROUTE_NAMES
      store.updateContext(context("Main", owner, restricted))
    }
  }
}

test("deep link paths are validated against the linking config", () => {
  assert.deepEqual(matchDeepLinkUrl("blumi://inbox", PREFIXES, SCREENS), { routeName: "Inbox" })
  assert.deepEqual(matchDeepLinkUrl("blumi://chat/thread-1", PREFIXES, SCREENS), { routeName: "ChatThread" })
  assert.deepEqual(matchDeepLinkUrl("blumi://room/edit", PREFIXES, SCREENS), { routeName: "MyRoomEditor" })
  assert.deepEqual(matchDeepLinkUrl("blumi://room", PREFIXES, SCREENS), { routeName: "MyRoom" })
  assert.deepEqual(matchDeepLinkUrl("blumi://profile/user-9?ref=share#top", PREFIXES, SCREENS), { routeName: "ProfilePreview" })
  assert.deepEqual(matchDeepLinkUrl("blumi://shop/", PREFIXES, SCREENS), { routeName: "CosmeticShop" })
  for (const rejected of [
    "blumi://unknown",
    "blumi://chat",
    "blumi://chat/",
    "blumi://chat/a/b",
    "blumi://room/edit/extra",
    "blumi://",
    "https://blumi.app/inbox",
    "other://inbox",
    `blumi://r/r_${"a".repeat(32)}`,
    `blumi://chat/${"x".repeat(MAX_PENDING_DEEP_LINK_URL_LENGTH)}`
  ]) {
    assert.equal(matchDeepLinkUrl(rejected, PREFIXES, SCREENS), null, rejected)
  }
})

test("a link that arrives before Main is replayed exactly once when the Main stack is ready", () => {
  const harness = createHarness()
  harness.store.updateContext(context("Splash", null))
  assert.equal(harness.store.resolveInitialUrl("blumi://chat/thread-1"), null, "the container must not receive it yet")
  assert.equal(harness.store.replay(), false)
  harness.showAuthEntry()
  assert.equal(harness.store.replay(), false, "never replayed into AuthEntry")
  harness.store.updateContext(context("ProfileSetup", OWNER_A))
  assert.equal(harness.store.replay(), false, "never replayed into onboarding")
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), true)
  assert.equal(harness.store.replay(), false)
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), false)
  assert.deepEqual(harness.routed, ["blumi://chat/thread-1"])
})

test("a live link during onboarding waits for Main of the same session", () => {
  const harness = createHarness()
  harness.store.updateContext(context("AvatarSetup", OWNER_A))
  harness.store.handleUrl("blumi://wardrobe")
  assert.deepEqual(harness.routed, [])
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), true)
  assert.deepEqual(harness.routed, ["blumi://wardrobe"])
})

test("replay waits until the Main stack registers the destination route", () => {
  const harness = createHarness()
  harness.store.updateContext(context("RoomSetup", OWNER_A))
  harness.store.handleUrl("blumi://inbox")
  // Main is selected but the container still holds the onboarding navigator.
  harness.store.updateContext(context("Main", OWNER_A))
  assert.equal(harness.store.replay(), false)
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), true)
  assert.deepEqual(harness.routed, ["blumi://inbox"])
})

test("the latest pending link wins and only one link is kept", () => {
  const harness = createHarness()
  harness.showAuthEntry()
  harness.store.handleUrl("blumi://inbox")
  harness.store.handleUrl("blumi://shop")
  assert.equal(harness.store.peek()?.url, "blumi://shop")
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), true)
  assert.equal(harness.store.replay(), false)
  assert.deepEqual(harness.routed, ["blumi://shop"])
})

test("sign-out discards a pending link", () => {
  const harness = createHarness()
  harness.store.updateContext(context("ProfileSetup", OWNER_A))
  harness.store.handleUrl("blumi://settings")
  harness.showAuthEntry()
  assert.equal(harness.store.peek(), null)
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), false)
  assert.deepEqual(harness.routed, [])
})

test("an account switch or a new session discards a pending link", () => {
  for (const nextOwner of [OWNER_B, OWNER_A_NEXT_SESSION]) {
    const harness = createHarness()
    harness.store.updateContext(context("ProfileSetup", OWNER_A))
    harness.store.handleUrl("blumi://inbox")
    harness.store.updateContext(context("ProfileSetup", nextOwner))
    assert.equal(harness.store.peek(), null)
    harness.showMain(nextOwner)
    assert.equal(harness.store.replay(), false)
    assert.deepEqual(harness.routed, [])
  }
})

test("a link captured before sign-in is claimed by the first signed-in session only", () => {
  const harness = createHarness()
  harness.showAuthEntry()
  harness.store.handleUrl("blumi://room")
  harness.store.updateContext(context("ProfileSetup", OWNER_A))
  assert.deepEqual(harness.store.peek()?.owner, OWNER_A)
  harness.store.updateContext(context("ProfileSetup", OWNER_B))
  assert.equal(harness.store.peek(), null)
})

test("an expired pending link is discarded", () => {
  const harness = createHarness()
  harness.showAuthEntry()
  harness.store.handleUrl("blumi://inbox")
  harness.advance(PENDING_DEEP_LINK_TTL_MS + 1)
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), false)
  assert.equal(harness.store.peek(), null)
  assert.deepEqual(harness.routed, [])
})

test("a link at the TTL boundary is still replayed", () => {
  const harness = createHarness()
  harness.showAuthEntry()
  harness.store.handleUrl("blumi://inbox")
  harness.advance(PENDING_DEEP_LINK_TTL_MS)
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), true)
})

test("unknown or oversized paths are never kept", () => {
  const harness = createHarness()
  harness.showAuthEntry()
  harness.store.handleUrl("blumi://unknown")
  harness.store.handleUrl(`blumi://chat/${"x".repeat(MAX_PENDING_DEEP_LINK_URL_LENGTH)}`)
  assert.equal(harness.store.resolveInitialUrl("blumi://nope/nope"), null)
  assert.equal(harness.store.peek(), null)
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), false)
  assert.deepEqual(harness.routed, [])
})

test("a restricted account never receives a replay until the restriction clears", () => {
  const harness = createHarness()
  harness.store.updateContext(context("ProfileSetup", OWNER_A))
  harness.store.handleUrl("blumi://inbox")
  harness.showMain(OWNER_A, { restricted: true })
  assert.equal(harness.store.replay(), false)
  harness.store.handleUrl("blumi://shop")
  assert.deepEqual(harness.routed, [], "restricted links are not routed immediately either")
  harness.showMain(OWNER_A)
  assert.equal(harness.store.replay(), true)
  assert.deepEqual(harness.routed, ["blumi://shop"])
})

test("a link that arrives in a ready Main stack is routed immediately, unchanged", () => {
  const harness = createHarness()
  harness.showMain(OWNER_A)
  harness.store.handleUrl("blumi://chat/thread-2")
  harness.store.handleUrl("blumi://unknown")
  assert.deepEqual(harness.routed, ["blumi://chat/thread-2", "blumi://unknown"], "Main passes links through as before")
  assert.equal(harness.store.peek(), null)
  assert.equal(harness.store.replay(), false)
})

test("a direct Main link supersedes an older pending link", () => {
  const harness = createHarness()
  harness.store.updateContext(context("Main", OWNER_A))
  // Main is selected but navigation is not ready yet.
  harness.store.handleUrl("blumi://inbox")
  harness.showMain(OWNER_A)
  harness.store.handleUrl("blumi://shop")
  assert.equal(harness.store.replay(), false)
  assert.deepEqual(harness.routed, ["blumi://shop"])
})

test("the initial URL is handed to navigation in Main and consumed only once per process", () => {
  const harness = createHarness()
  harness.store.updateContext(context("Main", OWNER_A))
  assert.equal(harness.store.resolveInitialUrl("blumi://inbox"), "blumi://inbox")
  assert.equal(harness.store.peek(), null)
  // A later container remount (e.g. sign-out then sign-in) sees the same OS
  // initial URL again; it must not navigate a second time.
  assert.equal(harness.store.resolveInitialUrl("blumi://inbox"), null)
  harness.store.updateContext(context("AuthEntry", null))
  assert.equal(harness.store.resolveInitialUrl("blumi://inbox"), null)
  assert.equal(harness.store.peek(), null)
})

test("a replay without an attached navigation listener waits for one", () => {
  let routed: string[] = []
  const store = createPendingDeepLinkStore({
    prefixes: PREFIXES,
    screens: SCREENS,
    now: () => 0,
    navigation: { isReady: () => true, getRouteNames: () => MAIN_ROUTE_NAMES }
  })
  store.updateContext(context("AuthEntry", null))
  store.handleUrl("blumi://inbox")
  store.updateContext(context("Main", OWNER_A))
  assert.equal(store.replay(), false)
  const detach = store.attachListener((url) => { routed = [...routed, url] })
  assert.deepEqual(routed, ["blumi://inbox"], "attaching the container listener replays the pending link")
  detach()
  store.updateContext(context("ProfileSetup", OWNER_A))
  store.handleUrl("blumi://shop")
  store.updateContext(context("Main", OWNER_A))
  assert.equal(store.replay(), false, "a detached listener is never called")
  assert.deepEqual(routed, ["blumi://inbox"])
})
