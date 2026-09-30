import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import * as crashPrivacy from "./crashPrivacy"

// Executes the real reporter against a stub Sentry scope, then runs the
// captured event through the real beforeSend. Proves what would be sent, not
// the Sentry SDK's own transport.
function reporterFixture(dsn: string) {
  const relative = "src/observability/crashReporting.ts"
  const file = existsSync(resolve(relative)) ? resolve(relative) : resolve("apps/mobile", relative)
  const exports: Record<string, any> = {}
  const events: Record<string, unknown>[] = []
  let beforeSend: ((event: unknown) => unknown) | undefined
  const Sentry = {
    init: (options: { beforeSend: (event: unknown) => unknown }) => { beforeSend = options.beforeSend },
    withScope: (callback: (scope: unknown) => void) => {
      const event: { tags: Record<string, string>; contexts: Record<string, unknown> } = { tags: {}, contexts: {} }
      callback({
        setTag: (key: string, value: string) => { event.tags[key] = value },
        setContext: (key: string, value: unknown) => { event.contexts[key] = value }
      })
      events.push(event)
    },
    captureException: () => {}
  }
  vm.runInContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS
  } }).outputText, vm.createContext({ exports, require: (name: string) => {
    if (name === "@sentry/react-native") return Sentry
    if (name === "./crashPrivacy") return crashPrivacy
    if (name === "../config/env") return { BLUMI_SENTRY_DSN: dsn, BLUMI_BUILD_PROFILE: "development" }
    throw new Error(`Unexpected import ${name}`)
  } }))
  exports.initializeCrashReporting()
  return {
    capture: exports.captureAppException as (error: unknown, context?: unknown, tags?: unknown) => void,
    raw: () => events,
    sent: () => events.map((event) => beforeSend?.(event))
  }
}

test("a route boundary report sends only the boundary and allowlisted route tags", () => {
  const reporter = reporterFixture("https://public@example.invalid/1")
  reporter.capture(new Error("private"), { componentStack: "in ChatThread partner=Ada" }, { boundary: "route", route: "ChatThread" })
  assert.deepEqual(reporter.raw()[0]?.tags, { boundary: "route", route: "ChatThread" })
  assert.deepEqual(reporter.sent(), [{ tags: { boundary: "route", route: "ChatThread" } }])
})

test("the reporter withholds a route name outside the allowlist even before beforeSend", () => {
  const reporter = reporterFixture("https://public@example.invalid/1")
  reporter.capture(new Error("private"), undefined, { boundary: "route", route: "chat/abc?partner=Ada" })
  assert.deepEqual(reporter.raw()[0]?.tags, { boundary: "route", route: "unknown" })
})

test("a report without tags carries no tags, and no DSN sends nothing", () => {
  const reporter = reporterFixture("https://public@example.invalid/1")
  reporter.capture(new Error("private"), { feature: "push_registration" })
  assert.deepEqual(reporter.raw()[0]?.tags, {})
  assert.deepEqual(reporter.sent(), [{}])
  const disabled = reporterFixture("")
  disabled.capture(new Error("private"), undefined, { boundary: "root" })
  assert.deepEqual(disabled.raw(), [])
})
