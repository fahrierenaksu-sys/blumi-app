import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_LIVE_LIMITS, createAvatarLiveBudget } from "./avatarLiveBudget"

test("one live canvas for the focused screen: the screen opened last gets it, the one behind shows its still", () => {
  const budget = createAvatarLiveBudget()
  const discover = budget.request("screen")
  assert.equal(budget.isGranted(discover), true)
  const profile = budget.request("screen")
  assert.equal(budget.isGranted(profile), true)
  assert.equal(budget.isGranted(discover), false)
  assert.equal(budget.grantedCount(), 1)
  // closing the profile (blur/unmount releases) hands the canvas back
  budget.release(profile)
  assert.equal(budget.isGranted(discover), true)
})

test("a MiniRoom gets two live canvases, a third avatar there and any other screen get stills", () => {
  const budget = createAvatarLiveBudget()
  const behind = budget.request("screen")
  const me = budget.request("miniRoom")
  const partner = budget.request("miniRoom")
  assert.deepEqual([budget.isGranted(me), budget.isGranted(partner), budget.isGranted(behind)], [true, true, false])
  const third = budget.request("miniRoom")
  assert.equal(budget.grantedCount(), AVATAR_LIVE_LIMITS.miniRoom)
  assert.equal(budget.isGranted(third), true)
  assert.equal(budget.isGranted(me), false)
  for (const token of [me, partner, third]) budget.release(token)
  assert.equal(budget.isGranted(behind), true)
})

test("an unfocused page never asks, so nothing is live without a request; releases are idempotent and notify", () => {
  const budget = createAvatarLiveBudget()
  assert.equal(budget.grantedCount(), 0)
  let calls = 0
  const unsubscribe = budget.subscribe(() => calls++)
  const token = budget.request("screen")
  budget.release(token)
  budget.release(token)
  assert.equal(calls, 2)
  unsubscribe()
  budget.request("screen")
  assert.equal(calls, 2)
})
