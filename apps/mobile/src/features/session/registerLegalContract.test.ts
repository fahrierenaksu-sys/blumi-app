import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

function readRegisterScreen(): string {
  return readFileSync(
    resolve(process.cwd(), "apps/mobile/src/screens/RegisterScreen.tsx"),
    "utf8"
  )
}

test("create-account registration records one combined legal acceptance", () => {
  const source = readRegisterScreen()

  assert.match(source, /termsAccepted/)
  assert.match(source, /LEGAL_DOCUMENT_VERSION/)
  assert.match(source, /const legalRequirementsMet = authIntent === "create"/)
  assert.doesNotMatch(source, /privacyAcknowledged/)
  assert.doesNotMatch(source, /acceptPrivacyNotice/)
  assert.match(source, /authCopy\.acceptTerms/)
  assert.match(source, /authCopy\.termsConsent/)
  assert.match(source, /termsAcceptance:\s*\{\s*version:\s*LEGAL_DOCUMENT_VERSION,\s*locale/s)
})

test("sign-in does not gate phone verification behind legal re-acceptance", () => {
  const source = readRegisterScreen()

  assert.doesNotMatch(source, /authIntent === "sign-in"[\s\S]*authCopy\.termsConsent/s)
  assert.match(source, /const legalRequirementsMet = authIntent === "create"/)
  assert.match(source, /termsAccepted: legalRequirementsMet/)
})
