import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import * as React from "react"
import { PostHogCore } from "@posthog/core"
import * as policy from "./productAnalyticsPolicy"

const CONSENT_KEY = "@blumi/privacy/product_analytics_consent_v1"

/**
 * A PostHog client on the real @posthog/core logic. Its only stand-ins are
 * the network (counted, never sent) and storage. Like posthog-react-native,
 * it loads remote flags at start unless `preloadFeatureFlags` is false.
 */
function createSdk() {
  const requests: string[] = []
  const instances: PostHogCore[] = []
  class FakePostHog extends PostHogCore {
    private readonly store = new Map<string, unknown>()
    constructor(apiKey: string, options: Record<string, unknown>) {
      super(apiKey, options)
      instances.push(this)
      if (options.preloadFeatureFlags !== false) this.reloadFeatureFlags()
    }
    fetch(url: string) {
      requests.push(url.replace(/\?.*$/, ""))
      return Promise.resolve({ status: 200, text: async () => "{}", json: async () => ({}) })
    }
    getLibraryId() { return "blumi-test" }
    getLibraryVersion() { return "0.0.0" }
    getCustomUserAgent() { return undefined }
    getPersistedProperty<T>(key: string): T | undefined { return this.store.get(key) as T | undefined }
    setPersistedProperty<T>(key: string, value: T | null) {
      if (value === null) this.store.delete(key)
      else this.store.set(key, value)
    }
  }
  return { FakePostHog, requests, instances }
}

function loadModule(relative: string, modules: Record<string, unknown>): Record<string, any> {
  const file = existsSync(resolve(relative)) ? resolve(relative) : resolve("apps/mobile", relative)
  const exports: Record<string, any> = {}
  vm.runInContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true
  } }).outputText, vm.createContext({ exports, Promise, setTimeout, clearTimeout, console, require: (name: string) => {
    if (name in modules) return modules[name]
    throw new Error(`Unexpected import ${name}`)
  } }))
  return exports
}

function loadConsent(stored: string | null) {
  const sdk = createSdk()
  const storage = new Map<string, string>(stored ? [[CONSENT_KEY, stored]] : [])
  const analytics = loadModule("src/analytics/productAnalytics.ts", {
    "posthog-react-native": { __esModule: true, default: sdk.FakePostHog },
    "../config/env": { BLUMI_BUILD_PROFILE: "production", BLUMI_POSTHOG_API_KEY: "phc_test_key", BLUMI_POSTHOG_HOST: "https://posthog.invalid" },
    "./productAnalyticsPolicy": policy
  })
  const consent = loadModule("src/analytics/analyticsConsent.ts", {
    react: React,
    "@react-native-async-storage/async-storage": { __esModule: true, default: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value) }
    } },
    "./productAnalytics": analytics
  })
  return { sdk, analytics, consent }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise((resolveTick) => setTimeout(resolveTick, 5))
}

test("first launch without consent makes no telemetry request", async () => {
  const { sdk, consent, analytics } = loadConsent(null)
  await consent.hydrateAnalyticsConsent()
  analytics.captureProductEvent("activation_session_started")
  await settle()
  assert.deepEqual(sdk.requests, [])
})

test("declining consent makes no telemetry request", async () => {
  const { sdk, consent, analytics } = loadConsent(null)
  await consent.setAnalyticsConsent("denied")
  analytics.captureProductEvent("activation_session_started")
  await settle()
  assert.deepEqual(sdk.requests, [])
})

test("withdrawing consent makes no telemetry request", async () => {
  const { sdk, consent, analytics } = loadConsent("granted")
  await consent.hydrateAnalyticsConsent()
  await settle()
  assert.equal(analytics.isProductAnalyticsCaptureEnabled(), true)
  sdk.requests.length = 0
  await consent.setAnalyticsConsent("denied")
  analytics.captureProductEvent("activation_session_started")
  await settle()
  assert.deepEqual(sdk.requests, [])
  assert.equal(sdk.instances.every((instance) => instance.optedOut), true)
})
