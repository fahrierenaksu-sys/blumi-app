import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import * as budgetModule from "../model/avatarLiveBudget"
import type * as SlotModule from "./useAvatarLiveSlot"

/**
 * Review A F4: AvatarLive mounts its GPU canvas only while `useAvatarLiveSlot(liveScope, !holdCanvas)` grants it.
 * These run that hook as AvatarLive calls it, one fake React root per avatar on screen, against one real budget.
 */
function mountCaller(budget: budgetModule.AvatarLiveBudget, scope: budgetModule.AvatarLiveScope | undefined, focused = true) {
  const runtime = createFakeReactRuntime()
  // the screen's focus, as useIsSurfaceFocused reads it from the page's navigation
  const state = { holdCanvas: false, focused }
  const { useAvatarLiveSlot } = loadSourceWithFakeReact<typeof SlotModule>(
    "features/avatar/components/useAvatarLiveSlot.ts",
    runtime,
    { modules: { "../model/avatarLiveBudget": budgetModule, "./useIsSurfaceFocused": { useIsSurfaceFocused: () => state.focused } } }
  )
  runtime.render(() => useAvatarLiveSlot(scope, !state.holdCanvas, budget))
  return {
    get canvasMounted(): boolean {
      return runtime.output as boolean
    },
    hold(holdCanvas: boolean) {
      state.holdCanvas = holdCanvas
      runtime.rerender()
    },
    /** A focus or blur event of the caller's screen. */
    focus(isFocused: boolean) {
      state.focused = isFocused
      runtime.rerender()
    },
    unmount: () => runtime.unmount()
  }
}

/** The main-tab pager keeps My Room and Discover mounted; exactly one page is focused (shown) at a time. */
function mountPager(budget: budgetModule.AvatarLiveBudget) {
  const myRoom = mountCaller(budget, "screen", false)
  const discover = mountCaller(budget, "screen", false)
  const show = (page: "room" | "discover") => {
    // blur first, then focus, as React Navigation emits them
    if (page === "room") {
      discover.focus(false)
      myRoom.focus(true)
    } else {
      myRoom.focus(false)
      discover.focus(true)
    }
  }
  return { myRoom, discover, show }
}

test("a screen avatar gets its canvas; the screen opened later takes it and the first drops to its still", () => {
  const budget = budgetModule.createAvatarLiveBudget()
  const myRoom = mountCaller(budget, "screen")
  assert.equal(myRoom.canvasMounted, true)
  const profile = mountCaller(budget, "screen")
  assert.equal(profile.canvasMounted, true)
  assert.equal(myRoom.canvasMounted, false, "only one screen canvas at a time")
  assert.equal(budget.grantedCount(), 1)
  profile.unmount()
  assert.equal(myRoom.canvasMounted, true, "closing the newer screen gives the canvas back")
  myRoom.unmount()
  assert.equal(budget.grantedCount(), 0, "unmounting releases the slot")
})

test("a held canvas (MiniRoom fade-in, unfocused page) never mounts and never takes a slot", () => {
  const budget = budgetModule.createAvatarLiveBudget()
  const shown = mountCaller(budget, "screen")
  const held = mountCaller(budget, "screen")
  held.hold(true)
  assert.equal(held.canvasMounted, false)
  assert.equal(shown.canvasMounted, true, "the held caller gave its slot back")
  held.hold(false)
  assert.equal(held.canvasMounted, true, "released from hold, it asks again and, newest, wins")
  assert.equal(shown.canvasMounted, false)
  held.unmount()
  shown.unmount()
})

test("MiniRoom draws at most two live avatars; a caller without a scope never draws live", () => {
  const budget = budgetModule.createAvatarLiveBudget()
  const callers = [0, 1, 2].map(() => mountCaller(budget, "miniRoom"))
  assert.deepEqual(callers.map((caller) => caller.canvasMounted), [false, true, true])
  assert.equal(budget.grantedCount(), budgetModule.AVATAR_LIVE_LIMITS.miniRoom)
  const unscoped = mountCaller(budget, undefined)
  assert.equal(unscoped.canvasMounted, false)
  assert.equal(budget.grantedCount(), 2)
  for (const caller of [...callers, unscoped]) caller.unmount()
  assert.equal(budget.grantedCount(), 0)
})

test("a hidden pager page never holds the canvas: My Room preloaded behind Discover leaves it to the deck", () => {
  const budget = budgetModule.createAvatarLiveBudget()
  const discover = mountCaller(budget, "screen", true)
  // My Room mounts later (preloaded) but is not the shown page
  const myRoom = mountCaller(budget, "screen", false)
  assert.equal(myRoom.canvasMounted, false)
  assert.equal(discover.canvasMounted, true, "the shown deck keeps the canvas")
  assert.equal(budget.grantedCount(), 1)
  myRoom.unmount()
  discover.unmount()
})

test("tab changes room -> discover -> room -> editor -> room -> discover: the shown surface always owns the canvas", () => {
  const budget = budgetModule.createAvatarLiveBudget()
  const { myRoom, discover, show } = mountPager(budget)
  const owner = () => [myRoom.canvasMounted ? "room" : "", discover.canvasMounted ? "discover" : ""].join("")
  show("room")
  assert.equal(owner(), "room")
  show("discover")
  assert.equal(owner(), "discover")
  show("room")
  assert.equal(owner(), "room")
  // the room editor is a screen above the tabs: My Room blurs, the editor is focused
  myRoom.focus(false)
  const editor = mountCaller(budget, "screen", true)
  assert.equal(owner(), "")
  assert.equal(editor.canvasMounted, true)
  editor.unmount()
  myRoom.focus(true)
  assert.equal(owner(), "room", "closing the editor gives My Room its avatar back")
  show("discover")
  assert.equal(owner(), "discover")
  assert.equal(budget.grantedCount(), 1)
  myRoom.unmount()
  discover.unmount()
})

test("a deep link or account switch that remounts the tabs leaves no stale holder", () => {
  const budget = budgetModule.createAvatarLiveBudget()
  const first = mountPager(budget)
  first.show("room")
  // sign-out unmounts every surface of the old account
  first.myRoom.unmount()
  first.discover.unmount()
  assert.equal(budget.grantedCount(), 0, "sign-out releases every slot")
  // the next account lands on Discover; its My Room page mounts after it, hidden
  const next = mountPager(budget)
  next.show("discover")
  assert.equal(next.discover.canvasMounted, true)
  assert.equal(next.myRoom.canvasMounted, false)
  // a deep link to the room shows it
  next.show("room")
  assert.equal(next.myRoom.canvasMounted, true)
  assert.equal(next.discover.canvasMounted, false)
  next.myRoom.unmount()
  next.discover.unmount()
  assert.equal(budget.grantedCount(), 0)
})
