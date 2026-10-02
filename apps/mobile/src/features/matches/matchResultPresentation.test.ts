import assert from "node:assert/strict"
import test from "node:test"
import {
  getMatchCelebrationMotion,
  getMatchCreatedProperties,
  getMatchResultPresentation,
  getMatchResultRouteTimeline,
  MATCH_RESULT_ENTRY_POINTS,
  shouldPlayMatchHaptic,
  springFromOrigami
} from "./matchResultPresentation"

// Characterizes the two match surfaces: their actions, onboarding gate,
// safety entry, locale parity, analytics attribution and motion bounds. The
// wording itself is free to change.

test("every entry point offers send-message and keep-discovering actions", () => {
  for (const entry of MATCH_RESULT_ENTRY_POINTS) {
    const presentation = getMatchResultPresentation({ entry, matchedUserName: "Ada", canStartConversation: true })
    assert.deepEqual(presentation.actions.map((action) => action.id), ["send_message", "keep_discovering"])
    assert.ok(presentation.actions.every((action) => action.label.trim().length > 0))
  }
})

test("the discovery route keeps its safety entry and onboarding gate", () => {
  const presentation = getMatchResultPresentation({
    entry: "discovery_route",
    matchedUserName: "Ada",
    canStartConversation: false
  })
  assert.match(presentation.safetyLabel ?? "", /Ada/)
  assert.deepEqual(
    presentation.actions.map((action) => [action.id, action.enabled]),
    [["send_message", false], ["keep_discovering", true]]
  )
})

test("a Turkish device gets the match moment in Turkish on both surfaces (DSC-1)", () => {
  // Every user-visible string differs from English: nothing falls back.
  for (const entry of MATCH_RESULT_ENTRY_POINTS) {
    const en = getMatchResultPresentation({ entry, matchedUserName: "Ada", canStartConversation: true, locale: "en" })
    const tr = getMatchResultPresentation({ entry, matchedUserName: "Ada", canStartConversation: true, locale: "tr" })
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (key === "entry" || key === "actions") continue
      assert.notEqual(tr[key], en[key], `${entry}.${String(key)}`)
    }
    en.actions.forEach((action, index) => assert.notEqual(tr.actions[index]!.label, action.label))
  }
})

test("match_created is attributed once, to the realtime connection presentation only", () => {
  assert.deepEqual(getMatchCreatedProperties("connection_modal", "production"), {
    source: "mini_room_mutual_save",
    mode: "production"
  })
  assert.deepEqual(getMatchCreatedProperties("connection_modal", "demo"), {
    source: "mini_room_mutual_save",
    mode: "demo"
  })
  // The discovery route is navigated to after the server already decided the
  // match and can be replayed from chat, so it never emits match_created.
  assert.equal(getMatchCreatedProperties("discovery_route", "production"), null)
})

test("Reduce Motion removes the celebration, pulse, and modal fade", () => {
  const full = getMatchCelebrationMotion(false)
  assert.equal(full.confetti, true)
  assert.equal(full.heartPulse, true)
  assert.equal(full.entranceSpring, true)
  assert.notEqual(full.modalAnimationType, "none")
  const reduced = getMatchCelebrationMotion(true)
  assert.equal(reduced.confetti, false)
  assert.equal(reduced.heartPulse, false)
  assert.equal(reduced.entranceSpring, false)
  assert.equal(reduced.modalAnimationType, "none")
})

test("the celebration entrance settles from just below size", () => {
  const motion = getMatchCelebrationMotion(false)
  assert.ok(motion.entranceSpringConfig)
  // A pop from 0 read as a jump; the card settles from just below size.
  assert.ok(motion.entranceFromScale > 0 && motion.entranceFromScale < 1)
})

test("the physical spring matches React Native's origami tension/friction conversion", () => {
  // RN SpringConfig: stiffness = (tension - 30) * 3.62 + 194, damping = (friction - 8) * 3 + 25.
  assert.deepEqual(springFromOrigami(40, 7), { tension: 40, friction: 7, damping: 22, stiffness: 230.2, mass: 1 })
  const spring = getMatchCelebrationMotion(false).entranceSpringConfig
  assert.ok(spring)
  assert.deepEqual(springFromOrigami(spring.tension, spring.friction), spring)
})

test("celebration pulses are bounded, never endless", () => {
  for (const reduceMotion of [false, true]) {
    const motion = getMatchCelebrationMotion(reduceMotion)
    for (const iterations of [motion.heartPulseIterations, motion.haloPulseIterations]) {
      assert.ok(Number.isInteger(iterations), "a negative or fractional count would loop forever in RN Animated")
      assert.ok(iterations >= 0 && iterations <= 3)
    }
  }
  const full = getMatchCelebrationMotion(false)
  assert.ok(full.heartPulseIterations >= 2)
  assert.ok(full.haloPulseIterations >= 1)
})

test("Reduce Motion keeps a short crossfade and drops scale, stagger, and pulses", () => {
  const reduced = getMatchCelebrationMotion(true)
  assert.equal(reduced.entranceFromScale, 1)
  assert.equal(reduced.entranceSpringConfig, null)
  assert.equal(reduced.contentStaggerMs, 0)
  assert.equal(reduced.heartPulseIterations, 0)
  assert.equal(reduced.haloPulseIterations, 0)
  assert.equal(reduced.entranceFromOpacity, 0)
  assert.ok(reduced.entranceOpacityDurationMs > 0 && reduced.entranceOpacityDurationMs <= 200)
})

test("the match haptic plays once, on the hidden-to-visible transition only", () => {
  assert.equal(shouldPlayMatchHaptic(false, true), true)
  // Re-renders while visible, hiding, and staying hidden stay silent.
  assert.equal(shouldPlayMatchHaptic(true, true), false)
  assert.equal(shouldPlayMatchHaptic(true, false), false)
  assert.equal(shouldPlayMatchHaptic(false, false), false)
})

test("the entrance spring keeps one frozen identity so hook dependencies stay stable", () => {
  const first = getMatchCelebrationMotion(false).entranceSpringConfig
  const second = getMatchCelebrationMotion(false).entranceSpringConfig
  // A fresh object per render would restart the entrance on every re-render.
  assert.equal(first, second)
  assert.ok(Object.isFrozen(first))
  assert.throws(() => {
    ;(first as { tension: number }).tension = 1
  }, TypeError)
  assert.equal(getMatchCelebrationMotion(false).entranceSpringConfig, first)
})

test("presentations are fresh values so callers cannot mutate shared copy", () => {
  const first = getMatchResultPresentation({ entry: "connection_modal", matchedUserName: "Ada", canStartConversation: true })
  const originalLabel = first.actions[0].label
  ;(first.actions[0] as { label: string }).label = "mutated"
  const second = getMatchResultPresentation({ entry: "connection_modal", matchedUserName: "Ada", canStartConversation: true })
  assert.equal(second.actions[0].label, originalLabel)
})

test("the Discover match screen card settles from just below size, never from 0, with the haptic as it appears (DSC-2)", () => {
  const timeline = getMatchResultRouteTimeline(false)
  assert.ok(timeline.heroFromScale > 0 && timeline.heroFromScale < 1)
  assert.equal(timeline.heroFromOpacity, 0)
  assert.equal(timeline.heroDelayMs, timeline.hapticDelayMs, "the success tap lands with the card, not before it")
  assert.ok(timeline.dockDelayMs <= 250, `the actions arrive within 250 ms (${timeline.dockDelayMs})`)
  assert.equal(timeline.heroSpring, true)

  const reduced = getMatchResultRouteTimeline(true)
  assert.equal(reduced.heroFromScale, 1, "Reduce Motion: a crossfade, no scale")
  assert.equal(reduced.heroSpring, false)
  assert.equal(reduced.heroDelayMs, reduced.hapticDelayMs, "haptics are not motion: the tap stays")
  assert.equal(reduced.dockDelayMs, 0)
})
