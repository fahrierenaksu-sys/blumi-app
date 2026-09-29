import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

const source = readFileSync(fileURLToPath(new URL("./RegisterScreen.tsx", import.meta.url)), "utf8")
const modelSource = readFileSync(
  fileURLToPath(new URL("../features/session/registerFlowModel.ts", import.meta.url)),
  "utf8"
)

test("typing in registration does not recreate the animated world hero", () => {
  assert.match(
    source,
    /const worldHero = useMemo\(\s*\(\) => <RegisterWorldHero active=\{motionActive && !isCodeStep\} \/>,\s*\[motionActive, isCodeStep\]\s*\)/
  )
  assert.match(source, /<Animated\.View style=\{\[styles\.createCharacterScene, handoffEntrance\]\}>[\s\S]*?\{worldHero\}/)
})

test("OTP keystrokes reuse phone analysis and country lookup until phone or country changes", () => {
  assert.match(
    source,
    /const phoneAnalysis = useMemo\(\s*\(\) => analyzeFormattedLocalPhoneNumber\(flow\.phoneNumber, flow\.selectedCountry\),\s*\[flow\.phoneNumber, flow\.selectedCountry\]\s*\)/
  )
  assert.match(
    source,
    /getRegisterFlowAvailabilityFromPhoneAnalysis\(\s*\{ stage: flow\.stage, verificationCode: flow\.verificationCode \},\s*busy,\s*phoneAnalysis\s*\)[\s\S]*?\[busy, flow\.stage, flow\.verificationCode, phoneAnalysis\]/
  )
  assert.match(
    source,
    /const selectedCountry = useMemo\([\s\S]*?\[flow\.selectedCountry\]\s*\)/
  )
})

test("phone keystrokes format once and analyze the formatted value without formatting again", () => {
  assert.match(
    source,
    /const phoneAnalysis = useMemo\(\s*\(\) => analyzeFormattedLocalPhoneNumber\(flow\.phoneNumber, flow\.selectedCountry\),\s*\[flow\.phoneNumber, flow\.selectedCountry\]\s*\)/
  )
  assert.equal([...source.matchAll(/updateRegisterPhone\(current, value\)/g)].length, 2)

  const helper = modelSource.match(
    /export function analyzeFormattedLocalPhoneNumber\([\s\S]*?\n\}/
  )?.[0]
  assert.ok(helper, "formatted-value analyzer should be exported")
  assert.match(
    helper,
    /analyzePhoneNumberWithFormattedValue\(\s*formattedValue,\s*countryCode,\s*formattedValue\s*\)/
  )
  assert.doesNotMatch(helper, /formatLocalPhoneNumber\(/)

  const updater = modelSource.match(
    /export function updateRegisterPhone\([\s\S]*?\n\}/
  )?.[0]
  assert.ok(updater, "phone input updater should be present")
  assert.equal([...updater.matchAll(/formatLocalPhoneNumber\(/g)].length, 1)
})

test("typing clears registration feedback only when that feedback is present", () => {
  assert.match(
    source,
    /const clearInputFeedback = \(clearSmsNotice = false\): void => \{\s*if \(attemptedPrimaryAction\) setAttemptedPrimaryAction\(false\)\s*if \(clearSmsNotice && smsNotice !== null\) setSmsNotice\(null\)\s*if \(errorMessage !== null\) onClearError\(\)\s*\}/
  )
  assert.equal([...source.matchAll(/clearInputFeedback\(\)/g)].length, 2)
  assert.equal([...source.matchAll(/clearInputFeedback\(true\)/g)].length, 2)
})
