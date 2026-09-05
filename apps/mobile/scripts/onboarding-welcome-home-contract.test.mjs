import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { resolve } from "node:path"

const source = readFileSync(
  resolve("src/features/session/OnboardingBrandPrelude.tsx"),
  "utf8"
)

test("the welcome home scene changes only the first CTA screen", () => {
  assert.match(source, /<OnboardingWelcomeHomeScene/)
  assert.match(source, /greetingActive=\{false\}/)
  assert.match(source, /<OnboardingGreetingPair/)
  assert.match(source, /greetingActive=\{greetingPairActive\}/)
  assert.match(source, /outputRange: \[1, 0\]/)
  assert.match(source, /styles\.greetingPairLayer/)
})
