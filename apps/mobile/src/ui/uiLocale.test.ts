import assert from "node:assert/strict"
import test from "node:test"
import { resolveToastLocale } from "./toastCopy"
import { readUiLocaleTag, resolveUiLocale, setUiLocaleSource } from "./uiLocale"

test.afterEach(() => setUiLocaleSource(null))

test("the registered app language wins over the runtime locale", () => {
  setUiLocaleSource(() => "tr")
  assert.equal(readUiLocaleTag(), "tr")
  assert.equal(resolveUiLocale(), "tr")
  assert.equal(resolveToastLocale(), "tr", "toasts follow the app language")
  setUiLocaleSource(() => "en-GB")
  assert.equal(resolveToastLocale(), "en")
})

test("an unregistered or failing source falls back to the runtime locale", () => {
  const runtime = resolveUiLocale(Intl.DateTimeFormat().resolvedOptions().locale)
  assert.equal(resolveUiLocale(), runtime)
  setUiLocaleSource(() => { throw new Error("native module unavailable") })
  assert.equal(resolveUiLocale(), runtime)
  setUiLocaleSource(() => undefined)
  assert.equal(resolveUiLocale(), runtime)
})
