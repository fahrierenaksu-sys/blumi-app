// One fixed-shape log line per refused SMS: a reason code only, never the
// phone, IP, installation, challenge, proof or a provider error message.
// 2026-10-17: expired prices refused every sign-in and looked like any other
// "unavailable", so an operator-fixable outage went unnoticed.

/** Errors the callable raises itself before the gate runs. */
export const APP_CHECK_REJECTED = "SMS app check rejected"
export const CALL_BUDGET_REJECTED = "SMS call budget rejected"

const GATE_REASONS = new Map([
  ["SMS country price expired", "country_price_expired"],
  ["SMS gate unavailable", "gate_unavailable"],
  ["SMS gate limit", "gate_limit"],
  ["SMS device limit", "device_limit"],
  ["SMS phone limit", "phone_limit"],
  ["SMS device cooldown", "device_cooldown"],
  ["SMS phone cooldown", "phone_cooldown"],
  ["SMS challenge rejected", "challenge_rejected"],
  ["SMS proof rejected", "proof_rejected"],
  ["Invalid SMS gate input", "invalid_input"],
  [APP_CHECK_REJECTED, "app_check_rejected"],
  [CALL_BUDGET_REJECTED, "call_budget"]
])
/** Reasons only an operator can fix; they log as errors so they stand out. */
const OPERATOR_REASONS = new Set(["country_price_expired", "gate_unavailable", "disabled", "unavailable"])
const REASON_PATTERN = /^[a-z_]{1,40}$/

export function smsGateRefusalReason(error) {
  return GATE_REASONS.get(error instanceof Error ? error.message : undefined) ?? "other"
}

/** `reason` comes from our own admission code; anything unexpected still logs as "other". */
export function logSmsRefusal(event, reason, log = console) {
  const safeReason = typeof reason === "string" && REASON_PATTERN.test(reason) ? reason : "other"
  const line = JSON.stringify({ event, reason: safeReason })
  if (OPERATOR_REASONS.has(safeReason)) log.error(line)
  else log.warn(line)
}
