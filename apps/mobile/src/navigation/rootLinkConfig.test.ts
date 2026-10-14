import assert from "node:assert/strict"
import test from "node:test"
import { getStateFromPath as defaultGetStateFromPath } from "@react-navigation/core"
import { createPendingDeepLinkStore, type DeepLinkOwner } from "./pendingDeepLink"
import { createSafeGetStateFromPath } from "./rootLinkConfig"

// The root linking config (rootLinking.ts imports react-native, so it is mirrored here).
const ROOT_LINK_SCREENS = {
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

const PREFIX = "blumi://"
const OPTIONS = { screens: ROOT_LINK_SCREENS }
const parse = createSafeGetStateFromPath(defaultGetStateFromPath, ROOT_LINK_SCREENS)
const OWNER: DeepLinkOwner = { userId: "owner-a", sessionId: "session-a" }

/** Mirrors the container: strips the prefix and parses the path. */
function routeFor(url: string) {
  const state = parse(url.slice(PREFIX.length), OPTIONS)
  assert.ok(state, `no state for ${url}`)
  return state.routes[state.routes.length - 1] as { name: string; params?: Record<string, unknown> }
}

const ACTION_KEYS = [
  "roomInviteRequest",
  "roomInviteAccept",
  "pendingLikeUserId",
  "pendingPassUserId",
  "completedProductionDecision",
  "profile",
  "context",
  "partnerId",
  "partnerName",
  "placementItemId",
  "focusProductId",
  "initialShopMode"
]

const ATTACK_URLS = [
  "blumi://chat/thread-1?roomInviteRequest=x",
  "blumi://chat/thread-1?roomInviteAccept=invite-1&partnerName=Eve",
  "blumi://discover?pendingLikeUserId=user-9",
  "blumi://discover?pendingPassUserId=user-9&completedProductionDecision=like",
  "blumi://profile/user-9?context=matched&profile=oops",
  "blumi://room/edit?placementItemId=item-1",
  "blumi://shop?focusProductId=item-1&initialShopMode=home#frag"
]

function assertNoActionParams(url: string): void {
  const route = routeFor(url)
  for (const key of ACTION_KEYS) {
    assert.equal(route.params?.[key], undefined, `${key} leaked from ${url}`)
  }
}

test("cold open: an outside URL query never becomes an in-app command", () => {
  for (const url of ATTACK_URLS) assertNoActionParams(url)
})

test("path params survive as strings and nothing else is kept", () => {
  assert.deepEqual(routeFor("blumi://chat/thread-1?roomInviteRequest=x").params, { threadId: "thread-1" })
  assert.deepEqual(routeFor("blumi://profile/user-9?profile=oops").params, { userId: "user-9" })
  const shop = routeFor("blumi://shop?focusProductId=item-1")
  assert.equal(shop.name, "CosmeticShop")
  assert.equal(shop.params, undefined)
})

test("bad param types are dropped safely", () => {
  const discover = routeFor("blumi://discover?pendingLikeUserId=a&pendingLikeUserId=b")
  assert.equal(discover.params, undefined)
  const profile = routeFor("blumi://profile/user-9?profile[name]=x&profile=%7B%7D")
  assert.deepEqual(profile.params, { userId: "user-9" })
  assert.equal(typeof profile.params?.userId, "string")
})

test("warm open and a repeated pending link replay without command params", () => {
  let ready = false
  let routeNames: readonly string[] | undefined
  const routed: string[] = []
  const store = createPendingDeepLinkStore({
    prefixes: [PREFIX],
    screens: ROOT_LINK_SCREENS,
    now: () => 1_000,
    navigation: { isReady: () => ready, getRouteNames: () => routeNames }
  })
  store.attachListener((url) => routed.push(url))
  // Arrives before Main: kept pending, twice (the second replaces the first).
  store.handleUrl("blumi://chat/thread-1?roomInviteAccept=invite-1")
  store.handleUrl("blumi://chat/thread-1?roomInviteAccept=invite-1")
  ready = true
  routeNames = Object.keys(ROOT_LINK_SCREENS)
  store.updateContext({ sessionEntryRoute: "Main", isAccountRestricted: false, owner: OWNER })
  assert.equal(store.replay(), true)
  assert.equal(store.replay(), false)
  // Warm: a live link while in Main routes immediately.
  store.handleUrl("blumi://discover?pendingLikeUserId=user-9")
  assert.equal(routed.length, 2)
  for (const url of routed) assertNoActionParams(url)
})
