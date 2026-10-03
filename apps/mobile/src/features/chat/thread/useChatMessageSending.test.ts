import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useChatMessageSending"

function setup() {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useChatMessageSending.ts", runtime, {
    modules: { "../../../analytics/productAnalytics": { captureProductEvent() {} }, "../../../ui/haptics": { hapticSelection() {} } },
    real: ["./chatThreadModel", "../chatHistoryPolicy"]
  })
  const requests: { threadId: string; before?: string; limit?: number }[] = []
  let finish: () => void = () => undefined
  let fail: (error: Error) => void = () => undefined
  let reveals = 0
  let page: readonly string[] | undefined = ["older"]
  const input: Parameters<typeof hook.useChatMessageSending>[0] = {
    currentUserId: "me", resolvedThreadId: "current-thread", sessionMode: "production",
    messages: [{ messageId: "cached-oldest" }] as ChatMessage[], oldestVisibleMessageId: "shown-oldest",
    getHistoryPageMessageIds: () => page,
    requestMessages(threadId, options) {
      requests.push({ threadId, ...options })
      return new Promise<void>((resolve, reject) => { finish = resolve; fail = reject })
    },
    onEarlierLoaded() { reveals += 1 }, sendChatMessage: undefined,
    addOptimisticMessage: () => { throw new Error("unexpected send") },
    getRetryableMessage: () => null, markOptimisticMessageSending: () => undefined
  }
  runtime.render(() => hook.useChatMessageSending(input))
  return { runtime, input, requests, finish: () => finish(), fail: () => fail(new Error("offline")),
    current: () => runtime.output as ReturnType<typeof hook.useChatMessageSending>, reveals: () => reveals,
    setPage: (ids: readonly string[] | undefined) => { page = ids } }
}

test("earlier history starts at the shown boundary, blocks racing taps and reveals only after success", async () => {
  const s = setup()
  const press = s.current().handleLoadEarlier
  const pending = press()
  await press()
  assert.deepEqual(s.requests, [{ threadId: "current-thread", before: "shown-oldest", limit: 20 }])
  assert.equal(s.current().isLoadingEarlier, true)
  assert.equal(s.reveals(), 0)
  s.finish()
  await pending
  assert.equal(s.reveals(), 1)
  assert.equal(s.current().isLoadingEarlier, false)
  s.runtime.unmount()
})

test("a failed page preserves the shown window and permits retry; no cursor makes no request", async () => {
  const s = setup()
  const pending = s.current().handleLoadEarlier()
  s.fail()
  await pending
  assert.equal(s.reveals(), 0)
  assert.equal(s.current().isLoadingEarlier, false)
  const retry = s.current().handleLoadEarlier()
  s.finish()
  await retry
  assert.equal(s.reveals(), 1)
  s.input.oldestVisibleMessageId = null
  s.runtime.rerender()
  const before = s.requests.length
  await s.current().handleLoadEarlier()
  assert.equal(s.requests.length, before)
  s.runtime.unmount()
})

test("a late page from the previous conversation cannot expand the current conversation", async () => {
  const s = setup()
  const oldPage = s.current().handleLoadEarlier()
  s.input.resolvedThreadId = "next-thread"
  s.input.currentUserId = "next-account"
  s.runtime.rerender()
  s.finish()
  await oldPage
  assert.equal(s.reveals(), 0)
  s.runtime.unmount()
})

test("an invitation-only window reveals cached rows without a message API cursor", async () => {
  const s = setup()
  s.input.oldestVisibleMessageId = null
  s.input.hasOlderCachedRows = true
  s.runtime.rerender()
  await s.current().handleLoadEarlier()
  assert.equal(s.reveals(), 1)
  assert.equal(s.requests.length, 0)
  s.input.hasOlderCachedRows = false
  s.runtime.rerender()
  await s.current().handleLoadEarlier()
  assert.equal(s.reveals(), 1)
  s.runtime.unmount()
})

test("empty or unconfirmed successful server pages do not reveal disconnected cached messages", async () => {
  for (const page of [[], undefined]) {
    const s = setup()
    s.setPage(page)
    const pending = s.current().handleLoadEarlier()
    s.finish()
    await pending
    assert.equal(s.reveals(), 0)
    assert.equal(s.current().isLoadingEarlier, false)
    s.runtime.unmount()
  }
})

test("missing thread, loading body and stale native taps cannot request or reveal history", async () => {
  for (const patch of [{ resolvedThreadId: undefined }, { currentUserId: "" }, { canLoadEarlier: false }]) {
    const s = setup()
    const staleTap = s.current().handleLoadEarlier
    Object.assign(s.input, patch)
    s.runtime.rerender()
    await staleTap()
    await s.current().handleLoadEarlier()
    assert.equal(s.requests.length, 0)
    assert.equal(s.reveals(), 0)
    s.runtime.unmount()
  }
})

test("a refresh that replaces the visible cursor invalidates an in-flight older page in the same conversation", async () => {
  const s = setup()
  const pending = s.current().handleLoadEarlier()
  s.input.oldestVisibleMessageId = "fresh-page-boundary"
  s.runtime.rerender()
  s.finish()
  await pending
  assert.equal(s.reveals(), 0)
  assert.equal(s.current().isLoadingEarlier, false)
  s.runtime.unmount()
})

test("switching away and back or unmounting cannot revive an old page callback", async () => {
  for (const unmount of [false, true]) {
    const s = setup()
    const pending = s.current().handleLoadEarlier()
    if (unmount) s.runtime.unmount()
    else {
      s.input.resolvedThreadId = "other-thread"
      s.runtime.rerender()
      assert.equal(s.current().isLoadingEarlier, false)
      s.input.resolvedThreadId = "current-thread"
      s.runtime.rerender()
    }
    s.finish()
    await pending
    assert.equal(s.reveals(), 0)
    if (!unmount) s.runtime.unmount()
  }
})
