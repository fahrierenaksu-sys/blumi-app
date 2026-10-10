import { createHmac } from "node:crypto"

/** Cheap per-instance ceiling before database/attestation calls. This is an
 * extra cost guard, not the shared authoritative SMS budget or a bill cap. */
export function createCallableBudget({ secret, now = () => performance.now(), report = () => {} }) {
  let started = now(), total = 0
  let refused = 0
  const sources = new Map()
  const deny = () => { refused = Math.min(Number.MAX_SAFE_INTEGER, refused + 1); return false }
  return ip => {
    const time = now()
    if (time - started >= 60_000) {
      try { report({ metric: "sms_gate_work_budget", allowed: total, refused }) } catch { /* Metrics cannot authorize work. */ }
      started = time; total = 0; refused = 0; sources.clear()
    }
    if (typeof ip !== "string" || !ip.length || ip.length > 64) return deny()
    if (total >= 120) return deny()
    const key = createHmac("sha256", secret).update(ip).digest("hex")
    const count = (sources.get(key) ?? 0) + 1
    sources.set(key, Math.min(count, 21))
    if (count > 20) return deny()
    total += 1
    return true
  }
}
