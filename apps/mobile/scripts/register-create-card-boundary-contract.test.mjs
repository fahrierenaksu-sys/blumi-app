import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const registerDirectory = resolve(mobileRoot, "src/features/session/register")
const register = readFileSync(
  resolve(mobileRoot, "src/screens/RegisterScreen.tsx"),
  "utf8"
)
const createView = readFileSync(resolve(registerDirectory, "RegisterCreateView.tsx"), "utf8")

// The create-account card is the create view plus every register component
// it renders, so a banned section cannot hide inside a child component.
const createCardComponents = [...createView.matchAll(/from "\.\/(Register\w+|AccountRecovery\w+)"/g)]
  .map((match) => resolve(registerDirectory, `${match[1]}.tsx`))
  .filter((path) => existsSync(path))
const createBranch = [createView, ...createCardComponents.map((path) => readFileSync(path, "utf8"))]
  .join("\n")

test("create-account card ends at the privacy and terms links", () => {
  assert.match(register, /if \(authIntent === "create"\) \{\s*return \(\s*<RegisterCreateView/)
  assert.ok(createCardComponents.length > 0)
  assert.match(createView, /<RegisterLegalLinks/)
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
  assert.doesNotMatch(createView, /RegisterSignInView|AccountRecoveryModal/)
})
