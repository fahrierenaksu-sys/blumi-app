import assert from "node:assert/strict"
import test from "node:test"
import { sanitizeCrashEvent } from "./crashPrivacy"

test("crash telemetry drops free-form nested content but retains safe diagnostic positions", () => {
  const sensitiveFixture = ["person@example.test", "credential", "private-message"].join(" ")
  const input = {
    event_id: "abc123", timestamp: 12, level: "error", message: sensitiveFixture,
    request: { data: sensitiveFixture }, user: { email: sensitiveFixture }, extra: { nested: { value: sensitiveFixture } },
    contexts: { arbitrary: { nested: sensitiveFixture } }, tags: { custom: sensitiveFixture },
    breadcrumbs: [{ category: "console", message: sensitiveFixture, data: { value: sensitiveFixture } }],
    exception: { values: [{ type: "TypeError", value: sensitiveFixture, stacktrace: {
      frames: [{ filename: "/Users/private/person.ts", vars: { sensitiveFixture }, lineno: 12, colno: 4, in_app: true }]
    } }] }
  }
  const result = sanitizeCrashEvent(input)
  assert.equal(JSON.stringify(result).includes(sensitiveFixture), false)
  assert.equal(JSON.stringify(result).includes("/Users/private"), false)
  assert.equal(result.exception?.values[0]?.type, "TypeError")
  assert.deepEqual(result.exception?.values[0]?.stacktrace.frames[0], { lineno: 12, colno: 4, in_app: true })
  assert.equal(input.message, sensitiveFixture)
})

test("malformed crash payloads and arbitrary exception types fail closed", () => {
  assert.deepEqual(sanitizeCrashEvent(null), {})
  assert.deepEqual(sanitizeCrashEvent({ exception: { values: [{ type: "person@example.test", value: "secret" }] } }), {
    exception: { values: [{ type: "Error", value: "[redacted]", stacktrace: { frames: [] } }] }
  })
})

test("symbolication keeps validated release/debug linkage without host or query data", () => {
  const result = sanitizeCrashEvent({
    platform: "javascript", environment: "production", release: "com.blumi.mobile@1.0.0+1", dist: "1",
    debug_meta: { images: [{ type: "sourcemap", debug_id: "12345678-1234-1234-1234-123456789012", code_file: "https://private.example/index.android.bundle?token=secret" }] },
    exception: { values: [{ type: "TypeError", stacktrace: { frames: [{ filename: "https://private.example/index.android.bundle?token=secret", function: "saveProfile", lineno: 10 }] } }] }
  })
  assert.equal(result.release, "com.blumi.mobile@1.0.0+1")
  assert.equal(result.debug_meta?.images[0]?.code_file, "app:///index.android.bundle")
  assert.equal(result.exception?.values[0]?.stacktrace.frames[0]?.filename, "app:///index.android.bundle")
  assert.equal(result.exception?.values[0]?.stacktrace.frames[0]?.function, "saveProfile")
  assert.doesNotMatch(JSON.stringify(result), /private\.example|token=secret/)
})
