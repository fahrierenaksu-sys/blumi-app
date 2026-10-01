import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as Hook from "./useMiniRoomMotion"
import type { ServerEvent } from "@blumi/contracts"

test("room motion lifecycle leaves on background/blur and detaches the old account subscriptions", () => {
  const runtime = createFakeReactRuntime()
  const sent: any[] = []
  const events = new Set<(event: ServerEvent) => void>(), statuses = new Set<() => void>(), appListeners = new Set<() => void>()
  let status = "connected"
  const app = { currentState: "active", addEventListener: (_: string, fn: () => void) => {
    appListeners.add(fn); return { remove: () => appListeners.delete(fn) }
  } }
  const hook = loadSourceWithFakeReact<typeof Hook>("features/miniRoom/useMiniRoomMotion.ts", runtime, {
    modules: { "react-native": { AppState: app }, "../realtime/globalRealtimeProvider": {
      getGlobalStatus: () => status, sendGlobal: (event: any) => { sent.push(event); return true },
      subscribeToEvents: (fn: (event: ServerEvent) => void) => { events.add(fn); return () => events.delete(fn) },
      subscribeToStatus: (fn: () => void) => { statuses.add(fn); return () => statuses.delete(fn) }
    } }, real: ["./miniRoomMotionSession"]
  })
  let input = { miniRoomId: "room-a", localUserId: "a", partnerUserId: "b", enabled: true, isFocused: true }
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }; return runtime.render(() => hook.useMiniRoomMotion(input))
  }
  // Unmount even when an assertion fails, so no scene-entry retry timer is left.
  try {
    render()
    assert.equal(sent.at(-1).type, "mini_room.scene_enter")
    // Control Centre, the notification shade or a system prompt make iOS briefly
    // "inactive" while the socket stays open: the partner must not see us leave.
    const beforeInactive = sent.length
    app.currentState = "inactive"; for (const fn of appListeners) fn()
    app.currentState = "active"; for (const fn of appListeners) fn()
    assert.equal(sent.length, beforeInactive)
    app.currentState = "background"; for (const fn of appListeners) fn()
    assert.equal(sent.at(-1).type, "mini_room.scene_exit")
    assert.equal((runtime.output as ReturnType<typeof Hook.useMiniRoomMotion>).onLocalMove({ x: .5, y: .7 }), false)
    app.currentState = "active"; for (const fn of appListeners) fn()
    assert.equal(sent.at(-1).type, "mini_room.scene_enter")
    const oldListener = [...events][0]!
    render({ localUserId: "c", partnerUserId: "d", miniRoomId: "room-b" })
    assert.equal(events.has(oldListener), false)
    assert.equal(sent.at(-1).payload.miniRoomId, "room-b")
    status = "reconnecting"; for (const fn of statuses) fn()
    assert.equal((runtime.output as ReturnType<typeof Hook.useMiniRoomMotion>).partnerPresent, false)
    render({ isFocused: false })
    assert.equal(events.size + statuses.size + appListeners.size, 0)
  } finally {
    runtime.unmount()
  }
})
