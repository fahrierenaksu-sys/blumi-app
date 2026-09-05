import assert from "node:assert/strict"
import test from "node:test"
import { resolveNativeAppLocale } from "./authLocaleResolver"

test("does not read native locale settings on web", () => {
  let reads = 0

  const locale = resolveNativeAppLocale({
    platform: "web",
    settings: {
      get: () => {
        reads += 1
        return "tr_TR"
      }
    },
    nativeModules: {}
  })

  assert.equal(locale, undefined)
  assert.equal(reads, 0)
})

test("uses Apple locale settings on iOS", () => {
  assert.equal(resolveNativeAppLocale({
    platform: "ios",
    settings: { get: (key) => key === "AppleLocale" ? "tr_TR" : undefined },
    nativeModules: {}
  }), "tr_TR")
})

test("uses the Android locale identifier when Apple settings are unavailable", () => {
  assert.equal(resolveNativeAppLocale({
    platform: "android",
    settings: undefined,
    nativeModules: { I18nManager: { localeIdentifier: "en_US" } }
  }), "en_US")
})
