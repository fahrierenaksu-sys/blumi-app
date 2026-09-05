import assert from "node:assert/strict"
import test from "node:test"
import { DiscoveryDecisionQuotaExhaustedError } from "./discoveryApi"
import {
  getDiscoveryDecisionErrorMessageForDisplay,
  getDiscoveryErrorMessageForDisplay
} from "./discoveryErrorCopy"

const technicalError =
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"

test("discovery errors never expose transport diagnostics", () => {
  assert.equal(
    getDiscoveryErrorMessageForDisplay("load", technicalError),
    "We couldn't load Discover. Check your connection and try again."
  )
  assert.equal(
    getDiscoveryErrorMessageForDisplay("refresh", technicalError),
    "We couldn't refresh Discover. Check your connection and try again."
  )
  assert.equal(
    getDiscoveryErrorMessageForDisplay("decision", technicalError),
    "That choice wasn't saved. Check your connection and try again."
  )
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

  assert.equal(
    getDiscoveryDecisionErrorMessageForDisplay(quotaError),
    "Today’s Discover limit is reached. It will reset automatically."
  )
  assert.equal(
    getDiscoveryDecisionErrorMessageForDisplay(technicalError),
    "That choice wasn't saved. Check your connection and try again."
  )
})
