import assert from "node:assert/strict"
import test from "node:test"
import {
  getMatchCelebrationMotion,
  getMatchCreatedProperties,
  getMatchResultPresentation,
  MATCH_RESULT_ENTRY_POINTS,
  shouldPlayMatchHaptic,
  springFromOrigami
} from "./matchResultPresentation"

// Characterizes the two match surfaces exactly as they ship today. The copy
// and action sets differ per entry point on purpose; unifying them is a
// product decision, so these assertions pin today's user-visible contract.

test("every entry point offers send-message and keep-discovering actions", () => {
  for (const entry of MATCH_RESULT_ENTRY_POINTS) {
    const presentation = getMatchResultPresentation({ entry, matchedUserName: "Ada", canStartConversation: true })
    assert.deepEqual(presentation.actions.map((action) => action.id), ["send_message", "keep_discovering"])
    assert.ok(presentation.actions.every((action) => action.label.trim().length > 0))
  }
})

test("the realtime connection modal keeps its shipped copy and close control", () => {
  const presentation = getMatchResultPresentation({
    entry: "connection_modal",
    matchedUserName: "Ada",
    canStartConversation: true
  })
  assert.equal(presentation.headline, "It's a vibe.")
  assert.equal(presentation.body, "You and Ada both felt it. Start with a message when you are ready.")
  assert.equal(presentation.badgeLabel, "Mutual match")
  assert.equal(presentation.closeLabel, "Close match result")
  assert.equal(presentation.safetyLabel, undefined)
  assert.deepEqual(presentation.actions, [
    { id: "send_message", label: "Start chatting", enabled: true },
    { id: "keep_discovering", label: "Keep exploring", enabled: true }
  ])
})

test("the discovery route keeps its shipped copy, safety entry, and onboarding gate", () => {
  const presentation = getMatchResultPresentation({
    entry: "discovery_route",
    matchedUserName: "Ada",
    canStartConversation: false
  })
  assert.equal(presentation.headline, "It’s a vibe.")
  assert.equal(presentation.eyebrow, "New match")
  assert.equal(presentation.title, "You two just matched.")
  assert.equal(presentation.body, "Start with a message and get to know each other at your pace.")
  assert.equal(presentation.nextStepTitle, "Make the first move feel natural.")
  assert.equal(presentation.nextStepBody, "A thoughtful hello is enough to get the conversation going.")
  assert.equal(presentation.backLabel, "Return to Discover")
  assert.equal(presentation.safetyLabel, "Safety options for Ada")
  assert.deepEqual(presentation.actions, [
    { id: "send_message", label: "Say Hi", enabled: false },
    { id: "keep_discovering", label: "Keep Exploring", enabled: true }
  ])
})

test("a Turkish device gets the match moment in Turkish on both surfaces (DSC-1)", () => {
  const modal = getMatchResultPresentation({
    entry: "connection_modal",
    matchedUserName: "Ada",
    canStartConversation: true,
    locale: "tr"
  })
  assert.equal(modal.headline, "Enerjiniz tuttu.")
  assert.equal(modal.body, "Sen ve Ada aynı şeyi hissettiniz. Hazır olduğunda bir mesajla başla.")
  assert.equal(modal.badgeLabel, "Karşılıklı eşleşme")
  assert.equal(modal.closeLabel, "Eşleşme ekranını kapat")
  assert.deepEqual(modal.actions, [
    { id: "send_message", label: "Sohbete başla", enabled: true },
    { id: "keep_discovering", label: "Keşfetmeye devam et", enabled: true }
  ])

  const route = getMatchResultPresentation({
    entry: "discovery_route",
    matchedUserName: "Ada",
    canStartConversation: true,
    locale: "tr"
  })
  assert.equal(route.headline, "Enerjiniz tuttu.")
  assert.equal(route.eyebrow, "Yeni eşleşme")
  assert.equal(route.title, "Az önce eşleştiniz.")
  assert.equal(route.body, "Bir mesajla başlayın, birbirinizi kendi hızınızda tanıyın.")
  assert.equal(route.nextStepTitle, "İlk adım doğal olsun.")
  assert.equal(route.nextStepBody, "Düşünceli bir selam sohbeti başlatmaya yeter.")
  assert.equal(route.backLabel, "Keşfet'e dön")
  assert.equal(route.safetyLabel, "Ada için güvenlik seçenekleri")
  assert.deepEqual(route.actions, [
    { id: "send_message", label: "Selam ver", enabled: true },
    { id: "keep_discovering", label: "Keşfetmeye devam et", enabled: true }
  ])

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
  assert.deepEqual(getMatchCelebrationMotion(false), {
    confetti: true,
    heartPulse: true,
    entranceSpring: true,
    modalAnimationType: "fade",
    entranceFromOpacity: 0,
    entranceFromScale: 0.92,
    entranceOpacityDurationMs: 220,
    entranceSpringConfig: {
      tension: 70,
      friction: 9,
      damping: 28,
      stiffness: 338.8,
      mass: 1
    },
    contentStaggerMs: 70,
    heartPulseIterations: 2,
    haloPulseIterations: 2
  })
  assert.deepEqual(getMatchCelebrationMotion(true), {
    confetti: false,
    heartPulse: false,
    entranceSpring: false,
    modalAnimationType: "none",
    entranceFromOpacity: 0,
    entranceFromScale: 1,
    entranceOpacityDurationMs: 160,
    entranceSpringConfig: null,
    contentStaggerMs: 0,
    heartPulseIterations: 0,
    haloPulseIterations: 0
  })
})

test("the celebration entrance is a small, gently underdamped settle", () => {
  const motion = getMatchCelebrationMotion(false)
  const spring = motion.entranceSpringConfig
  assert.ok(spring)
  // A pop from 0 read as a jump; the card now settles from just below size.
  assert.ok(motion.entranceFromScale >= 0.9 && motion.entranceFromScale < 1)
  // Underdamped (a hint of overshoot) but far from bouncy.
  const dampingRatio = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass))
  assert.ok(dampingRatio > 0.6 && dampingRatio < 0.9, `damping ratio ${dampingRatio}`)
  // Headline first, avatars a beat later.
  assert.ok(motion.contentStaggerMs >= 60 && motion.contentStaggerMs <= 80)
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
  assert.equal(getMatchCelebrationMotion(false).entranceSpringConfig?.tension, 70)
})

test("presentations are fresh values so callers cannot mutate shared copy", () => {
  const first = getMatchResultPresentation({ entry: "connection_modal", matchedUserName: "Ada", canStartConversation: true })
  ;(first.actions[0] as { label: string }).label = "mutated"
  const second = getMatchResultPresentation({ entry: "connection_modal", matchedUserName: "Ada", canStartConversation: true })
  assert.equal(second.actions[0].label, "Start chatting")
})
