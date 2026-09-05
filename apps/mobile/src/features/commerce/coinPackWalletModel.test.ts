import assert from "node:assert/strict"
import test from "node:test"
import { getCoinPackWalletState } from "./coinPackWalletModel"

test("coin pack wallet is unavailable without a configured native provider", () => {
  assert.deepEqual(
    getCoinPackWalletState({ isConnected: true, providerAvailable: false, phase: "idle" }),
    { kind: "unavailable", canPurchase: false }
  )
})

test("offline wallet allows no purchase while keeping the Shop itself browseable", () => {
  assert.deepEqual(
    getCoinPackWalletState({ isConnected: false, providerAvailable: true, phase: "idle" }),
    { kind: "offline", canPurchase: false }
  )
})

test("processing and pending states do not expose another purchase action", () => {
  assert.deepEqual(
    getCoinPackWalletState({ isConnected: true, providerAvailable: true, phase: "processing" }),
    { kind: "processing", canPurchase: false }
  )
  assert.deepEqual(
    getCoinPackWalletState({ isConnected: true, providerAvailable: true, phase: "pending" }),
    { kind: "pending", canPurchase: false }
  )
})

test("configured online wallet permits only a server-reconciled purchase attempt", () => {
  assert.deepEqual(
    getCoinPackWalletState({ isConnected: true, providerAvailable: true, phase: "idle" }),
    { kind: "ready", canPurchase: true }
  )
})
