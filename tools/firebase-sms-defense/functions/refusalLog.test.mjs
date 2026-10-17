import assert from "node:assert/strict"
import test from "node:test"
import { APP_CHECK_REJECTED, CALL_BUDGET_REJECTED, logSmsRefusal, smsGateRefusalReason } from "./refusalLog.mjs"

function recorder() {
  const lines = []
  return { lines, log: { error: line => lines.push(["error", JSON.parse(line)]), warn: line => lines.push(["warn", JSON.parse(line)]) } }
}

test("an expired price, App Check and the call budget each get their own gate reason", () => {
  assert.equal(smsGateRefusalReason(new Error("SMS country price expired")), "country_price_expired")
  assert.equal(smsGateRefusalReason(new Error(APP_CHECK_REJECTED)), "app_check_rejected")
  assert.equal(smsGateRefusalReason(new Error(CALL_BUDGET_REJECTED)), "call_budget")
  assert.equal(smsGateRefusalReason(new Error("SMS gate unavailable")), "gate_unavailable")
  assert.equal(smsGateRefusalReason(new Error("SMS proof rejected")), "proof_rejected")
  for (const unknown of [new Error("connect ECONNREFUSED 10.0.0.1"), "SMS country price expired", null, undefined]) {
    assert.equal(smsGateRefusalReason(unknown), "other")
  }
})

test("operator-fixable refusals log as errors with a reason code only", () => {
  const { lines, log } = recorder()
  logSmsRefusal("blumi_sms_gate_refused", "country_price_expired", log)
  logSmsRefusal("blumi_sms_gate_refused", "app_check_rejected", log)
  logSmsRefusal("blumi_sms_send_refused", "unavailable", log)
  logSmsRefusal("blumi_sms_send_refused", "+12025550101", log)
  logSmsRefusal("blumi_sms_send_refused", undefined, log)
  assert.deepEqual(lines, [
    ["error", { event: "blumi_sms_gate_refused", reason: "country_price_expired" }],
    ["warn", { event: "blumi_sms_gate_refused", reason: "app_check_rejected" }],
    ["error", { event: "blumi_sms_send_refused", reason: "unavailable" }],
    ["warn", { event: "blumi_sms_send_refused", reason: "other" }],
    ["warn", { event: "blumi_sms_send_refused", reason: "other" }]
  ])
})
