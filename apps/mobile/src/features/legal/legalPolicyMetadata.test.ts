import assert from "node:assert/strict"
import test from "node:test"
import {
  assertLegalReleaseReady,
  LEGAL_HOSTED_PAGE_URLS,
  LEGAL_REQUIRED_MARKER
} from "./legalPolicyMetadata"

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
      serializedDocuments: "effective legal content"
    }),
    /hosted legal copy/i
  )
})
