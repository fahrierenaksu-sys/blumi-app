import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import type { ServerEvent } from "@blumi/contracts"
import {
  mapWithConcurrency,
  percentile,
  startSocialLoop,
  userIdsIn,
  type SimSocket,
  type SimUser
} from "./socialLoopHarness"
import { enterRoomTogether } from "./socialLoopScenarios"

/**
 * Small load for the shared room (scenario 6): fifty matched pairs, in
 * memory, over real HTTP and websockets against one server.
 *
 * Phase 1 (burst): every pair runs scenario 3's room steps at the same
 * instant: ten quick steps from one person, three from the other, and one
 * room message each (about 750 frames at once). Every partner must end on the
 * other's final target, in order, and get each message exactly once.
 * Phase 2 (steady): every person walks at the app's pace (5 steps a second,
 * pairs evenly staggered) for one second: 500 steps a second in total.
 * Throughout, no event of one pair may reach another pair (person, room or
 * thread ids).
 *
 * The phones and the server share one Node process and event loop here, so a
 * burst step's latency is the time to drain the whole burst, not one hop.
 * Budgets come from measurements on the development container (2026-10-01):
 * alone, burst p95 220-410 ms and steady p95 3-13 ms; with other suites
 * running in parallel processes, burst p95 up to about 720 ms and steady p95
 * up to about 30 ms. The budgets keep that headroom without hiding a
 * regression of several times.
 */

const PAIRS = 50
const BURST_STEPS = 10
const STEADY_ROUNDS = 5
const STEADY_ROUND_MS = 200
const BURST_P95_BUDGET_MS = 1_500
const STEADY_P95_BUDGET_MS = 100
const WALK_Y = 0.7
const walkX = (step: number) => Number((0.38 + step * 0.025).toFixed(3))

interface Pair {
  a: SimUser
  b: SimUser
  sa: SimSocket
  sb: SimSocket
  threadId: string
  miniRoomId: string
}

function idsInPayload(event: ServerEvent, key: "miniRoomId" | "threadId"): string[] {
  const found: string[] = []
  const visit = (value: unknown, name?: string) => {
    if (typeof value === "string" && name === key) found.push(value)
    else if (Array.isArray(value)) value.forEach((item) => visit(item, name))
    else if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey)
    }
  }
  visit(event.payload)
  return found
}

function stepLatencies(pairs: readonly Pair[], sentAt: ReadonlyMap<string, number>, marks: ReadonlyMap<SimSocket, number>) {
  const latencies: number[] = []
  for (const pair of pairs) {
    for (const [socket, partner] of [[pair.sa, pair.b], [pair.sb, pair.a]] as const) {
      const steps = socket.received("mini_room.avatar_moved", marks.get(socket))
        .filter((entry) => entry.event.payload.avatar.userId === partner.userId)
      const xs = steps.map((entry) => entry.event.payload.avatar.x)
      assert.deepEqual([...xs].sort((left, right) => left - right), xs, `${socket.owner.name} sees steps in order`)
      for (const entry of steps) {
        const sent = sentAt.get(`${partner.userId}:${entry.event.payload.avatar.x}`)
        assert.ok(sent !== undefined, "every delivered step was sent by the partner")
        latencies.push(entry.at - sent)
      }
    }
  }
  return latencies
}

const describe = (values: readonly number[]) =>
  `p50 ${percentile(values, 0.5).toFixed(1)} ms, p95 ${percentile(values, 0.95).toFixed(1)} ms, ` +
  `max ${Math.max(...values).toFixed(1)} ms (n=${values.length})`

test("6. fifty pairs in shared rooms at once: no cross-room leakage, final targets, room chat once, measured step delivery", { timeout: 45_000 }, async (t) => {
  const harness = await startSocialLoop({ storage: "memory" })
  try {
    const startedAt = performance.now()
    const users = await mapWithConcurrency(Array.from({ length: PAIRS * 2 }, (_, index) => index), 16,
      (index) => harness.signUp(`Load ${index}`, { gender: index % 2 ? "man" : "woman" }))
    const sockets = await mapWithConcurrency(users, 16, (user) => user.connect())
    const matched = await Promise.all(Array.from({ length: PAIRS }, (_, index) =>
      harness.matchPair(users[index * 2]!, users[index * 2 + 1]!)))
    const pairs: Pair[] = await Promise.all(matched.map(async ({ threadId }, index) => {
      const [a, b] = [users[index * 2]!, users[index * 2 + 1]!]
      const [sa, sb] = [sockets[index * 2]!, sockets[index * 2 + 1]!]
      await Promise.all([sa, sb].map((socket) =>
        socket.waitFor("chat.thread_created", (event) => event.payload.threadId === threadId)))
      const { miniRoomId } = await harness.openRoom(a, b, threadId)
      return { a, b, sa, sb, threadId, miniRoomId }
    }))
    await Promise.all(pairs.map((pair) => enterRoomTogether(pair.sa, pair.sb, pair.miniRoomId)))
    t.diagnostic(`setup: ${PAIRS * 2} accounts onboarded, matched, connected and in ${PAIRS} rooms in ` +
      `${(performance.now() - startedAt).toFixed(0)} ms`)

    // Phase 1: everyone walks and talks at the same instant.
    const burstMarks = new Map(sockets.map((socket) => [socket, socket.mark()] as const))
    const sentAt = new Map<string, number>()
    for (const pair of pairs) {
      for (let step = 0; step < BURST_STEPS; step += 1) {
        sentAt.set(`${pair.a.userId}:${walkX(step)}`, pair.sa.send("mini_room.move",
          { miniRoomId: pair.miniRoomId, sequence: step + 1, x: walkX(step), y: WALK_Y }))
      }
      for (let step = 0; step < 3; step += 1) {
        sentAt.set(`${pair.b.userId}:${walkX(step)}`, pair.sb.send("mini_room.move",
          { miniRoomId: pair.miniRoomId, sequence: step + 1, x: walkX(step), y: 0.75 }))
      }
      pair.sa.send("chat.send_message", { threadId: pair.threadId, body: `hello from ${pair.a.name}`, clientMessageId: `load-${pair.a.userId}` })
      pair.sb.send("chat.send_message", { threadId: pair.threadId, body: `hello from ${pair.b.name}`, clientMessageId: `load-${pair.b.userId}` })
    }
    const partnerMessage = (socket: SimSocket, partner: SimUser) => socket.waitFor("chat.message_received", (event) =>
      event.payload.senderUserId === partner.userId && !event.payload.clientMessageId, { since: burstMarks.get(socket), timeoutMs: 10_000 })
    await Promise.all(pairs.flatMap((pair) => [
      pair.sb.waitFor("mini_room.avatar_moved", (event) => event.payload.avatar.userId === pair.a.userId &&
        event.payload.avatar.x === walkX(BURST_STEPS - 1), { since: burstMarks.get(pair.sb), timeoutMs: 10_000 }),
      pair.sa.waitFor("mini_room.avatar_moved", (event) => event.payload.avatar.userId === pair.b.userId &&
        event.payload.avatar.x === walkX(2), { since: burstMarks.get(pair.sa), timeoutMs: 10_000 }),
      partnerMessage(pair.sb, pair.a),
      partnerMessage(pair.sa, pair.b)
    ]))
    await mapWithConcurrency(sockets, 25, (socket) => socket.barrier())
    const burst = stepLatencies(pairs, sentAt, burstMarks)
    for (const pair of pairs) {
      for (const [socket, partner] of [[pair.sa, pair.b], [pair.sb, pair.a]] as const) {
        assert.equal(socket.received("chat.message_received", burstMarks.get(socket))
          .filter((entry) => entry.event.payload.senderUserId === partner.userId).length, 1,
        "each room message reaches the partner exactly once")
      }
    }

    // Phase 2: steady walking at the app's pace, pairs staggered across each round.
    const steadyMarks = new Map(sockets.map((socket) => [socket, socket.mark()] as const))
    const steadyStart = performance.now() + 20
    await Promise.all(pairs.map(async (pair, index) => {
      for (let round = 0; round < STEADY_ROUNDS; round += 1) {
        const slot = steadyStart + round * STEADY_ROUND_MS + index * (STEADY_ROUND_MS / PAIRS)
        await delay(Math.max(0, slot - performance.now()))
        sentAt.set(`${pair.a.userId}:${walkX(BURST_STEPS + round)}`, pair.sa.send("mini_room.move",
          { miniRoomId: pair.miniRoomId, sequence: BURST_STEPS + round + 1, x: walkX(BURST_STEPS + round), y: WALK_Y }))
        sentAt.set(`${pair.b.userId}:${walkX(3 + round)}`, pair.sb.send("mini_room.move",
          { miniRoomId: pair.miniRoomId, sequence: 4 + round, x: walkX(3 + round), y: 0.75 }))
      }
    }))
    await Promise.all(pairs.flatMap((pair) => [
      pair.sb.waitFor("mini_room.avatar_moved", (event) => event.payload.avatar.userId === pair.a.userId &&
        event.payload.avatar.x === walkX(BURST_STEPS + STEADY_ROUNDS - 1), { since: steadyMarks.get(pair.sb), timeoutMs: 10_000 }),
      pair.sa.waitFor("mini_room.avatar_moved", (event) => event.payload.avatar.userId === pair.b.userId &&
        event.payload.avatar.x === walkX(2 + STEADY_ROUNDS), { since: steadyMarks.get(pair.sa), timeoutMs: 10_000 })
    ]))
    await mapWithConcurrency(sockets, 25, (socket) => socket.barrier())
    const steady = stepLatencies(pairs, sentAt, steadyMarks)

    // No event of any pair ever reached another pair, from sign-up to here.
    for (const pair of pairs) {
      const ownIds = new Set([pair.a.userId, pair.b.userId])
      const matchRoomId = `match_${pair.threadId.slice("thread_match_".length)}`
      for (const socket of [pair.sa, pair.sb]) {
        for (const { event } of socket.events) {
          for (const userId of userIdsIn(event)) {
            assert.ok(ownIds.has(userId), `${socket.owner.name} received ${event.type} naming another pair's person`)
          }
          for (const miniRoomId of idsInPayload(event, "miniRoomId")) {
            assert.ok(miniRoomId === pair.miniRoomId || miniRoomId === matchRoomId, `${socket.owner.name} received ${event.type} for another room`)
          }
          for (const threadId of idsInPayload(event, "threadId")) {
            assert.equal(threadId, pair.threadId, `${socket.owner.name} received ${event.type} for another thread`)
          }
        }
        assert.deepEqual(socket.received("realtime.error"), [])
      }
    }

    t.diagnostic(`burst step delivery (${PAIRS} rooms, ~750 frames at once): ${describe(burst)}`)
    t.diagnostic(`steady step delivery (${PAIRS * 2} people at 5 steps/s): ${describe(steady)}`)
    assert.ok(percentile(burst, 0.95) < BURST_P95_BUDGET_MS, `burst p95 exceeds ${BURST_P95_BUDGET_MS} ms`)
    assert.ok(percentile(steady, 0.95) < STEADY_P95_BUDGET_MS, `steady p95 exceeds ${STEADY_P95_BUDGET_MS} ms`)
    assert.equal(steady.length, PAIRS * 2 * STEADY_ROUNDS, "at the app's pace no step is coalesced away")
    assert.deepEqual(harness.deliveryErrors, [])
    await Promise.all(sockets.map((socket) => socket.close()))
  } finally {
    await harness.close()
  }
})
