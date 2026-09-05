import assert from "node:assert/strict"
import test from "node:test"
import {
  createLoadedDemoThreadList,
  shouldConnectGlobalRealtime
} from "./realtimeMode"

test("demo mode does not open the production realtime connection", () => {
  assert.equal(shouldConnectGlobalRealtime(true), false)
  assert.equal(shouldConnectGlobalRealtime(false), true)
})

test("demo mode creates a valid loaded empty thread list", () => {
  assert.deepEqual(createLoadedDemoThreadList("demo-user", []), {
    userId: "demo-user",
    threads: []
  })
})
