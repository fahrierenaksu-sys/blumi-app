import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as Hook from "./useFocusedConversation"

test("room message alert suppression follows focus and unmount without waiting for a thread id", () => {
  const runtime = createFakeReactRuntime()
  let suppressed = false
  const hook = loadSourceWithFakeReact<typeof Hook>("features/notifications/useFocusedConversation.ts", runtime, {
    modules: { "./foregroundNotificationState": {
      registerMessageAlertSuppression: () => {
        suppressed = true
        return () => { suppressed = false }
      }
    } }
  })
  const render = (focused: boolean) => runtime.render(() => hook.useMessageAlertSuppression(focused))
  render(true)
  assert.equal(suppressed, true)
  render(false)
  assert.equal(suppressed, false)
  render(true)
  runtime.unmount()
  assert.equal(suppressed, false)
})

test("a focused chat or MiniRoom marks its conversation on screen only while focused and mounted", () => {
  const runtime = createFakeReactRuntime()
  let onScreen: string | null = null
  const hook = loadSourceWithFakeReact<typeof Hook>("features/notifications/useFocusedConversation.ts", runtime, {
    modules: { "./foregroundNotificationState": {
      registerFocusedConversation: (threadId: string) => {
        onScreen = threadId
        return () => { if (onScreen === threadId) onScreen = null }
      }
    } }
  })
  let input: { threadId: string | undefined; isFocused: boolean } = { threadId: undefined, isFocused: true }
  const render = () => runtime.render(() => hook.useFocusedConversation(input.threadId, input.isFocused))
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
