import assert from "node:assert/strict"
import test from "node:test"
import { createChatLatencyDiagnostics } from "./chatLatencyDiagnostics"

test("latency diagnostics require local opt-in and never run in production", async () => {
  for (const [nodeEnv, enabled] of [["production", true], ["development", false]] as const) {
    const samples: unknown[] = []
    const measure = createChatLatencyDiagnostics({ nodeEnv, enabled, report: (sample) => { samples.push(sample) } })
    assert.equal(await measure("persist", async () => "private-result"), "private-result")
    assert.deepEqual(samples, [])
  }
})

test("timings carry only a phase, monotonic duration, outcome and count", async () => {
  const samples: unknown[] = []
  let clock = 0
  const measure = createChatLatencyDiagnostics({ nodeEnv: "test", enabled: true,
    now: () => clock, report: (sample) => { samples.push(sample) } })
  assert.equal(await measure("persist", async () => { clock = 12; return "private-body" }), "private-body")
  await assert.rejects(measure("fanout", async () => { clock = 18; throw new Error("private-token") }))
  assert.deepEqual(samples, [
    { phase: "persist", durationMs: 12, outcome: "ok", count: 1 },
    { phase: "fanout", durationMs: 6, outcome: "error", count: 1 }
  ])
})

test("a broken diagnostics sink cannot change the delivery result", async () => {
  const measure = createChatLatencyDiagnostics({ nodeEnv: "test", enabled: true, report: () => { throw new Error("Sink failure") } })
  assert.equal(await measure("push_enqueue", async () => 42), 42)
})
