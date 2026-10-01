import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as ChatStore from "./chatStore"

// Characterizes useChatStore's invalidation: one view object per store
// notification, stable across unrelated re-renders.
function mount() {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel"]
  })
  return { runtime, store }
}

test("the chat store view keeps its identity across re-renders without a store change", () => {
  const { runtime, store } = mount()
  const first = runtime.render(() => store.useChatStore())
  const second = runtime.rerender()
  assert.equal(second, first)
  assert.deepEqual(first.threadListState, { status: "idle" })
})

test("a store notification re-renders with a new view carrying the new state", () => {
  const { runtime, store } = mount()
  const first = runtime.render(() => store.useChatStore())
  const renders = runtime.renderCount
  store.applyChatThreadListLoading()
  const next = runtime.output as ChatStore.ChatStoreView
  assert.equal(runtime.renderCount, renders + 1)
  assert.notEqual(next, first)
  assert.deepEqual(next.threadListState, { status: "loading" })
  runtime.unmount()
  store.applyChatThreadListFailed("We could not refresh your chats yet.")
  assert.equal(runtime.renderCount, renders + 1, "no update after unmount")
})

test("a change made after render but before the subscription is not lost", () => {
  const { runtime, store } = mount()
  const react = runtime.react as { useEffect: (run: () => void, deps: unknown[]) => void }
  runtime.render(() => {
    // Declared first, so it runs before the store subscribes.
    react.useEffect(() => { store.applyChatThreadListLoading() }, [])
    return store.useChatStore()
  })
  assert.deepEqual((runtime.output as ChatStore.ChatStoreView).threadListState, { status: "loading" })
})
