import assert from "node:assert/strict"
import test from "node:test"
import {
  clearRootNavigationChromeReturnPreview,
  getRootNavigationChromeSnapshot,
  publishRootNavigationChromeEditorPreview,
  publishRootNavigationChrome,
  publishRootNavigationChromeReturnPreview,
  settleRootNavigationChromeReturnPreview,
  subscribeToRootNavigationChrome
} from "./rootNavigationChromeStore"
import { retainBottomNavReturnPreview, getBottomNavReturnPresentation } from "./bottomNavReturnPreview"

test("navigation route updates notify the chrome subscriber without changing stable snapshots", () => {
  publishRootNavigationChrome({})
  let notifications = 0
  const unsubscribe = subscribeToRootNavigationChrome(() => {
    notifications += 1
  })

  assert.equal(publishRootNavigationChrome({ navigatorKey: "main:user_1", routeName: "Lobby", routeKey: "Lobby-1" }), true)
  const lobbySnapshot = getRootNavigationChromeSnapshot()
  assert.deepEqual(lobbySnapshot, {
    navigatorKey: "main:user_1",
    routeName: "Lobby",
    routeKey: "Lobby-1",
    shopMode: undefined,
    previewEditorRouteKey: undefined,
    returnPreview: undefined
  })
  assert.equal(publishRootNavigationChrome({ navigatorKey: "main:user_1", routeName: "Lobby", routeKey: "Lobby-1" }), false)
  assert.strictEqual(getRootNavigationChromeSnapshot(), lobbySnapshot)
  assert.equal(publishRootNavigationChrome({ routeName: "CosmeticShop", routeKey: "Shop-1", shopMode: "avatar" }), true)
  assert.equal(notifications, 2)
  assert.equal(publishRootNavigationChrome({ navigatorKey: "main:user_2", routeName: "Lobby", routeKey: "Lobby-1" }), true)
  assert.equal(getRootNavigationChromeSnapshot().navigatorKey, "main:user_2")
  assert.equal(notifications, 3)
  assert.equal(publishRootNavigationChromeEditorPreview("main:user_1", "editor-old"), false)
  assert.equal(publishRootNavigationChromeEditorPreview("main:user_2", "editor-2"), true)
  assert.equal(getRootNavigationChromeSnapshot().previewEditorRouteKey, "editor-2")
  assert.equal(notifications, 4)

  unsubscribe()
  publishRootNavigationChrome({})
  assert.equal(notifications, 4)
})

test("completed and cancelled interactive pops, both native/JS orders, leave no late-menu gap", () => {
  const navigatorKey = "main:return-user"
  const preview = { sourceRouteKey: "source", targetRouteKey: "target", targetRouteName: "Lobby" }
  const start = () => {
    publishRootNavigationChrome({ navigatorKey, routeName: "You", routeKey: "source" })
    assert.equal(publishRootNavigationChromeReturnPreview(navigatorKey, preview), true)
  }
  start()
  assert.equal(getBottomNavReturnPresentation("You", "source", getRootNavigationChromeSnapshot().returnPreview).visualOnly, true)
  assert.equal(clearRootNavigationChromeReturnPreview("main:old-user", "source"), false)
  assert.equal(clearRootNavigationChromeReturnPreview(navigatorKey, "old-source"), false)
  assert.equal(clearRootNavigationChromeReturnPreview(navigatorKey, "source"), true)
  assert.equal(getBottomNavReturnPresentation("You", "source", getRootNavigationChromeSnapshot().returnPreview).visible, false)

  start()
  assert.equal(settleRootNavigationChromeReturnPreview(navigatorKey, "source", true), true)
  let snapshot = getRootNavigationChromeSnapshot()
  assert.equal(snapshot.returnPreview?.completed, true)
  assert.equal(getBottomNavReturnPresentation("You", "source", snapshot.returnPreview).visible, true)
  publishRootNavigationChrome({ ...snapshot, routeKey: "target", routeName: "Lobby", returnPreview: retainBottomNavReturnPreview(snapshot.returnPreview, "target") })
  assert.equal(getRootNavigationChromeSnapshot().returnPreview, undefined)
  assert.equal(getBottomNavReturnPresentation("Lobby", "target", undefined).visualOnly, false)

  start()
  snapshot = getRootNavigationChromeSnapshot()
  publishRootNavigationChrome({ ...snapshot, routeKey: "target", routeName: "Lobby", returnPreview: retainBottomNavReturnPreview(snapshot.returnPreview, "target") })
  assert.equal(getBottomNavReturnPresentation("Lobby", "target", getRootNavigationChromeSnapshot().returnPreview).visualOnly, true)
  assert.equal(settleRootNavigationChromeReturnPreview(navigatorKey, "target", false), true)
  assert.equal(getRootNavigationChromeSnapshot().returnPreview, undefined)
  assert.equal(getBottomNavReturnPresentation("Lobby", "target", undefined).visible, true)
})

test("source reappearance cancels a preview; stale account events cannot affect a new navigator", () => {
  publishRootNavigationChrome({ navigatorKey: "main:one", routeName: "WardrobeV2", routeKey: "wardrobe" })
  publishRootNavigationChromeReturnPreview("main:one", { sourceRouteKey: "wardrobe", targetRouteKey: "room", targetRouteName: "MyRoom" })
  assert.equal(settleRootNavigationChromeReturnPreview("main:one", "wardrobe", false), true)
  assert.equal(getRootNavigationChromeSnapshot().returnPreview, undefined)
  publishRootNavigationChrome({ navigatorKey: "main:two", routeName: "Lobby", routeKey: "new-lobby" })
  assert.equal(publishRootNavigationChromeReturnPreview("main:one", { sourceRouteKey: "wardrobe", targetRouteKey: "room", targetRouteName: "MyRoom" }), false)
  assert.equal(settleRootNavigationChromeReturnPreview("main:one", "wardrobe", true), false)
})
