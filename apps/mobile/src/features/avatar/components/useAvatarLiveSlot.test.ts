import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import * as budgetModule from "../model/avatarLiveBudget"
import type * as SlotModule from "./useAvatarLiveSlot"

/**
 * Review A F4: AvatarLive mounts its GPU canvas only while `useAvatarLiveSlot(liveScope, !holdCanvas)` grants it.
 * These run that hook as AvatarLive calls it, one fake React root per avatar on screen, against one real budget.
 */
function mountCaller(budget: budgetModule.AvatarLiveBudget, scope: budgetModule.AvatarLiveScope | undefined) {
  const runtime = createFakeReactRuntime()
  const { useAvatarLiveSlot } = loadSourceWithFakeReact<typeof SlotModule>(
    "features/avatar/components/useAvatarLiveSlot.ts",
    runtime,
    { modules: { "../model/avatarLiveBudget": budgetModule } }
  )
  const state = { holdCanvas: false }
  runtime.render(() => useAvatarLiveSlot(scope, !state.holdCanvas, budget))
  return {
    get canvasMounted(): boolean {
      return runtime.output as boolean
    },
    hold(holdCanvas: boolean) {
      state.holdCanvas = holdCanvas
      runtime.rerender()
    },
    unmount: () => runtime.unmount()
  }
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
