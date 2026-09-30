import assert from "node:assert/strict"
import test from "node:test"
import {
  applyRealtimeAppLifecycle,
  resolveRealtimeAppLifecycle
} from "./realtimeAppLifecycle"

test("only a real background suspends the socket; transient inactivity just pauses retries", () => {
  assert.equal(resolveRealtimeAppLifecycle("active"), "foreground")
  assert.equal(resolveRealtimeAppLifecycle("background"), "suspended")
  // Control Centre, notification shade, app switcher, system prompts.
  assert.equal(resolveRealtimeAppLifecycle("inactive"), "paused")
  assert.equal(resolveRealtimeAppLifecycle("unknown"), "paused")
  assert.equal(resolveRealtimeAppLifecycle("extension"), "paused")
})

test("the lifecycle drives the client without reconnecting twice", () => {
  const calls: string[] = []
  const client = {
    setAppActive: (isActive: boolean) => { calls.push(`active:${isActive}`) },
    suspend: () => { calls.push("suspend") }
  }
  applyRealtimeAppLifecycle(client, "paused")
  applyRealtimeAppLifecycle(client, "suspended")
  applyRealtimeAppLifecycle(client, "foreground")
  assert.deepEqual(calls, ["active:false", "suspend", "active:true"])
})
