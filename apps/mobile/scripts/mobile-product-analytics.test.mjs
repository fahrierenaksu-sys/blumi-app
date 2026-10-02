import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("product analytics is explicit-consent, minimal, and replay-free", () => {
  const analytics = read("src/analytics/productAnalytics.ts")
  const policy = read("src/analytics/productAnalyticsPolicy.ts")
  const consent = read("src/analytics/analyticsConsent.ts")

  assert.match(analytics, /defaultOptIn:\s*false/)
  assert.match(analytics, /captureAppLifecycleEvents:\s*false/)
  assert.match(analytics, /enableSessionReplay:\s*false/)
  assert.doesNotMatch(analytics, /identify\(/)
  assert.match(analytics, /sanitizeNamedProductEventProperties\(event, properties\)/)
  assert.match(policy, /SENSITIVE_PROPERTY_KEY/)
  // Withdrawing consent stops capture and drops the anonymous identity.
  assert.match(consent, /optOut\(\)/)
  assert.match(consent, /reset\(\)/)
})

function read(path) {
  return readFileSync(resolve(mobileRoot, path), "utf8")
}
