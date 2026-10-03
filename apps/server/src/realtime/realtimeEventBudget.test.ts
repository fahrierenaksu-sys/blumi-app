import assert from "node:assert/strict"
import test from "node:test"
import {
  classifyRealtimeEvent,
  createRealtimeEventBudget,
  REALTIME_EVENT_LIMITS,
  REALTIME_EVENT_WINDOW_MS,
  REALTIME_FRAME_LIMITS,
  MAX_TRACKED_REALTIME_FRAME_USERS,
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
  assert.equal(classifyRealtimeEvent("chat.ack_delivered"), "receipt")
  assert.equal(classifyRealtimeEvent("chat.send_message"), "chat")
  for (const type of ["chat.list_threads", "mini_room.scene_enter", "safety.block", "unknown", ""]) {
    assert.equal(classifyRealtimeEvent(type), "control")
  }
})

// The mobile client sends at most one MiniRoom retarget per 200 ms
// (RETARGET_INTERVAL_MS in apps/mobile/src/features/miniRoom/miniRoomMotionSession.ts).
const CLIENT_RETARGET_INTERVAL_MS = 200

test("motion admits a client retargeting at the app cadence and drops beyond its window", () => {
  const { userWindow } = REALTIME_EVENT_LIMITS.motion
  assert.ok(
    userWindow >= REALTIME_EVENT_WINDOW_MS / CLIENT_RETARGET_INTERVAL_MS,
    "the motion budget must never drop a well-behaved client's movement"
  )
  const budget = createRealtimeEventBudget()
  const results = admitMany(budget, "motion", userWindow + 1)
  assert.equal(results.filter((result) => result.kind === "admit").length, userWindow)
  assert.equal(results.at(-1)?.kind, "drop")
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

test("raw frame flooding is bounded across reconnects and isolated between accounts", () => {
  const budget = createRealtimeEventBudget()
  for (let frame = 0; frame < REALTIME_FRAME_LIMITS.userWindow; frame += 1) {
    assert.equal(budget.admitFrame({ userId: "frame_actor", bytes: 1, now: NOW }), true)
  }
  budget.forgetConnection("closed_connection")
  assert.equal(budget.admitFrame({ userId: "frame_actor", bytes: 1, now: NOW }), false)
  assert.equal(budget.admitFrame({ userId: "other_actor", bytes: 1, now: NOW }), true)
  budget.purgeExpired(NOW + REALTIME_EVENT_WINDOW_MS)
  assert.equal(budget.admitFrame({ userId: "frame_actor", bytes: 1, now: NOW + REALTIME_EVENT_WINDOW_MS }), true)
})

test("large raw frames exhaust the byte budget before their event allowance", () => {
  const budget = createRealtimeEventBudget()
  const bytes = 64 * 1024
  for (let sent = 0; sent < REALTIME_FRAME_LIMITS.userBytesWindow; sent += bytes) {
    assert.equal(budget.admitFrame({ userId: "frame_actor", bytes, now: NOW }), true)
  }
  assert.equal(budget.admitFrame({ userId: "frame_actor", bytes: 1, now: NOW }), false)
})

test("frame budget tracking fails closed at capacity and expiration admits new accounts", () => {
  const budget = createRealtimeEventBudget()
  for (let actor = 0; actor < MAX_TRACKED_REALTIME_FRAME_USERS; actor += 1) {
    assert.equal(budget.admitFrame({ userId: `actor_${actor}`, bytes: 1, now: NOW }), true)
  }
  assert.equal(budget.admitFrame({ userId: "new_actor", bytes: 1, now: NOW }), false)
  assert.equal(budget.admitFrame({ userId: "actor_0", bytes: 1, now: NOW }), true, "tracked accounts retain their window")
  assert.equal(budget.admitFrame({ userId: "new_actor", bytes: 1, now: NOW + REALTIME_EVENT_WINDOW_MS }), true)
})

test("invalid frame sizes fail closed without consuming another actor's allowance", () => {
  const budget = createRealtimeEventBudget()
  for (const bytes of [-1, Number.NaN, Number.POSITIVE_INFINITY, .5]) {
    assert.equal(budget.admitFrame({ userId: "invalid_actor", bytes, now: NOW }), false)
  }
  assert.equal(budget.admitFrame({ userId: "valid_actor", bytes: 1, now: NOW }), true)
})
