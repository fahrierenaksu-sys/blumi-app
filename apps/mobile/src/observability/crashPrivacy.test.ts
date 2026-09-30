import assert from "node:assert/strict"
import test from "node:test"
import { sanitizeCrashEvent, toReportableRouteName } from "./crashPrivacy"
import { ROOT_ROUTE_NAMES } from "../navigation/rootRouteNames"

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

test("an allowlisted route and boundary scope pass as the only tags", () => {
  assert.deepEqual(sanitizeCrashEvent({ tags: { boundary: "route", route: "ChatThread" } }), {
    tags: { boundary: "route", route: "ChatThread" }
  })
  assert.deepEqual(sanitizeCrashEvent({ tags: { boundary: "root" } }), { tags: { boundary: "root" } })
  for (const route of ROOT_ROUTE_NAMES) {
    assert.deepEqual(sanitizeCrashEvent({ tags: { route } }).tags, { route })
  }
})

test("free-form or PII-looking route values are reported as unknown", () => {
  const unsafeRoutes = [
    "12345678-1234-4234-8234-123456789012",
    "+90 555 123 45 67",
    "905551234567",
    "person@example.test",
    "chat/abc",
    "ChatThread?threadId=abc",
    "ChatThread#partner",
    "https://blumi.app/chat/abc",
    "ChatThread/12345678-1234-4234-8234-123456789012",
    "Ada Lovelace",
    "chatthread",
    "CHATTHREAD",
    " ChatThread",
    "ChatThread\n",
    "unknownRoute",
    "__proto__",
    "constructor",
    "L".repeat(500),
    ""
  ]
  for (const route of unsafeRoutes) {
    const result = sanitizeCrashEvent({ tags: { boundary: "route", route } })
    assert.deepEqual(result.tags, { boundary: "route", route: "unknown" }, JSON.stringify(route))
  }
  assert.equal(toReportableRouteName("person@example.test"), "unknown")
})

test("non-string route values and unknown boundary values are dropped", () => {
  for (const route of [42, null, true, ["ChatThread"], { name: "ChatThread" }]) {
    assert.deepEqual(sanitizeCrashEvent({ tags: { route } }), {}, JSON.stringify(route))
  }
  for (const boundary of ["screen", "Route", "ROOT", "route ", "app", "", 1, null, ["route"]]) {
    assert.deepEqual(sanitizeCrashEvent({ tags: { boundary } }), {}, JSON.stringify(boundary))
  }
  // Inherited properties never count as tags.
  const inherited = Object.create({ route: "ChatThread", boundary: "route" })
  assert.deepEqual(sanitizeCrashEvent({ tags: inherited }), {})
  assert.deepEqual(sanitizeCrashEvent({ tags: "route:ChatThread" }), {})
})

test("the route tag never opens contexts, extra, user, request or breadcrumbs", () => {
  const secret = ["person@example.test", "thread-12345678-1234-4234-8234-123456789012", "private-message"].join(" ")
  const result = sanitizeCrashEvent({
    tags: { boundary: "route", route: "ChatThread", threadId: secret, url: secret, partner: secret, transaction: secret },
    contexts: { app_error: { componentStack: secret, route: "ChatThread", boundary: "route" }, route: { name: "ChatThread" } },
    extra: { route: "ChatThread", params: secret },
    user: { id: secret, email: secret },
    request: { url: `https://blumi.app/chat/abc?token=${secret}`, query_string: secret },
    breadcrumbs: [{ category: "navigation", data: { from: "Lobby", to: "ChatThread", params: secret } }],
    transaction: "ChatThread",
    message: secret
  })
  assert.deepEqual(result, { tags: { boundary: "route", route: "ChatThread" } })
  assert.equal(JSON.stringify(result).includes(secret), false)
})
