import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const registerDirectory = resolve(mobileRoot, "src/features/session/register")
const readRegister = (fileName) =>
  readFileSync(resolve(registerDirectory, fileName), "utf8")
const createView = readRegister("RegisterCreateView.tsx")
const signInView = readRegister("RegisterSignInView.tsx")
const layoutHook = readRegister("useRegisterLayout.ts")
const shell = readFileSync(
  resolve(mobileRoot, "src/features/session/setupFlow/BlumiSetupShell.tsx"),
  "utf8"
)

test("create-account phone entry collapses its hero cleanly for the keyboard", () => {
  assert.match(createView, /<BlumiSetupShell[\s\S]*collapseStageOnKeyboard/)
  assert.match(shell, /collapseStageOnKeyboard\?: boolean/)
  assert.match(shell, /collapseStageOnKeyboard && keyboardVisible/)
  assert.match(shell, /scrollTo\(\{ y: 0, animated: false \}\)/)
  assert.match(shell, /ref=\{scrollRef\}/)
  // With the keyboard open the scroll content always clears the primary action.
  assert.match(shell, /const keyboardBottomPadding =\s*metrics\.primaryActionHeight/)
  assert.match(
    shell,
    /const scrollContentBottomPadding = keyboardVisible\s*\?\s*keyboardBottomPadding\s*:\s*scrollBottomInset \?\? keyboardBottomPadding/
  )
  assert.match(shell, /paddingBottom:\s*scrollContentBottomPadding/)
  assert.match(shell, /backgroundColor: uiTheme\.colors\.backgroundWarm/)
  assert.match(layoutHook, /const setupMetrics = getSetupLayoutMetrics\(/)
  assert.match(layoutHook, /useWindowDimensions\(\)/)
  assert.match(createView, /const \{ setupMetrics \} = layout/)
  assert.match(signInView, /setupMetrics\.dense \? styles\.formCardCompact : null/)
  assert.match(createView, /setupMetrics\.dense \? styles\.footerAreaCompact : null/)
  assert.match(createView, /setupMetrics\.compact \? styles\.legalRowWrapped : null/)

  assert.doesNotMatch(
    createView,
    /styles\.privacyRow/,
    "the create card should end at its legal links"
  )
})
