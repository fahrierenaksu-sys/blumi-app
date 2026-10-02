import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useRequestedRoomInvite"

// "Invite to room" on a match's profile returns to the chat with a one-shot
// route param; the chat runs its own invite action once and clears the param.
function mount() {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useRequestedRoomInvite.ts", runtime)
  const events: string[] = []
  let input = {
    request: undefined as string | undefined,
    isFocused: true,
    onInvite: () => { events.push("invite") },
    clearRequest: () => { events.push("clear") }
  }
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }
    runtime.render(() => hook.useRequestedRoomInvite(input))
  }
  render()
  return { render, events }
}

test("a chat without a request never sends an invite", () => {
  const f = mount()
  f.render()
  assert.deepEqual(f.events, [])
})

test("a request runs the chat's invite action exactly once and clears the param", () => {
  const f = mount()
  f.render({ request: "r1" })
  assert.deepEqual(f.events, ["clear", "invite"])
  f.render({ request: "r1" })
  f.render()
  assert.deepEqual(f.events, ["clear", "invite"])
  f.render({ request: "r2" })
  assert.deepEqual(f.events, ["clear", "invite", "clear", "invite"])
})

test("a request waits until the chat is focused (after the profile pops away)", () => {
  const f = mount()
  f.render({ request: "r1", isFocused: false })
  assert.deepEqual(f.events, [])
  f.render({ isFocused: true })
  assert.deepEqual(f.events, ["clear", "invite"])
})
