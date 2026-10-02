import assert from "node:assert/strict"
import test from "node:test"
import { DiscoveryDecisionQuotaExhaustedError } from "./discoveryApi"
import {
  getDiscoveryDecisionErrorMessageForDisplay,
  getDiscoveryErrorMessageForDisplay
} from "./discoveryErrorCopy"

const technicalError =
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
const RAW_DIAGNOSTICS = /fetch failed|Exception|\.swift|http|Could not connect/i

function assertSafe(message: string): void {
  assert.ok(message.trim().length > 0)
  assert.doesNotMatch(message, RAW_DIAGNOSTICS)
}

test("discovery errors never expose transport diagnostics", () => {
  for (const surface of ["load", "refresh", "decision"] as const) {
    assertSafe(getDiscoveryErrorMessageForDisplay(surface, technicalError))
    assertSafe(getDiscoveryErrorMessageForDisplay(surface, new Error(technicalError)))
  }
})

test("profile decisions keep quota exhaustion distinct from a failed request", () => {
  const quotaError = new DiscoveryDecisionQuotaExhaustedError({
    limit: 10,
    extensionDecisions: 0,
    used: 10,
    remaining: 0,
    resetsAt: "2026-07-27T00:00:00.000Z",
    rewardedAd: { available: false, extensionDecisions: 10 }
  })

  const quota = getDiscoveryDecisionErrorMessageForDisplay(quotaError)
  const failed = getDiscoveryDecisionErrorMessageForDisplay(technicalError)
  assertSafe(quota)
  assertSafe(failed)
  assert.notEqual(quota, failed)
})
