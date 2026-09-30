import assert from "node:assert/strict"
import test from "node:test"
import {
  INBOX_LATE_ROW_DURATION_MS,
  INBOX_STAGGER_DURATION_MS,
  INBOX_STAGGER_MAX_STEPS,
  INBOX_STAGGER_STEP_MS,
  getInboxStaggerDelayMs,
  planInboxEntrance,
  shouldPlayStaggerEntrance,
  shouldShowInboxSkeleton
} from "./inboxEntranceModel"

test("the stagger plays only for the first non-empty list", () => {
  assert.equal(shouldPlayStaggerEntrance(false, 0), false)
  assert.equal(shouldPlayStaggerEntrance(false, 3), true)
  assert.equal(shouldPlayStaggerEntrance(true, 3), false)
  assert.equal(shouldPlayStaggerEntrance(true, 0), false)
})

test("stagger delay grows per row and is capped after the first screenful", () => {
  assert.equal(getInboxStaggerDelayMs(0), 0)
  assert.equal(getInboxStaggerDelayMs(2), 2 * INBOX_STAGGER_STEP_MS)
  assert.equal(
    getInboxStaggerDelayMs(INBOX_STAGGER_MAX_STEPS + 40),
    INBOX_STAGGER_MAX_STEPS * INBOX_STAGGER_STEP_MS
  )
  assert.equal(getInboxStaggerDelayMs(-1), 0)
  assert.equal(getInboxStaggerDelayMs(Number.NaN), 0)
})

test("an empty loading list does not consume the one-time stagger", () => {
  const plan = planInboxEntrance({
    hasPlayedStagger: false,
    knownKeys: new Set(),
    nextKeys: [],
    reduceMotion: false
  })

  assert.deepEqual(plan.entrances, [])
  assert.equal(plan.hasPlayedStagger, false)
})

test("the first list staggers every row in list order", () => {
  const plan = planInboxEntrance({
    hasPlayedStagger: false,
    knownKeys: new Set(),
    nextKeys: ["a", "b", "c"],
    reduceMotion: false
  })

  assert.deepEqual(plan.entrances, [
    { key: "a", kind: "stagger", delayMs: 0, durationMs: INBOX_STAGGER_DURATION_MS },
    { key: "b", kind: "stagger", delayMs: INBOX_STAGGER_STEP_MS, durationMs: INBOX_STAGGER_DURATION_MS },
    { key: "c", kind: "stagger", delayMs: 2 * INBOX_STAGGER_STEP_MS, durationMs: INBOX_STAGGER_DURATION_MS }
  ])
  assert.equal(plan.hasPlayedStagger, true)
})

test("a thread arriving later enters alone and leaves existing rows untouched", () => {
  const plan = planInboxEntrance({
    hasPlayedStagger: true,
    knownKeys: new Set(["a", "b", "c"]),
    nextKeys: ["new", "a", "b", "c"],
    reduceMotion: false
  })

  assert.deepEqual(plan.entrances, [
    { key: "new", kind: "late", delayMs: 0, durationMs: INBOX_LATE_ROW_DURATION_MS }
  ])
  assert.deepEqual(plan.removedKeys, [])
  assert.equal(plan.hasPlayedStagger, true)
})

test("reordering known threads plans no entrance at all", () => {
  const plan = planInboxEntrance({
    hasPlayedStagger: true,
    knownKeys: new Set(["a", "b", "c"]),
    nextKeys: ["c", "a", "b"],
    reduceMotion: false
  })

  assert.deepEqual(plan.entrances, [])
  assert.deepEqual(plan.removedKeys, [])
})

test("threads that left the list are reported so their state can be dropped", () => {
  const plan = planInboxEntrance({
    hasPlayedStagger: true,
    knownKeys: new Set(["a", "b"]),
    nextKeys: ["b"],
    reduceMotion: false
  })

  assert.deepEqual(plan.removedKeys, ["a"])
  assert.deepEqual(plan.entrances, [])
})

test("a list that empties and refills after the first view does not stagger again", () => {
  const plan = planInboxEntrance({
    hasPlayedStagger: true,
    knownKeys: new Set(),
    nextKeys: ["a", "b"],
    reduceMotion: false
  })

  assert.deepEqual(plan.entrances.map((entrance) => entrance.kind), ["late", "late"])
  assert.deepEqual(plan.entrances.map((entrance) => entrance.delayMs), [0, 0])
})

test("Reduce Motion settles new rows instantly and still counts the list as shown", () => {
  const first = planInboxEntrance({
    hasPlayedStagger: false,
    knownKeys: new Set(),
    nextKeys: ["a", "b"],
    reduceMotion: true
  })

  assert.deepEqual(first.entrances, [
    { key: "a", kind: "none", delayMs: 0, durationMs: 0 },
    { key: "b", kind: "none", delayMs: 0, durationMs: 0 }
  ])
  assert.equal(first.hasPlayedStagger, true)

  const afterPreferenceChange = planInboxEntrance({
    hasPlayedStagger: first.hasPlayedStagger,
    knownKeys: new Set(["a", "b"]),
    nextKeys: ["a", "b"],
    reduceMotion: false
  })
  assert.deepEqual(afterPreferenceChange.entrances, [])
})

test("duplicate keys are planned once", () => {
  const plan = planInboxEntrance({
    hasPlayedStagger: false,
    knownKeys: new Set(),
    nextKeys: ["a", "a", "b"],
    reduceMotion: false
  })

  assert.deepEqual(plan.entrances.map((entrance) => entrance.key), ["a", "b"])
})

test("the skeleton shows only while an empty list is still opening", () => {
  assert.equal(shouldShowInboxSkeleton("idle", 0), true)
  assert.equal(shouldShowInboxSkeleton("loading", 0), true)
  assert.equal(shouldShowInboxSkeleton("loading", 2), false)
  assert.equal(shouldShowInboxSkeleton("ready", 0), false)
  assert.equal(shouldShowInboxSkeleton("failed", 0), false)
})
