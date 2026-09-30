export const LEGAL_DOCUMENT_VERSION = "2026.09.28-r3"
export const LEGAL_EFFECTIVE_DATE = "28 September 2026"
export const LEGAL_EFFECTIVE_DATE_TR = "28 Eylül 2026"

export const LEGAL_REQUIRED_MARKER = "[REQUIRED BEFORE RELEASE"

export interface LegalOperatorIdentity {
  legalName: string
  operatingCountry: string
  privacyContact: string
  legalContact: string
  supportUrl: string
}

export interface LegalHostedPageUrls {
  privacyUrl: string
  termsUrl: string
  communityUrl: string
  supportUrl: string
  deleteAccountUrl: string
}

export const LEGAL_OPERATOR_IDENTITY: Readonly<LegalOperatorIdentity> = Object.freeze({
  legalName: "Fahri Eren Aksu",
  operatingCountry: "Türkiye",
  privacyContact: "cesikeynn19077@hotmail.com",
  legalContact: "cesikeynn19077@hotmail.com",
  supportUrl: "https://www.agentsworkerplus.online/blumi/support"
})

export const LEGAL_HOSTED_PAGE_URLS: Readonly<LegalHostedPageUrls> = Object.freeze({
  privacyUrl: "https://www.agentsworkerplus.online/blumi/legal/privacy",
  termsUrl: "https://www.agentsworkerplus.online/blumi/legal/terms",
  communityUrl: "https://www.agentsworkerplus.online/blumi/legal/child-safety",
  supportUrl: "https://www.agentsworkerplus.online/blumi/support",
  deleteAccountUrl: "https://www.agentsworkerplus.online/blumi/legal/delete-account"
})

export const LEGAL_ACCEPTANCE_CAPTURE_MODE = "server_recorded" as const
// 2026-09-30: all five hosted routes in tr/en returned HTTP 200 and matched
// build-legal-pages.mjs output byte-for-byte (main 19b6ff3b).
export const LEGAL_HOSTED_COPY_ALIGNMENT = "aligned" as const

export const LEGAL_RELEASE_REQUIREMENTS = Object.freeze([
  "Provide a verified operator legal name, country and working contact method in every published legal surface.",
  "Keep the privacy notice separate from Terms consent and record the accepted Terms version, locale, server timestamp, and account identifier.",
  "Keep live HTTPS privacy, terms, community, support, and account-deletion pages aligned with the in-app copy."
])

function isMissingIdentityValue(value: string): boolean {
  return value.trim().length === 0 || value.includes(LEGAL_REQUIRED_MARKER)
}

function hasCompleteHostedPageSet(urls: Readonly<LegalHostedPageUrls>): boolean {
  return Object.values(urls).every((url) => /^https:\/\/\S+$/i.test(url))
}

export function getLegalReleaseBlockers(
  serializedDocuments: string,
  identity: Readonly<LegalOperatorIdentity> = LEGAL_OPERATOR_IDENTITY,
  evidence: {
    acceptanceCaptureMode?: "device_only" | "server_recorded"
    hostedPages?: Readonly<LegalHostedPageUrls>
    hostedCopyAlignment?: "aligned" | "update-required"
  } = {}
): readonly string[] {
  const missingIdentity = [
    identity.legalName,
    identity.operatingCountry,
    identity.privacyContact,
    identity.legalContact,
    identity.supportUrl
  ].some(isMissingIdentityValue)
  const unresolvedMarkers = serializedDocuments.includes(LEGAL_REQUIRED_MARKER)
  const acceptanceCaptureMode =
    evidence.acceptanceCaptureMode ?? LEGAL_ACCEPTANCE_CAPTURE_MODE
  const hostedPages = evidence.hostedPages ?? LEGAL_HOSTED_PAGE_URLS
  const hostedCopyAlignment =
    evidence.hostedCopyAlignment ?? LEGAL_HOSTED_COPY_ALIGNMENT

  return Object.freeze([
    ...(missingIdentity || unresolvedMarkers
      ? ["Operator identity or contact details are incomplete; legal publication is blocked."]
      : []),
    ...(acceptanceCaptureMode !== "server_recorded"
      ? ["Terms acceptance capture is not server-recorded."]
      : []),
    ...(!hasCompleteHostedPageSet(hostedPages)
      ? ["One or more required hosted legal pages are missing HTTPS URLs."]
      : []),
    ...(hostedCopyAlignment !== "aligned"
      ? ["Hosted legal copy does not yet match the current Blumi product and in-app documents."]
      : [])
  ])
}

export function assertLegalReleaseReady(input: {
  buildProfile: string
  serializedDocuments: string
  identity?: Readonly<LegalOperatorIdentity>
  acceptanceCaptureMode?: "device_only" | "server_recorded"
  hostedPages?: Readonly<LegalHostedPageUrls>
  hostedCopyAlignment?: "aligned" | "update-required"
}): void {
  if (input.buildProfile !== "production") return

  const blockers = getLegalReleaseBlockers(
    input.serializedDocuments,
    input.identity ?? LEGAL_OPERATOR_IDENTITY,
    {
      acceptanceCaptureMode: input.acceptanceCaptureMode,
      hostedPages: input.hostedPages,
      hostedCopyAlignment: input.hostedCopyAlignment
    }
  )
  if (blockers.length > 0) {
    throw new Error(`Blumi legal release is blocked: ${blockers.join(" ")}`)
  }
}
