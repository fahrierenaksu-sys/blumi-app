import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const registerDirectory = resolve(import.meta.dirname, "register")

function readRegisterFile(fileName: string): string {
  return readFileSync(resolve(registerDirectory, fileName), "utf8")
}

function readRegisterSurface(): string {
  const featureSources = readdirSync(registerDirectory)
    .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
    .map(readRegisterFile)
  return [
    readFileSync(resolve(import.meta.dirname, "../../screens/RegisterScreen.tsx"), "utf8"),
    ...featureSources
  ].join("\n")
}

test("create-account registration records one combined legal acceptance", () => {
  const surface = readRegisterSurface()
  const controller = readRegisterFile("useRegisterFlowController.ts")
  const model = readRegisterFile("registerScreenModel.ts")
  const consent = readRegisterFile("RegisterTermsConsent.tsx")
  const createView = readRegisterFile("RegisterCreateView.tsx")

  assert.match(controller, /termsAccepted/)
  assert.match(controller, /LEGAL_DOCUMENT_VERSION/)
  assert.match(model, /const legalRequirementsMet = authIntent === "create"/)
  assert.match(controller, /resolveLegalRequirementsMet\(authIntent, termsAccepted\)/)
  assert.doesNotMatch(surface, /privacyAcknowledged/)
  assert.doesNotMatch(surface, /acceptPrivacyNotice/)
  assert.match(consent, /authCopy\.acceptTerms/)
  assert.match(consent, /authCopy\.termsConsent/)
  assert.match(createView, /<RegisterTermsConsent/)
  assert.equal([...surface.matchAll(/termsAcceptance:/g)].length, 2)
  assert.equal(
    [...controller.matchAll(/termsAcceptance:\s*\{\s*version:\s*LEGAL_DOCUMENT_VERSION,\s*locale/gs)].length,
    2
  )
})

test("sign-in does not gate phone verification behind legal re-acceptance", () => {
  const model = readRegisterFile("registerScreenModel.ts")
  const signInView = readRegisterFile("RegisterSignInView.tsx")

  assert.doesNotMatch(signInView, /RegisterTermsConsent|authCopy\.termsConsent|termsAccepted/)
  assert.match(model, /const legalRequirementsMet = authIntent === "create"/)
  assert.match(model, /termsAccepted: legalRequirementsMet/)
})
