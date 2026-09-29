import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const source = read("./RegisterScreen.tsx")
const registerDirectory = "../features/session/register/"
const controller = read(`${registerDirectory}useRegisterFlowController.ts`)
const createView = read(`${registerDirectory}RegisterCreateView.tsx`)
const signInView = read(`${registerDirectory}RegisterSignInView.tsx`)
const phoneEntry = read(`${registerDirectory}RegisterPhoneEntry.tsx`)
const otpEntry = read(`${registerDirectory}RegisterOtpEntry.tsx`)
const modelSource = read("../features/session/registerFlowModel.ts")

test("the Register screen stays a thin composition of the register feature", () => {
  assert.match(source, /const register = useRegisterFlowController\(\{/)
  assert.match(source, /const layout = useRegisterLayout\(\)/)
  assert.match(source, /if \(authIntent === "create"\) \{\s*return \(\s*<RegisterCreateView/)
  assert.match(source, /<RegisterSignInView/)
  assert.doesNotMatch(source, /useState|StyleSheet\.create|<TextInput/)
})

test("typing in registration does not recreate the animated world hero", () => {
  assert.match(
    createView,
    /const worldHero = useMemo\(\s*\(\) => <RegisterWorldHero active=\{motionActive && !isCodeStep\} \/>,\s*\[motionActive, isCodeStep\]\s*\)/
  )
  assert.match(createView, /<Animated\.View style=\{\[styles\.createCharacterScene, handoffEntrance\]\}>[\s\S]*?\{worldHero\}/)
})

test("OTP keystrokes reuse phone analysis and country lookup until phone or country changes", () => {
  assert.match(
    controller,
    /const phoneAnalysis = useMemo\(\s*\(\) => analyzeFormattedLocalPhoneNumber\(flow\.phoneNumber, flow\.selectedCountry\),\s*\[flow\.phoneNumber, flow\.selectedCountry\]\s*\)/
  )
  assert.match(
    controller,
    /getRegisterFlowAvailabilityFromPhoneAnalysis\(\s*\{ stage: flow\.stage, verificationCode: flow\.verificationCode \},\s*busy,\s*phoneAnalysis\s*\)[\s\S]*?\[busy, flow\.stage, flow\.verificationCode, phoneAnalysis\]/
  )
  assert.match(
    controller,
    /const selectedCountry = useMemo\([\s\S]*?\[flow\.selectedCountry\]\s*\)/
  )
})

test("phone keystrokes format once and analyze the formatted value without formatting again", () => {
  assert.match(
    controller,
    /const phoneAnalysis = useMemo\(\s*\(\) => analyzeFormattedLocalPhoneNumber\(flow\.phoneNumber, flow\.selectedCountry\),\s*\[flow\.phoneNumber, flow\.selectedCountry\]\s*\)/
  )
  // One shared handler formats the value; both Register layouts route the
  // phone field through it.
  assert.equal([...controller.matchAll(/updateRegisterPhone\(current, value\)/g)].length, 1)
  assert.match(
    controller,
    /const handlePhoneChange = \(value: string\): void => \{\s*setFlow\(\(current\) => updateRegisterPhone\(current, value\)\)\s*clearInputFeedback\(true\)\s*\}/
  )
  assert.match(phoneEntry, /onChangeText=\{onPhoneChange\}/)
  for (const view of [createView, signInView]) {
    assert.equal([...view.matchAll(/onPhoneChange=\{register\.handlePhoneChange\}/g)].length, 1)
  }

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
    controller,
    /const clearInputFeedback = \(clearSmsNotice = false\): void => \{\s*if \(attemptedPrimaryAction\) setAttemptedPrimaryAction\(false\)\s*if \(clearSmsNotice && smsNotice !== null\) setSmsNotice\(null\)\s*if \(errorMessage !== null\) onClearError\(\)\s*\}/
  )
  // The OTP handler clears feedback but keeps the SMS notice; the phone
  // handler clears both. Each Register layout wires both fields to them.
  assert.equal([...controller.matchAll(/clearInputFeedback\(\)/g)].length, 1)
  assert.equal([...controller.matchAll(/clearInputFeedback\(true\)/g)].length, 1)
  assert.match(
    controller,
    /const handleCodeChange = \(value: string\): void => \{\s*setFlow\(\(current\) => updateRegisterCode\(current, value\)\)\s*clearInputFeedback\(\)\s*\}/
  )
  assert.match(otpEntry, /onChangeText=\{onCodeChange\}/)
  for (const view of [createView, signInView]) {
    assert.equal([...view.matchAll(/onCodeChange=\{register\.handleCodeChange\}/g)].length, 1)
  }
})
