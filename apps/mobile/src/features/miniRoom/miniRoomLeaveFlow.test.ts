import assert from "node:assert/strict"
import test from "node:test"
import { startMiniRoomLeave, type MiniRoomLeaveFlowInput } from "./miniRoomLeaveFlow"

class StatusError extends Error {
  constructor(readonly status: number | null) {
    super("leave failed")
  }
}

function harness(answers: (number | null | "hang")[]) {
  const log: string[] = []
  const waits: number[] = []
  let scheduled: { callback: () => void; ms: number; cancelled: boolean } | null = null
  let release: (() => void) | null = null
  let attempts = 0
  const input: MiniRoomLeaveFlowInput = {
    attempt: async () => {
      const answer = answers[Math.min(attempts, answers.length - 1)]
      attempts += 1
      log.push(`attempt ${attempts}`)
      if (answer === "hang") {
        await new Promise<void>((resolve) => { release = resolve })
        return
      }
      if (answer === 200) return
      throw new StatusError(answer)
    },
    readFailureStatus: (error) => error instanceof StatusError ? error.status : null,
    exit: () => log.push("exit"),
    onUnconfirmed: () => log.push("notice"),
    delaysMs: [1_000, 3_000, 9_000],
    exitWaitMs: 4_000,
    wait: async (ms) => { waits.push(ms) },
    schedule: (callback, ms) => {
      const entry = { callback, ms, cancelled: false }
      scheduled = entry
      return () => { entry.cancelled = true }
    }
  }
  return {
    input,
    log,
    waits,
    get scheduled() { return scheduled },
    release: () => release?.(),
    get attempts() { return attempts }
  }
}

test("a confirmed leave exits once, without a notice", async () => {
  const h = harness([200])
  assert.equal(await startMiniRoomLeave(h.input), "confirmed")
  assert.deepEqual(h.log, ["attempt 1", "exit"])
  assert.equal(h.scheduled?.ms, 4_000)
  assert.equal(h.scheduled?.cancelled, true)
})

test("a room that no longer exists counts as left", async () => {
  for (const status of [404, 410]) {
    const h = harness([status])
    assert.equal(await startMiniRoomLeave(h.input), "confirmed")
    assert.deepEqual(h.log, ["attempt 1", "exit"])
    assert.deepEqual(h.waits, [])
  }
})

test("a network or server failure exits at once and confirms the close in the background", async () => {
  const h = harness([null, 503, 200])
  assert.equal(await startMiniRoomLeave(h.input), "confirmed")
  // Out of the room right after the first failure, before any retry.
  assert.deepEqual(h.log, ["attempt 1", "exit", "attempt 2", "attempt 3"])
  assert.deepEqual(h.waits, [1_000, 3_000])
})

test("retries are bounded; an unconfirmed close ends in one calm notice after the exit", async () => {
  const h = harness([503])
  assert.equal(await startMiniRoomLeave(h.input), "unconfirmed")
  assert.equal(h.attempts, 4)
  assert.deepEqual(h.waits, [1_000, 3_000, 9_000])
  assert.deepEqual(h.log, ["attempt 1", "exit", "attempt 2", "attempt 3", "attempt 4", "notice"])
})

test("an answer a retry cannot change stops at once, after the exit", async () => {
  for (const status of [400, 401, 403]) {
    const h = harness([status])
    assert.equal(await startMiniRoomLeave(h.input), "unconfirmed")
    assert.deepEqual(h.log, ["attempt 1", "exit", "notice"])
    assert.deepEqual(h.waits, [])
  }
})

test("a hanging request does not hold the person in the room", async () => {
  const h = harness(["hang"])
  const outcome = startMiniRoomLeave(h.input)
  await Promise.resolve()
  assert.deepEqual(h.log, ["attempt 1"])
  // The exit deadline passes while the request is still open.
  h.scheduled?.callback()
  assert.deepEqual(h.log, ["attempt 1", "exit"])
  h.release()
  assert.equal(await outcome, "confirmed")
  assert.deepEqual(h.log, ["attempt 1", "exit"], "exit runs once")
})

test("an unexpected error while reading the failure still exits and ends quietly", async () => {
  const h = harness([503])
  h.input.readFailureStatus = () => { throw new Error("broken") }
  assert.equal(await startMiniRoomLeave(h.input), "unconfirmed")
  assert.deepEqual(h.log, ["attempt 1", "exit", "notice"])
})
