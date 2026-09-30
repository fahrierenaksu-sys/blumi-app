import assert from "node:assert/strict"
import test from "node:test"
import {
  getToastBottomBarInset,
  publishToastBottomBarInset,
  subscribeToToastBottomBarInset
} from "./toastLayoutStore"

test("no bar is published until a visible bottom bar reports its inset", () => {
  assert.equal(getToastBottomBarInset(), null)
})

test("a published bar inset is readable and notifies subscribers once per change", () => {
  const owner = Symbol("bar")
  let calls = 0
  const unsubscribe = subscribeToToastBottomBarInset(() => { calls += 1 })

  publishToastBottomBarInset(owner, 92)
  assert.equal(getToastBottomBarInset(), 92)
  publishToastBottomBarInset(owner, 92)
  assert.equal(calls, 1, "an unchanged inset does not notify")

  publishToastBottomBarInset(owner, null)
  assert.equal(getToastBottomBarInset(), null)
  assert.equal(calls, 2)
  unsubscribe()
})

test("a stale owner clearing its inset does not hide a newer bar", () => {
  const leaving = Symbol("leaving")
  const arriving = Symbol("arriving")
  publishToastBottomBarInset(leaving, 90)
  publishToastBottomBarInset(arriving, 92)
  publishToastBottomBarInset(leaving, null)
  assert.equal(getToastBottomBarInset(), 92)
  publishToastBottomBarInset(arriving, null)
  assert.equal(getToastBottomBarInset(), null)
})

test("invalid insets are ignored", () => {
  const owner = Symbol("bar")
  publishToastBottomBarInset(owner, Number.NaN)
  assert.equal(getToastBottomBarInset(), null)
  publishToastBottomBarInset(owner, -4)
  assert.equal(getToastBottomBarInset(), null)
})
