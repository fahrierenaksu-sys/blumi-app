import assert from "node:assert/strict"
import test from "node:test"
import { evaluateAudit } from "./audit-policy.mjs"

const policy = {
  allowlist: [{
    id: "GHSA-example",
    package: "example",
    expiresOn: "2026-11-30"
  }]
}

test("accepts only an exact, unexpired advisory", () => {
  assert.deepEqual(evaluateAudit({ example: { via: [{ url: "https://github.com/advisories/GHSA-example" }] } }, policy, new Date("2026-08-31")), [])
})

test("rejects unknown and expired advisories", () => {
  assert.equal(evaluateAudit({ other: { via: [{ url: "https://github.com/advisories/GHSA-other" }] } }, policy, new Date("2026-08-31")).length, 1)
  assert.equal(evaluateAudit({ example: { via: [{ url: "https://github.com/advisories/GHSA-example" }] } }, policy, new Date("2026-12-01")).length, 1)
})
