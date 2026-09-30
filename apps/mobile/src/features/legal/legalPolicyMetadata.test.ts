import assert from "node:assert/strict"
import test from "node:test"
import {
  assertLegalReleaseReady,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_HOSTED_PAGE_URLS,
  LEGAL_OPERATOR_IDENTITY,
  LEGAL_REQUIRED_MARKER
} from "./legalPolicyMetadata"

test("legal metadata identifies the individual operator and the chosen publication host", () => {
  assert.equal(LEGAL_DOCUMENT_VERSION, "2026.09.28-r3")
  assert.equal(LEGAL_OPERATOR_IDENTITY.legalName, "Fahri Eren Aksu")
  assert.equal(LEGAL_OPERATOR_IDENTITY.operatingCountry, "Türkiye")
  assert.equal(LEGAL_OPERATOR_IDENTITY.privacyContact, "cesikeynn19077@hotmail.com")
  assert.equal(LEGAL_OPERATOR_IDENTITY.legalContact, "cesikeynn19077@hotmail.com")
  assert.ok(Object.values(LEGAL_HOSTED_PAGE_URLS).every((url) =>
    new URL(url).hostname === "www.agentsworkerplus.online"
  ))
})

test("legal release guard blocks a production binary with unresolved operator facts", () => {
  assert.throws(
    () => assertLegalReleaseReady({
      buildProfile: "production",
      serializedDocuments: LEGAL_REQUIRED_MARKER
    }),
    /legal release is blocked/i
  )
})

test("legal release guard permits non-production document review", () => {
  assert.doesNotThrow(() => assertLegalReleaseReady({
    buildProfile: "development",
    serializedDocuments: LEGAL_REQUIRED_MARKER
  }))
})

test("legal release guard permits production when publication evidence is complete", () => {
  assert.doesNotThrow(() => assertLegalReleaseReady({
    buildProfile: "production",
    serializedDocuments: "effective legal content",
    hostedCopyAlignment: "aligned"
  }))
})

test("legal release guard blocks device-only acceptance capture", () => {
  assert.throws(
    () => assertLegalReleaseReady({
      buildProfile: "production",
      serializedDocuments: "effective legal content",
      acceptanceCaptureMode: "device_only",
      hostedCopyAlignment: "aligned"
    }),
    /server-recorded/i
  )
})

test("legal release guard blocks an incomplete hosted page set", () => {
  assert.throws(
    () => assertLegalReleaseReady({
      buildProfile: "production",
      serializedDocuments: "effective legal content",
      hostedPages: {
        ...LEGAL_HOSTED_PAGE_URLS,
        privacyUrl: ""
      },
      hostedCopyAlignment: "aligned"
    }),
    /hosted legal pages/i
  )
})

test("legal release guard blocks stale hosted product copy", () => {
  assert.throws(
    () => assertLegalReleaseReady({
      buildProfile: "production",
      serializedDocuments: "effective legal content",
      hostedCopyAlignment: "update-required"
    }),
    /hosted legal copy/i
  )
})

test("current hosted publication evidence permits production legal preflight", () => {
  assert.doesNotThrow(() => assertLegalReleaseReady({
    buildProfile: "production",
    serializedDocuments: "effective legal content"
  }))
})
