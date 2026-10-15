import assert from "node:assert/strict"
import test from "node:test"
import { isNetworkLinkConnected } from "./networkReachability"

test("a device with a network link counts as online even when the third-party reachability probe fails", () => {
  assert.equal(isNetworkLinkConnected({ isConnected: true, isInternetReachable: false }), true)
})

test("a device with a network link counts as online while the reachability probe is still unknown", () => {
  assert.equal(isNetworkLinkConnected({ isConnected: true, isInternetReachable: null }), true)
})

test("a device without a network link counts as offline", () => {
  assert.equal(isNetworkLinkConnected({ isConnected: false, isInternetReachable: false }), false)
  assert.equal(isNetworkLinkConnected({ isConnected: false, isInternetReachable: null }), false)
})

test("an unknown link state at launch does not show the offline state", () => {
  assert.equal(isNetworkLinkConnected({ isConnected: null, isInternetReachable: null }), true)
})
