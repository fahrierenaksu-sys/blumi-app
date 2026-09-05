export const ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION =
  "room-v3-shell-artifact-receipt-v1" as const

export const ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID =
  "room-v3-shell-promotion-artifact-verifier-v1" as const

export const ROOM_V3_ACTIVE_MASTER_ASSET_SHA256 =
  "sha256:c1e9fd13e18a5341dc0df76656d07ea70733ffccaf6762029e3e7080ece597b4" as const

export interface RoomV3ShellArtifactReceiptEntry {
  readonly shellId: string
  readonly assetKey: string
  readonly assetSha256: string
  readonly sourceProvenanceId: string
  readonly geometryOverlayEvidenceId: string
  readonly simulatorEvidenceId: string
  readonly producerEvidenceId: string
  readonly independentReviewerEvidenceId: string
}

export interface RoomV3ShellArtifactReceipt {
  readonly schemaVersion: typeof ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION
  readonly verifierId: typeof ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID
  readonly buildIdentity: string
  readonly artifactRegistrySha256: string
  readonly evidenceBundleSha256: string
  readonly masterGeometryId: string
  readonly masterAssetSha256: string
  readonly approvedShells: readonly RoomV3ShellArtifactReceiptEntry[]
}

export function isTrustedRoomV3ShellArtifactReceipt(
  value: unknown
): value is RoomV3ShellArtifactReceipt {
  if (!isRecord(value)) return false
  if (
    value.schemaVersion !== ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION ||
    value.verifierId !== ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID ||
    !isImmutableGitBuildIdentity(value.buildIdentity) ||
    !isSha256Digest(value.artifactRegistrySha256) ||
    !isSha256Digest(value.evidenceBundleSha256) ||
    !hasText(value.masterGeometryId) ||
    value.masterAssetSha256 !== ROOM_V3_ACTIVE_MASTER_ASSET_SHA256 ||
    !Array.isArray(value.approvedShells) ||
    value.approvedShells.length === 0
  ) {
    return false
  }

  const seenShellIds = new Set<string>()
  for (const entry of value.approvedShells) {
    if (!isRecord(entry)) return false
    if (
      !isShellId(entry.shellId) ||
      seenShellIds.has(entry.shellId) ||
      !hasText(entry.assetKey) ||
      !isSha256Digest(entry.assetSha256) ||
      !hasText(entry.sourceProvenanceId) ||
      !hasText(entry.geometryOverlayEvidenceId) ||
      !hasText(entry.simulatorEvidenceId) ||
      !hasText(entry.producerEvidenceId) ||
      !hasText(entry.independentReviewerEvidenceId)
    ) {
      return false
    }
    seenShellIds.add(entry.shellId)
  }

  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isImmutableGitBuildIdentity(value: unknown): value is string {
  return typeof value === "string" && /^git:[a-f0-9]{40}$/.test(value)
}

function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
}

function isShellId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^room_v3_shell_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)
  )
}
