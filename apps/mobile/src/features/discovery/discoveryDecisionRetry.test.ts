import assert from "node:assert/strict"
import test from "node:test"
import {
  isRetryableDiscoveryDecisionError,
  runDiscoveryDecisionWithRetry
} from "./discoveryDecisionRetry"
import {
  DiscoveryDecisionNotEligibleError,
  DiscoveryDecisionQuotaExhaustedError,
  DiscoveryDecisionRequestError
} from "./discoveryApi"

function timeoutError(): Error {
  const error = new Error("This is taking too long.")
  error.name = "TimeoutError"
  return error
}

test("only transport failures and server-side errors are retried; refusals are final", () => {
  assert.equal(isRetryableDiscoveryDecisionError(new TypeError("Network request failed")), true)
  assert.equal(isRetryableDiscoveryDecisionError(timeoutError()), true)
  assert.equal(isRetryableDiscoveryDecisionError(new DiscoveryDecisionRequestError(503, "down")), true)
  assert.equal(isRetryableDiscoveryDecisionError(new DiscoveryDecisionRequestError(429, "slow down")), true)
  assert.equal(isRetryableDiscoveryDecisionError(new DiscoveryDecisionRequestError(400, "blocked")), false)
  assert.equal(isRetryableDiscoveryDecisionError(new DiscoveryDecisionRequestError(401, "signed out")), false)
  assert.equal(isRetryableDiscoveryDecisionError(new DiscoveryDecisionNotEligibleError()), false)
  assert.equal(isRetryableDiscoveryDecisionError(new DiscoveryDecisionQuotaExhaustedError({} as never)), false)
  const cancelled = new Error("Request cancelled.")
  cancelled.name = "AbortError"
  assert.equal(isRetryableDiscoveryDecisionError(cancelled), false)
})

test("a decision retries a dropped connection with backoff, then answers (the server replays it idempotently)", async () => {
  const waits: number[] = []
  let attempts = 0
  const result = await runDiscoveryDecisionWithRetry(async () => {
    attempts += 1
    if (attempts < 3) throw new TypeError("Network request failed")
    return "saved"
  }, { delaysMs: [400, 1200], sleep: async (ms) => { waits.push(ms) } })
  assert.equal(result, "saved")
  assert.equal(attempts, 3)
  assert.deepEqual(waits, [400, 1200])
})

test("a definitive refusal or exhausted retries reject with the last error", async () => {
  let attempts = 0
  await assert.rejects(runDiscoveryDecisionWithRetry(async () => {
    attempts += 1
    throw new DiscoveryDecisionNotEligibleError()
  }, { delaysMs: [0, 0], sleep: async () => undefined }), DiscoveryDecisionNotEligibleError)
  assert.equal(attempts, 1)

  attempts = 0
  await assert.rejects(runDiscoveryDecisionWithRetry(async () => {
    attempts += 1
    throw new DiscoveryDecisionRequestError(502, `bad gateway ${attempts}`)
  }, { delaysMs: [0, 0], sleep: async () => undefined }), /bad gateway 3/)
  assert.equal(attempts, 3)
})
