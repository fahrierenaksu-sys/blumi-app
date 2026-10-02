import assert from "node:assert/strict"
import test from "node:test"

import { getProfileSetupInitialGender } from "./profileSetupVisualModel"

test("profile setup defaults to the female character while preserving an explicit male choice", () => {
  assert.equal(getProfileSetupInitialGender(undefined), "woman")
  assert.equal(getProfileSetupInitialGender("woman"), "woman")
  assert.equal(getProfileSetupInitialGender("man"), "man")
})
