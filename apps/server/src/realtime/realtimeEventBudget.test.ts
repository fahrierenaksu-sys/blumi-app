import assert from "node:assert/strict"
import test from "node:test"
import {
  classifyRealtimeEvent,
  createRealtimeEventBudget,
  REALTIME_EVENT_LIMITS,
  REALTIME_EVENT_WINDOW_MS,
  type RealtimeAdmission,
  type RealtimeEventClass
} from "./realtimeEventBudget"

const NOW = 1_000_000

function admitMany(
  budget: ReturnType<typeof createRealtimeEventBudget>,
  eventClass: RealtimeEventClass,
  count: number,
  input: { connectionId?: string; userId?: string; now?: number } = {}
): RealtimeAdmission[] {
  const results: RealtimeAdmission[] = []
  for (let index = 0; index < count; index += 1) {
    const admission = budget.admit({
      connectionId: input.connectionId ?? "connection_1",
      userId: input.userId ?? "user_1",
      eventClass,
      now: input.now ?? NOW
    })
    if (admission.kind === "admit") admission.release()
    results.push(admission)
  }
  return results
}

test("events are classified so each kind of traffic has its own budget", () => {
  assert.equal(classifyRealtimeEvent("mini_room.move"), "motion")
  assert.equal(classifyRealtimeEvent("reaction.send"), "transient")
  assert.equal(classifyRealtimeEvent("presence.move_to_spot"), "transient")
  assert.equal(classifyRealtimeEvent("chat.send_message"), "chat")
  for (const type of ["chat.list_threads", "mini_room.scene_enter", "safety.block", "unknown", ""]) {
    assert.equal(classifyRealtimeEvent(type), "control")
  }
})

test("the MiniRoom motion quota is unchanged: 60 per user window, then dropped", () => {
  const budget = createRealtimeEventBudget()
  const results = admitMany(budget, "motion", 61)
  assert.equal(results.filter((result) => result.kind === "admit").length, 60)
  assert.equal(results.at(-1)?.kind, "drop")
  assert.deepEqual(REALTIME_EVENT_LIMITS.motion, { userWindow: 60, connectionInFlight: 2, userInFlight: 4 })
})

test("motion beyond two in flight per socket is dropped, never closing the socket", () => {
  const budget = createRealtimeEventBudget()
  const held = [0, 1].map(() => budget.admit({ connectionId: "c", userId: "u", eventClass: "motion", now: NOW }))
  assert.deepEqual(held.map((admission) => admission.kind), ["admit", "admit"])
  assert.equal(budget.admit({ connectionId: "c", userId: "u", eventClass: "motion", now: NOW }).kind, "drop")
  for (const admission of held) if (admission.kind === "admit") admission.release()
  assert.equal(budget.admit({ connectionId: "c", userId: "u", eventClass: "motion", now: NOW }).kind, "admit")
})

test("transient events over budget are dropped instead of closing the socket", () => {
  const budget = createRealtimeEventBudget()
  const results = admitMany(budget, "transient", REALTIME_EVENT_LIMITS.transient.userWindow + 5)
  assert.ok(results.slice(REALTIME_EVENT_LIMITS.transient.userWindow).every((result) => result.kind === "drop"))
})

test("other traffic cannot use up the chat budget", () => {
  const budget = createRealtimeEventBudget()
  admitMany(budget, "motion", 200)
  admitMany(budget, "transient", 200)
  admitMany(budget, "control", 50)
  assert.equal(admitMany(budget, "chat", 1)[0]?.kind, "admit")
})

test("chat over its budget is refused for a retry, and only an abusive rate closes", () => {
  const budget = createRealtimeEventBudget()
  const limits = REALTIME_EVENT_LIMITS.chat
  const results = admitMany(budget, "chat", limits.abuseWindow! + 1)
  assert.equal(results.slice(0, limits.userWindow).every((result) => result.kind === "admit"), true)
  assert.equal(results.slice(limits.userWindow, limits.abuseWindow).every((result) => result.kind === "refuse_chat"), true)
  assert.equal(results.at(-1)?.kind, "close")
})

test("control traffic over budget closes the socket, as before", () => {
  const budget = createRealtimeEventBudget()
  const results = admitMany(budget, "control", REALTIME_EVENT_LIMITS.control.connectionWindow! + 1)
  assert.equal(results.at(-2)?.kind, "admit")
  assert.equal(results.at(-1)?.kind, "close")
})

test("a user's windows outlive a socket, while socket windows are forgotten", () => {
  const budget = createRealtimeEventBudget()
  admitMany(budget, "control", 60, { connectionId: "first" })
  budget.forgetConnection("first")
  // The per-connection window restarts, the per-user window (100) does not.
  const second = admitMany(budget, "control", 41, { connectionId: "second" })
  assert.equal(second.slice(0, 40).every((result) => result.kind === "admit"), true)
  assert.equal(second.at(-1)?.kind, "close")
})

test("windows expire after the event window", () => {
  const budget = createRealtimeEventBudget()
  admitMany(budget, "chat", REALTIME_EVENT_LIMITS.chat.userWindow)
  assert.equal(admitMany(budget, "chat", 1)[0]?.kind, "refuse_chat")
  const later = NOW + REALTIME_EVENT_WINDOW_MS
  budget.purgeExpired(later)
  assert.equal(admitMany(budget, "chat", 1, { now: later })[0]?.kind, "admit")
})

test("releasing an admission twice frees only one slot", () => {
  const budget = createRealtimeEventBudget()
  const first = budget.admit({ connectionId: "c", userId: "u", eventClass: "motion", now: NOW })
  const second = budget.admit({ connectionId: "c", userId: "u", eventClass: "motion", now: NOW })
  assert.equal(first.kind, "admit")
  if (first.kind === "admit") { first.release(); first.release() }
  assert.equal(budget.admit({ connectionId: "c", userId: "u", eventClass: "motion", now: NOW }).kind, "admit")
  assert.equal(budget.admit({ connectionId: "c", userId: "u", eventClass: "motion", now: NOW }).kind, "drop")
  if (second.kind === "admit") second.release()
})
