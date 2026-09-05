import assert from "node:assert/strict"
import test from "node:test"
import { blumiEntryTheme } from "./theme"

test("onboarding actions share Whoa's dark-plum color", () => {
  assert.equal(blumiEntryTheme.colors.actionDark, "#2B202A")
  assert.equal(blumiEntryTheme.colors.actionDarkPressed, "#20162A")
})
