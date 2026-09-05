import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = readFileSync(
  resolve(mobileRoot, "src/screens/RegisterCharacterHero.tsx"),
  "utf8"
)

test("register hero preserves the canonical pair and gives each character its own entrance", () => {
  assert.match(source, /ONBOARDING_MALE_HERO_FRAME/)
  assert.match(source, /ONBOARDING_HERO_FRAME/)
  assert.match(source, /maleEntrance/)
  assert.match(source, /femaleEntrance/)
  assert.match(source, /delay:\s*120/)
  assert.match(source, /delay:\s*210/)
})

test("register hero keeps the reference hierarchy and accessible reduced-motion path", () => {
  const bubbleIndex = source.indexOf("AnimatedMessageBubble")
  const pairIndex = source.indexOf("AnimatedCharacterPair")
  const copyIndex = source.indexOf("AnimatedCopy")

  assert.ok(bubbleIndex >= 0 && bubbleIndex < pairIndex)
  assert.ok(pairIndex < copyIndex)
  assert.match(source, /accessibilityLabel={message}/)
  assert.match(source, /accessibilityRole="header"/)
  assert.match(source, /useReducedMotion/)
  assert.match(source, /importantForAccessibility="no-hide-descendants"/)
  assert.equal(
    [...source.matchAll(/duration:\s*reduceMotion \? 0 :/g)].length,
    4
  )
  assert.match(source, /compact \? styles\.messageBubbleCompact : null/)
  assert.match(source, /compact \? styles\.characterPairCompact : null/)
  assert.match(source, /compact \? styles\.bodyCompact : null/)
})

test("register hero remains token-driven and adds no alternate character art", () => {
  assert.match(source, /uiTheme\.colors\.surfaceRaised/)
  assert.match(source, /uiTheme\.colors\.borderStrong/)
  assert.doesNotMatch(source, /require\([^)]*\.(?:png|webp|jpg)/)
  assert.deepEqual(source.match(/source=\{[^}]+\}/g), [
    "source={ONBOARDING_MALE_HERO_FRAME}",
    "source={ONBOARDING_HERO_FRAME}"
  ])
})
