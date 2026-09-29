import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = readFileSync(
  resolve(mobileRoot, "src/features/session/OnboardingBrandPrelude.tsx"),
  "utf8"
)

test("the welcome home scene changes only the first CTA screen", () => {
  assert.match(source, /<OnboardingWelcomeHomeScene/)
  assert.match(source, /<OnboardingGreetingPair/)
  assert.match(source, /greetingActive=\{greetingPairActive\}/)
  assert.match(
    source,
    /styles\.homeSceneLayer, \{\s*opacity: homeExit\.interpolate\(\{\s*inputRange: \[0, 1\],\s*outputRange: \[1, 0\]/
  )
  assert.match(source, /styles\.greetingPairLayer/)
})
