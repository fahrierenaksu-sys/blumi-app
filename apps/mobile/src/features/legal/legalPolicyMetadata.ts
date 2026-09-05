export const LEGAL_DOCUMENT_VERSION = "2026.08.31"
export const LEGAL_EFFECTIVE_DATE = "31 August 2026"
export const LEGAL_EFFECTIVE_DATE_TR = "31 Ağustos 2026"

export const LEGAL_REQUIRED_MARKER = "[REQUIRED BEFORE RELEASE"

export interface LegalOperatorIdentity {
  legalName: string
  registeredAddress: string
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
  legalName: "Xavier Ballesteros",
  registeredAddress: "Montreal, Quebec, Canada",
  privacyContact: "privacy@blumi.io",
  legalContact: "legal@blumi.io",
  supportUrl: "https://www.blumi.io/support"
})

export const LEGAL_HOSTED_PAGE_URLS: Readonly<LegalHostedPageUrls> = Object.freeze({
  privacyUrl: "https://www.blumi.io/legal/privacy",
  termsUrl: "https://www.blumi.io/legal/terms",
  communityUrl: "https://www.blumi.io/legal/child-safety",
  supportUrl: "https://www.blumi.io/support",
  deleteAccountUrl: "https://www.blumi.io/legal/delete-account"
})

export const LEGAL_ACCEPTANCE_CAPTURE_MODE = "server_recorded" as const
export const LEGAL_HOSTED_COPY_ALIGNMENT = "update-required" as const

export const LEGAL_RELEASE_REQUIREMENTS = Object.freeze([
  "Provide a verified operator legal name and a real contact address in every published legal surface.",
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
    identity.registeredAddress,
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
