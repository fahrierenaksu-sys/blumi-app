import assert from "node:assert/strict"
import test from "node:test"
import {
  getShopStatusContent,
  getShopPresentationState,
  shouldRenderShopContent
} from "./shopPresentationModel"

test("shop presentation prioritizes offline and failed states", () => {
  assert.equal(
    getShopPresentationState({
      isProduction: true,
      isConnected: false,
      isReady: true,
      hydrationStatus: "failed",
      productCount: 3
    }),
    "offline"
  )
  assert.equal(
    getShopPresentationState({
      isProduction: true,
      isConnected: true,
      isReady: true,
      hydrationStatus: "failed",
      productCount: 3
    }),
    "error"
  )
})

test("shop presentation exposes loading, empty, and ready states", () => {
  assert.equal(
    getShopPresentationState({
      isProduction: true,
      isConnected: true,
      isReady: false,
      hydrationStatus: "idle",
      productCount: 3
    }),
    "loading"
  )
  assert.equal(
    getShopPresentationState({
      isProduction: true,
      isConnected: true,
      isReady: true,
      hydrationStatus: "loading",
      productCount: 3
    }),
    "loading"
  )
  assert.equal(
    getShopPresentationState({
      isProduction: true,
      isConnected: true,
      isReady: true,
      hydrationStatus: "ready",
      productCount: 0
    }),
    "empty"
  )
  assert.equal(
    getShopPresentationState({
      isProduction: true,
      isConnected: true,
      isReady: true,
      hydrationStatus: "ready",
      productCount: 3
    }),
    "ready"
  )
})

test("demo mode ignores network reachability for local shop state", () => {
  assert.equal(
    getShopPresentationState({
      isProduction: false,
      isConnected: false,
      isReady: false,
      hydrationStatus: "idle",
      productCount: 3
    }),
    "loading"
  )
  assert.equal(
    getShopPresentationState({
      isProduction: false,
      isConnected: false,
      isReady: true,
      hydrationStatus: "ready",
      productCount: 3
    }),
    "ready"
  )
})

test("production keeps cached shop browsing open but makes remote actions read-only offline", () => {
  const state = getShopPresentationState({
    isProduction: true,
    isConnected: false,
    isReady: true,
    hydrationStatus: "ready",
    productCount: 3
  })

  assert.equal(state, "offline")
  assert.equal(
    shouldRenderShopContent({ state, isReady: true, productCount: 3 }),
    true
  )
  assert.equal(
    shouldRenderShopContent({ state, isReady: false, productCount: 3 }),
    false
  )
  assert.equal(
    shouldRenderShopContent({ state, isReady: true, productCount: 0 }),
    false
  )
})

test("an empty shop tab tells the truth and points to what the person owns, never to a retry", () => {
  const avatar = getShopStatusContent({ state: "empty", mode: "avatar", locale: "tr" })
  assert.equal(avatar.testID, "shop-status-empty")
  assert.equal(avatar.title, "Yeni parçalar yolda")
  assert.match(avatar.body, /Dolabında/)
  assert.deepEqual(avatar.action, { kind: "openWardrobe", label: "Dolabıma git", accessibilityLabel: "Dolabını aç" })
  const home = getShopStatusContent({ state: "empty", mode: "home", locale: "tr" })
  assert.equal(home.action?.kind, "openRoom")
  for (const locale of ["tr", "en"] as const) {
    for (const mode of ["avatar", "home"] as const) {
      const empty = getShopStatusContent({ state: "empty", mode, locale })
      assert.notEqual(empty.action?.kind, "retry")
      // An empty tab is not an outage: no "try again" wording.
      assert.doesNotMatch(`${empty.title} ${empty.body}`, /tekrar dene|try again|pause|kısa bir ara/i)
    }
    assert.equal(getShopStatusContent({ state: "error", mode: "avatar", locale }).action?.kind, "retry")
    assert.equal(getShopStatusContent({ state: "offline", mode: "avatar", locale }).action?.kind, "retry")
    assert.equal(getShopStatusContent({ state: "loading", mode: "avatar", locale }).action, undefined)
  }
})
