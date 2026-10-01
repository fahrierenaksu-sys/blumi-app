import assert from "node:assert/strict"
import test from "node:test"
import { getProfileSetupFieldError, shouldDismissAgeKeyboard } from "./profileSetupValidation"

const untouched = { displayName: "", ageText: "", nameTouched: false, ageTouched: false }

test("the first letter or digit never shows an error", () => {
  assert.equal(getProfileSetupFieldError({ ...untouched, displayName: "A" }), null)
  assert.equal(getProfileSetupFieldError({ ...untouched, ageText: "2" }), null)
})

test("leaving an invalid field shows its error, and a fix clears it live", () => {
  assert.equal(getProfileSetupFieldError({ ...untouched, displayName: "A", nameTouched: true }), "name")
  assert.equal(getProfileSetupFieldError({ ...untouched, displayName: "Ay", nameTouched: true }), null)
  assert.equal(getProfileSetupFieldError({ ...untouched, ageText: "1", ageTouched: true }), "age")
  assert.equal(getProfileSetupFieldError({ ...untouched, ageText: "17", ageTouched: true }), "age")
  assert.equal(getProfileSetupFieldError({ ...untouched, ageText: "18", ageTouched: true }), null)
  assert.equal(getProfileSetupFieldError({ ...untouched, nameTouched: true, ageTouched: true }), null, "empty fields stay quiet")
})

test("the name error wins when both fields are invalid", () => {
  assert.equal(
    getProfileSetupFieldError({ displayName: " A ", ageText: "9", nameTouched: true, ageTouched: true }),
    "name"
  )
})

test("only a complete two-digit age closes the number pad", () => {
  assert.equal(shouldDismissAgeKeyboard("2"), false)
  assert.equal(shouldDismissAgeKeyboard("24"), true)
})
