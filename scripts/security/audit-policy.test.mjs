import assert from "node:assert/strict"
import test from "node:test"
import { evaluateAudit, evaluateAuditRun } from "./audit-policy.mjs"

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

test("an exception stays valid through the end of its UTC expiry day and fails the next second", () => {
  const vulnerabilities = { example: { via: [{ url: "https://github.com/advisories/GHSA-example" }] } }
  assert.deepEqual(evaluateAudit(vulnerabilities, policy, new Date("2026-11-30T23:59:59Z")), [])
  assert.deepEqual(evaluateAudit(vulnerabilities, policy, new Date("2026-12-01T00:00:00Z")), [
    { packageName: "example", id: "GHSA-example", reason: "expired" }
  ])
})

// npm audit exits 1 both for "advisories found" and for "audit failed", so the
// gate must prove it received a real report before it can call a run clean.
const now = new Date("2026-10-14T12:00:00Z")
const allowedAdvisory = { example: { via: [{ url: "https://github.com/advisories/GHSA-example" }] } }
const report = (vulnerabilities) => JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: {} })
const assertRejected = (run) => {
  const failures = evaluateAuditRun(run, policy, now)
  assert.ok(failures.length > 0, `expected the audit run to fail: ${JSON.stringify(run)}`)
  assert.ok(failures.every((failure) => typeof failure.reason === "string" && failure.reason.length > 0))
}

test("a registry or DNS error reported as npm error JSON fails the gate", () => {
  assertRejected({ status: 1, stdout: JSON.stringify({ message: "request failed", error: { code: "EAI_AGAIN", summary: "getaddrinfo EAI_AGAIN" } }) })
  assertRejected({ status: 0, stdout: JSON.stringify({ error: { code: "EAI_AGAIN" } }) })
})

test("a report without a vulnerabilities object fails the gate", () => {
  assertRejected({ status: 0, stdout: JSON.stringify({ auditReportVersion: 2, metadata: {} }) })
  assertRejected({ status: 0, stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: null }) })
  assertRejected({ status: 0, stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: [] }) })
  assertRejected({ status: 0, stdout: JSON.stringify({ vulnerabilities: {} }) })
})

test("malformed or empty output fails the gate", () => {
  assertRejected({ status: 0, stdout: "{\"auditReportVersion\": 2, \"vulner" })
  assertRejected({ status: 0, stdout: "" })
  assertRejected({ status: 0, stdout: "   \n" })
  assertRejected({ status: 0, stdout: "null" })
  assertRejected({ status: 0, stdout: undefined })
})

test("a non-zero or missing exit status without a report fails the gate", () => {
  assertRejected({ status: 1, stdout: "" })
  assertRejected({ status: null, signal: "SIGTERM", stdout: "" })
  assertRejected({ status: 1, stdout: "", error: new Error("spawn npm ENOENT") })
})

test("a non-zero exit with an empty vulnerability list is not trusted as clean", () => {
  assertRejected({ status: 1, stdout: report({}) })
})

test("an advisory entry without a GHSA identifier cannot be skipped", () => {
  assert.equal(evaluateAudit({ example: { via: [{ source: 1, title: "unknown" }] } }, policy, now).length, 1)
})

test("a valid report with only exact, unexpired advisories still passes", () => {
  assert.deepEqual(evaluateAuditRun({ status: 1, stdout: report(allowedAdvisory) }, policy, now), [])
  assert.deepEqual(evaluateAuditRun({ status: 0, stdout: report({}) }, policy, now), [])
  assert.deepEqual(evaluateAuditRun({ status: 1, stdout: report({ ...allowedAdvisory, wrapper: { via: ["example"] } }) }, policy, now), [])
})

test("a valid report with an unlisted advisory fails the gate", () => {
  const failures = evaluateAuditRun({ status: 1, stdout: report({ other: { via: [{ url: "https://github.com/advisories/GHSA-other" }] } }) }, policy, now)
  assert.deepEqual(failures, [{ packageName: "other", id: "GHSA-other", reason: "not allowlisted" }])
})
