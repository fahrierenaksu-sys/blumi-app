import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as Hook from "./useRoomConversationOnScreen"

test("a focused MiniRoom marks its conversation on screen only while focused and mounted", () => {
  const runtime = createFakeReactRuntime()
  let onScreen: string | null = null
  const hook = loadSourceWithFakeReact<typeof Hook>("features/miniRoom/useRoomConversationOnScreen.ts", runtime, {
    modules: { "../chat/chatStore": {
      showConversationInRoom: (threadId: string) => {
        onScreen = threadId
        return () => { if (onScreen === threadId) onScreen = null }
      }
    } }
  })
  let input: { threadId: string | undefined; isFocused: boolean } = { threadId: undefined, isFocused: true }
  const render = () => runtime.render(() => hook.useRoomConversationOnScreen(input.threadId, input.isFocused))
  render()
  assert.equal(onScreen, null, "no thread resolved yet")
  input = { threadId: "thread-a", isFocused: true }; render()
  assert.equal(onScreen, "thread-a")
  input = { threadId: "thread-a", isFocused: false }; render()
  assert.equal(onScreen, null, "a covered room (for example the chat pushed above it) is not on screen")
  input = { threadId: "thread-a", isFocused: true }; render()
  runtime.unmount()
  assert.equal(onScreen, null)
})
