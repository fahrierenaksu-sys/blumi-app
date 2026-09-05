import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const register = readFileSync(
  resolve(mobileRoot, "src/screens/RegisterScreen.tsx"),
  "utf8"
)
const shell = readFileSync(
  resolve(mobileRoot, "src/features/session/setupFlow/BlumiSetupShell.tsx"),
  "utf8"
)

test("create-account phone entry collapses its hero cleanly for the keyboard", () => {
  assert.match(register, /<BlumiSetupShell[\s\S]*collapseStageOnKeyboard/)
  assert.match(shell, /collapseStageOnKeyboard\?: boolean/)
  assert.match(shell, /collapseStageOnKeyboard && keyboardVisible/)
  assert.match(shell, /scrollTo\(\{ y: 0, animated: false \}\)/)
  assert.match(shell, /ref=\{scrollRef\}/)
  assert.match(
    shell,
    /paddingBottom:\s*scrollBottomInset \?\?\s*metrics\.primaryActionHeight/
  )
  assert.match(shell, /backgroundColor: uiTheme\.colors\.backgroundWarm/)
  assert.match(register, /const setupMetrics = getSetupLayoutMetrics\(/)
  assert.match(register, /setupMetrics\.dense \? styles\.formCardCompact : null/)
  assert.match(register, /setupMetrics\.dense \? styles\.footerAreaCompact : null/)
  assert.match(register, /setupMetrics\.compact \? styles\.legalRowWrapped : null/)

  const createBranchStart = register.indexOf('if (authIntent === "create")')
  const createBranchEnd = register.indexOf('\n  return (\n    <View style={styles.root}>', createBranchStart)
  const createBranch = register.slice(createBranchStart, createBranchEnd)
  assert.doesNotMatch(
    createBranch,
    /styles\.privacyRow/,
    "the create card should end at its legal links"
  )
})
