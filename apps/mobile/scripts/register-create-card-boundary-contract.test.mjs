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

const createBranchStart = register.indexOf('if (authIntent === "create")')
const createBranchEnd = register.indexOf(
  '\n  return (\n    <View style={styles.root}>',
  createBranchStart
)
const createBranch = register.slice(createBranchStart, createBranchEnd)

test("create-account card ends at the privacy and terms links", () => {
  assert.ok(createBranchStart >= 0 && createBranchEnd > createBranchStart)
  assert.match(createBranch, /styles\.footerArea/)
  assert.match(createBranch, /authCopy\.privacy/)
  assert.match(createBranch, /authCopy\.terms/)
  assert.match(
    createBranch,
    /scrollBottomInset=\{0\}/,
    "the create flow must not reserve an extra CTA-height scroll tail"
  )
  assert.doesNotMatch(
    createBranch,
    /taskCardOffsetY=\{[^}]*-[0-9]+[^}]*\}/,
    "the card must preserve the shell gap below the heading instead of overlapping it"
  )
  assert.doesNotMatch(
    createBranch,
    /styles\.privacyRow/,
    "the auxiliary privacy note must not extend the card below its legal links"
  )
})
