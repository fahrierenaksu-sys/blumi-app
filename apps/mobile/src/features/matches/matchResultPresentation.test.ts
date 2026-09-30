import assert from "node:assert/strict"
import test from "node:test"
import {
  getMatchCelebrationMotion,
  getMatchCreatedProperties,
  getMatchResultPresentation,
  MATCH_RESULT_ENTRY_POINTS
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
    modalAnimationType: "fade"
  })
  assert.deepEqual(getMatchCelebrationMotion(true), {
    confetti: false,
    heartPulse: false,
    entranceSpring: false,
    modalAnimationType: "none"
  })
})

test("presentations are fresh values so callers cannot mutate shared copy", () => {
  const first = getMatchResultPresentation({ entry: "connection_modal", matchedUserName: "Ada", canStartConversation: true })
  ;(first.actions[0] as { label: string }).label = "mutated"
  const second = getMatchResultPresentation({ entry: "connection_modal", matchedUserName: "Ada", canStartConversation: true })
  assert.equal(second.actions[0].label, "Start chatting")
})
