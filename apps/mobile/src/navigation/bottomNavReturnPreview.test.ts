import assert from "node:assert/strict"
import test from "node:test"
import { resolveBottomNavReturnPreview, retainBottomNavReturnPreview, getBottomNavReturnPresentation } from "./bottomNavReturnPreview"

test("all requested nested screens preview the actual previous tab, not an assumed MyRoom", () => {
  for (const [source, target, currentKey] of [
    ["You", "Lobby", "discover"], ["You", "MyRoom", "myroom"],
    ["WardrobeV2", "MyRoom", "myroom"], ["MyRoomEditor", "MyRoom", "myroom"],
    ["Settings", "MyRoom", "myroom"], ["Settings", "CosmeticShop", "shop"]
  ]) {
    const preview = resolveBottomNavReturnPreview({ platform: "ios", closing: true, sourceRouteKey: "source", stack: {
      index: 1, routes: [{ key: "target", name: target! }, { key: "source", name: source! }]
    } })
    assert.deepEqual(preview, { sourceRouteKey: "source", targetRouteKey: "target", targetRouteName: target })
    assert.deepEqual(getBottomNavReturnPresentation(source, "source", preview), { mounted: true, visible: true, currentKey, visualOnly: true })
  }
})
test("nested-to-nested, Android, push, unknown and stale closing events do not reveal a menu", () => {
  const base = { platform: "ios" as const, closing: true, sourceRouteKey: "source", stack: {
    index: 1, routes: [{ key: "target", name: "You" }, { key: "source", name: "Settings" }]
  } }
  assert.equal(resolveBottomNavReturnPreview(base), undefined)
  const tab = { ...base, stack: { ...base.stack, routes: [{ key: "target", name: "Lobby" }, base.stack.routes[1]!] } }
  assert.equal(resolveBottomNavReturnPreview({ ...tab, platform: "android" }), undefined)
  assert.equal(resolveBottomNavReturnPreview({ ...tab, closing: false }), undefined)
  assert.equal(resolveBottomNavReturnPreview({ ...tab, sourceRouteKey: "old" }), undefined)
  assert.equal(resolveBottomNavReturnPreview({ ...tab, stack: undefined }), undefined)
  assert.equal(resolveBottomNavReturnPreview({ ...tab, stack: { index: 0, routes: [tab.stack.routes[1]!] } }), undefined)
})
test("preview remains visual-only until native completion, even if JS has committed the pop", () => {
  const preview = { sourceRouteKey: "source", targetRouteKey: "target", targetRouteName: "Lobby" }
  assert.equal(retainBottomNavReturnPreview(preview, "target"), preview)
  assert.equal(getBottomNavReturnPresentation("Lobby", "target", preview).visualOnly, true)
  assert.equal(getBottomNavReturnPresentation("Lobby", "target", undefined).visualOnly, false)
  assert.equal(getBottomNavReturnPresentation("You", "source", undefined).visible, false)
  assert.equal(retainBottomNavReturnPreview(preview, "unrelated"), undefined)
  assert.equal(getBottomNavReturnPresentation("You", "new-source", preview).visible, false)
})
