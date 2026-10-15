import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import * as core from "@sentry/core"
import * as crashPrivacy from "./crashPrivacy"

const PRIVATE_MARKERS = ["THREAD_PRIVATE_MARKER", "TOKEN_PRIVATE_MARKER", "PHONE_PRIVATE_MARKER", "boom PRIVATE"]
const SPAN_COUNT = 200

/** Runs the real crashReporting.ts against a stub init and returns the options it passes. */
function productionInitOptions(): Record<string, unknown> {
  const relative = "src/observability/crashReporting.ts"
  const file = existsSync(resolve(relative)) ? resolve(relative) : resolve("apps/mobile", relative)
  let captured: Record<string, unknown> | undefined
  const exports: Record<string, any> = {}
  const Sentry = { init: (options: Record<string, unknown>) => { captured = options } }
  vm.runInContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS
  } }).outputText, vm.createContext({ exports, require: (name: string) => {
    if (name === "@sentry/react-native") return Sentry
    if (name === "./crashPrivacy") return crashPrivacy
    if (name === "../config/env") return { BLUMI_SENTRY_DSN: "https://public@example.invalid/1", BLUMI_BUILD_PROFILE: "production" }
    throw new Error(`Unexpected import ${name}`)
  } }))
  exports.initializeCrashReporting()
  assert.ok(captured, "Sentry.init was not called")
  return captured
}

test("production crash reporting sends no transaction and no private marker through the SDK transport", async () => {
  const sent: string[] = []
  const transport = () => core.createTransport({ recordDroppedEvent() {} }, async (request) => {
    sent.push(typeof request.body === "string" ? request.body : Buffer.from(request.body).toString("utf8"))
    return { statusCode: 200 }
  })
  const client = new core.ServerRuntimeClient({
    ...productionInitOptions(),
    dsn: "https://public@example.invalid/1",
    transport,
    stackParser: () => [],
    integrations: []
  } as ConstructorParameters<typeof core.ServerRuntimeClient>[0])
  core.setCurrentClient(client)
  client.init()

  for (let index = 0; index < SPAN_COUNT; index += 1) {
    // Each span starts its own trace so every one gets its own sampling decision.
    core.startNewTrace(() => core.startSpan({
      name: "GET /v1/chat/threads/THREAD_PRIVATE_MARKER?token=TOKEN_PRIVATE_MARKER",
      op: "http.client",
      attributes: { "http.url": "https://api.invalid/x?phone=PHONE_PRIVATE_MARKER" }
    }, () => {}))
  }
  core.captureException(new Error("boom PRIVATE"))
  await client.flush(1000)

  const all = sent.join("\n")
  assert.ok(sent.length >= 1, "the sanitized error event should still be sent")
  assert.equal(all.includes("\"type\":\"transaction\""), false, "a transaction envelope left the app")
  for (const marker of PRIVATE_MARKERS) {
    assert.equal(all.includes(marker), false, `${marker} left the app`)
  }
})
