import assert from "node:assert/strict"
import test from "node:test"
import { createFirstAppearanceStagger } from "./miniRoomFirstAppearance"

const ids = (count: number) => Array.from({ length: count }, (_, index) => `m${index}`)

test("only the first appearance staggers, newest first, and at most the stagger's item count", () => {
  const stagger = createFirstAppearanceStagger(6)
  stagger.arm([])
  assert.equal(stagger.slotOf("m0"), null, "an empty (loading) list arms nothing")
  stagger.arm(ids(9))
  assert.deepEqual(ids(9).map((id) => stagger.slotOf(id)), [0, 1, 2, 3, 4, 5, null, null, null])
  stagger.arm(["late", ...ids(9)])
  assert.equal(stagger.slotOf("late"), null, "a message that arrives later appears at rest")
  assert.equal(stagger.slotOf("m0"), 0, "arming again changes nothing")
})

test("a row enters once: mounting it again (virtualised away and back) keeps it at rest", () => {
  const stagger = createFirstAppearanceStagger(6)
  stagger.arm(ids(3))
  assert.equal(stagger.slotOf("m1"), 1)
  assert.equal(stagger.slotOf("m1"), 1, "reading is pure: a double render sees the same slot")
  stagger.markEntered("m1")
  assert.equal(stagger.slotOf("m1"), null)
  assert.equal(stagger.slotOf("m2"), 2, "other rows keep their slots")
})
