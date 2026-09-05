import assert from "node:assert/strict"
import test from "node:test"
import {
  getShopPresentationState,
  getShopInteractionPolicy,
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
  assert.deepEqual(
    getShopInteractionPolicy({ state, isProduction: true }),
    {
      isReadOnly: true,
      disabledReason: "Reconnect to unlock, equip, place, or buy coin packs."
    }
  )
  assert.deepEqual(
    getShopInteractionPolicy({ state: "ready", isProduction: true }),
    { isReadOnly: false }
  )
  assert.deepEqual(
    getShopInteractionPolicy({ state, isProduction: false }),
    { isReadOnly: false }
  )
})
