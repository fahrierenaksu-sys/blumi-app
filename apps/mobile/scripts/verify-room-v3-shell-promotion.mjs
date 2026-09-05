#!/usr/bin/env node

import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { readFile, stat, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

import {
  REPOSITORY_ROOT,
  verifyRoomV3ShellAssets
} from "./verify-room-v3-shell-assets.mjs"
import { getCanonicalUniversalCoreIds } from "./verify-room-v3-universal-core-assets.mjs"

export const ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION =
  "room-v3-shell-artifact-receipt-v1"
export const ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID =
  "room-v3-shell-promotion-artifact-verifier-v1"

const LOCKED_MASTER_GEOMETRY_ID = "room_v2_shell_blumi_world_v1"
const LOCKED_MASTER_SHA256 =
  "c1e9fd13e18a5341dc0df76656d07ea70733ffccaf6762029e3e7080ece597b4"
const LOCKED_PERSPECTIVE_PROFILE = "my-room-locked-2.5d-v1"
const EXPECTED_NATIVE_TEST =
  "BlumiMobileUITests/testSixRoomV3ShellCandidatesRenderWithFurnishedMyRoom()"
const EXPECTED_NATIVE_VIEWPORT = { width: 750, height: 1334 }
const EXPECTED_SHELL_COUNT = 6

export const DEFAULT_EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-28-six-shell-prototype-current"
)
export const DEFAULT_REPORT_PATH = resolve(
  DEFAULT_EVIDENCE_ROOT,
  "promotion_verification_report.json"
)

const execFileAsync = promisify(execFile)

export async function verifyRoomV3ShellPromotion({
  repositoryRoot = REPOSITORY_ROOT,
  evidenceRoot = DEFAULT_EVIDENCE_ROOT,
  artifactReport,
  gitState
} = {}) {
  const issues = new Set()
  const evidenceFiles = new Map()
  const resolvedRepositoryRoot = resolve(repositoryRoot)
  const resolvedEvidenceRoot = resolve(evidenceRoot)
  const resolvedGitState = gitState ?? await inspectGitState(resolvedRepositoryRoot)
  const headSha = normalizeGitSha(resolvedGitState?.headSha)
  const buildIdentity = headSha ? `git:${headSha}` : null

  if (!headSha) issues.add("invalid_git_head")
  if (
    resolvedGitState?.isClean !== true ||
    (resolvedGitState?.statusEntries?.length ?? 0) > 0
  ) {
    issues.add("dirty_worktree")
  }

  let freshArtifactReport = artifactReport
  try {
    freshArtifactReport ??= await verifyRoomV3ShellAssets()
  } catch {
    issues.add("artifact_verification_failed")
  }
  validateFreshArtifactReport(freshArtifactReport, issues)

  const registry = await readJsonEvidence(
    resolvedEvidenceRoot,
    "shell_artifact_registry.json",
    "artifact_registry",
    issues,
    evidenceFiles
  )
  const assetManifest = await readJsonEvidence(
    resolvedEvidenceRoot,
    "asset_manifest.json",
    "asset_manifest",
    issues,
    evidenceFiles
  )
  const sourceLedger = await readJsonEvidence(
    resolvedEvidenceRoot,
    "source_reference_ledger.json",
    "source_reference_ledger",
    issues,
    evidenceFiles
  )
  const continuityBible = await readJsonEvidence(
    resolvedEvidenceRoot,
    "continuity_bible.json",
    "continuity_bible",
    issues,
    evidenceFiles
  )
  const nativeManifest = await readJsonEvidence(
    resolvedEvidenceRoot,
    "native-furnished-raw/manifest.json",
    "native_manifest",
    issues,
    evidenceFiles
  )
  const producerEvidence = await readTextEvidence(
    resolvedEvidenceRoot,
    "evidence.md",
    "producer_evidence",
    issues,
    evidenceFiles
  )
  const reviewReceipt = await readJsonEvidence(
    resolvedEvidenceRoot,
    "independent_review_receipt.json",
    "independent_review_receipt",
    issues,
    evidenceFiles
  )
  const fullCatalogCompatibility = await readJsonEvidence(
    resolvedEvidenceRoot,
    "full_catalog_shell_compatibility_manifest.json",
    "full_catalog_shell_compatibility_manifest",
    issues,
    evidenceFiles
  )

  validateRegistryMatchesFreshReport(registry, freshArtifactReport, issues)
  validateTopLevelEvidence(
    assetManifest,
    sourceLedger,
    continuityBible,
    producerEvidence,
    freshArtifactReport,
    issues
  )
  let canonicalFurnitureIds = []
  try {
    canonicalFurnitureIds = await getCanonicalUniversalCoreIds()
  } catch {
    issues.add("canonical_furniture_inventory_unavailable")
  }
  const fullCatalogInspection = await inspectFullCatalogShellCoverage(
    fullCatalogCompatibility,
    freshArtifactReport,
    canonicalFurnitureIds,
    resolvedEvidenceRoot,
    issues,
    evidenceFiles
  )

  const shellEvidence = await inspectShellEvidence({
    repositoryRoot: resolvedRepositoryRoot,
    evidenceRoot: resolvedEvidenceRoot,
    artifactReport: freshArtifactReport,
    assetManifest,
    nativeManifest,
    sourceLedger,
    issues,
    evidenceFiles
  })

  const artifactRegistrySha256 = evidenceFiles.get("shell_artifact_registry.json")
    ?.sha256 ?? null
  validateIndependentReview({
    reviewReceipt,
    reviewReceiptSha256: evidenceFiles.get("independent_review_receipt.json")
      ?.sha256 ?? null,
    artifactRegistrySha256,
    buildIdentity,
    shellEvidence,
    fullCatalogManifestSha256: evidenceFiles.get(
      "full_catalog_shell_compatibility_manifest.json"
    )?.sha256 ?? null,
    fullCatalogCaptureCount: fullCatalogInspection.captureCount,
    issues
  })

  const evidenceBundleSha256 = sha256Text(JSON.stringify({
    schemaVersion: ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION,
    verifierId: ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
    buildIdentity,
    files: [...evidenceFiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, inspection]) => ({ path, sha256: inspection.sha256 }))
  }))

  const issueIds = [...issues]
  const receipt = issueIds.length === 0 && buildIdentity && artifactRegistrySha256
    ? {
        schemaVersion: ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION,
        verifierId: ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
        buildIdentity,
        artifactRegistrySha256,
        evidenceBundleSha256,
        masterGeometryId: LOCKED_MASTER_GEOMETRY_ID,
        masterAssetSha256: `sha256:${LOCKED_MASTER_SHA256}`,
        approvedShells: shellEvidence.map((entry) => ({
          shellId: entry.shellId,
          assetKey: entry.assetKey,
          assetSha256: entry.assetSha256,
          sourceProvenanceId: entry.sourceProvenanceId,
          geometryOverlayEvidenceId:
            `${artifactRegistrySha256}#${entry.shellId}`,
          simulatorEvidenceId: entry.nativeEvidenceSha256,
          producerEvidenceId: evidenceFiles.get("evidence.md").sha256,
          independentReviewerEvidenceId:
            evidenceFiles.get("independent_review_receipt.json").sha256
        }))
      }
    : null

  return {
    verifierId: ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
    buildIdentity,
    promotionEligible: receipt !== null,
    issueIds,
    artifactRegistrySha256,
    evidenceBundleSha256,
    inspectedShellCount: shellEvidence.length,
    receipt
  }
}

export async function writeRoomV3ShellPromotionVerificationReport(
  outputPath = DEFAULT_REPORT_PATH,
  options = {}
) {
  const report = await verifyRoomV3ShellPromotion(options)
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

async function inspectGitState(repositoryRoot) {
  try {
    const [{ stdout: head }, { stdout: statusOutput }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }),
      execFileAsync(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=all"],
        { cwd: repositoryRoot, maxBuffer: 20 * 1024 * 1024 }
      )
    ])
    const statusEntries = statusOutput
      .split("\n")
      .map((entry) => entry.trimEnd())
      .filter(Boolean)
    return {
      headSha: head.trim(),
      isClean: statusEntries.length === 0,
      statusEntries
    }
  } catch {
    return { headSha: null, isClean: false, statusEntries: ["git_inspection_failed"] }
  }
}

function validateFreshArtifactReport(report, issues) {
  if (
    !isRecord(report) ||
    report.shellCount !== EXPECTED_SHELL_COUNT ||
    report.isGeometryValid !== true ||
    report.isArtifactValid !== true ||
    !Array.isArray(report.issueIds) ||
    report.issueIds.length > 0 ||
    !isRecord(report.master) ||
    report.master.sha256 !== LOCKED_MASTER_SHA256 ||
    !Array.isArray(report.shells) ||
    report.shells.length !== EXPECTED_SHELL_COUNT ||
    report.shells.some((shell) =>
      !isRecord(shell) ||
      shell.lockedGeometry !== "PASS" ||
      shell.opaqueNearBlackEdgePixelCount !== 0 ||
      !Array.isArray(shell.issueIds) ||
      shell.issueIds.length > 0 ||
      !isBareSha256(shell.sha256)
    )
  ) {
    issues.add("invalid_fresh_artifact_report")
  }
}

function validateRegistryMatchesFreshReport(registry, fresh, issues) {
  if (!isRecord(registry) || !isRecord(fresh)) return
  const registrySnapshot = artifactSnapshot(registry)
  const freshSnapshot = artifactSnapshot(fresh)
  if (!registrySnapshot || !freshSnapshot || registrySnapshot !== freshSnapshot) {
    issues.add("artifact_registry_drift")
  }
}

function artifactSnapshot(value) {
  if (!isRecord(value) || !isRecord(value.master) || !Array.isArray(value.shells)) {
    return null
  }
  return JSON.stringify({
    verifierVersion: value.verifierVersion,
    master: {
      path: value.master.path,
      sha256: value.master.sha256,
      canvasSize: value.master.canvasSize,
      alphaMaskSha256: value.master.alphaMaskSha256
    },
    shells: value.shells.map((shell) => isRecord(shell) ? {
      id: shell.id,
      path: shell.path,
      sha256: shell.sha256,
      canvasSize: shell.canvasSize,
      alphaMaskSha256: shell.alphaMaskSha256,
      opaqueNearBlackEdgePixelCount: shell.opaqueNearBlackEdgePixelCount,
      lockedGeometry: shell.lockedGeometry,
      issueIds: shell.issueIds
    } : null),
    issueIds: value.issueIds,
    geometryIssueIds: value.geometryIssueIds,
    isGeometryValid: value.isGeometryValid,
    isArtifactValid: value.isArtifactValid
  })
}

function validateTopLevelEvidence(
  assetManifest,
  sourceLedger,
  continuityBible,
  producerEvidence,
  artifactReport,
  issues
) {
  if (
    !isRecord(assetManifest) ||
    assetManifest.project_id !== "blumi-room-v3-six-shell-current" ||
    assetManifest.perspective_profile !== LOCKED_PERSPECTIVE_PROFILE ||
    assetManifest.canonical_master_sha256 !== LOCKED_MASTER_SHA256 ||
    assetManifest.canonical_alpha_sha256 !== artifactReport?.master?.alphaMaskSha256 ||
    !Array.isArray(assetManifest.assets) ||
    assetManifest.assets.length !== EXPECTED_SHELL_COUNT
  ) {
    issues.add("invalid_asset_manifest")
  }
  if (
    !isRecord(sourceLedger) ||
    sourceLedger.project_id !== "blumi-room-v3-six-shell-current" ||
    !Array.isArray(sourceLedger.sources) ||
    !sourceLedger.sources.some((source) =>
      isRecord(source) && source.sha256 === LOCKED_MASTER_SHA256
    )
  ) {
    issues.add("invalid_source_reference_ledger")
  }
  if (
    !isRecord(continuityBible) ||
    continuityBible.project_id !== "blumi-room-v3-six-shell-current"
  ) {
    issues.add("invalid_continuity_bible")
  }
  if (
    typeof producerEvidence !== "string" ||
    !producerEvidence.includes("PASS_CURRENT_RUN")
  ) {
    issues.add("producer_visual_pass_missing")
  }
}

async function inspectFullCatalogShellCoverage(
  manifest,
  artifactReport,
  canonicalFurnitureIds,
  evidenceRoot,
  issues,
  evidenceFiles
) {
  const expectedShellIds = Array.isArray(artifactReport?.shells)
    ? artifactReport.shells
        .filter(isRecord)
        .map((shell) => `room_v3_shell_${shell.id}`)
    : []
  const expectedFurnitureIds = Array.isArray(canonicalFurnitureIds)
    ? canonicalFurnitureIds
    : []
  let isComplete = true

  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !==
      "room-v3-shell-furniture-compatibility-manifest-v1" ||
    manifest.status !== "PASS" ||
    manifest.perspectiveProfile !== LOCKED_PERSPECTIVE_PROFILE ||
    !hasExactStringSet(manifest.shellIds, expectedShellIds) ||
    !hasExactStringSet(manifest.furnitureIds, expectedFurnitureIds) ||
    !Array.isArray(manifest.captures)
  ) {
    isComplete = false
  }

  const coverage = new Set()
  const captureIds = new Set()
  const nativePaths = new Set()
  const rawPaths = new Set()
  const nativePixelDigests = new Set()
  for (const capture of Array.isArray(manifest?.captures) ? manifest.captures : []) {
    if (
      !isRecord(capture) ||
      typeof capture.captureId !== "string" ||
      captureIds.has(capture.captureId) ||
      !expectedShellIds.includes(capture.shellId) ||
      capture.verdict !== "PASS" ||
      !Array.isArray(capture.furnitureIds) ||
      capture.furnitureIds.length === 0 ||
      capture.furnitureIds.length > 8 ||
      new Set(capture.furnitureIds).size !== capture.furnitureIds.length ||
      capture.furnitureIds.some((id) => !expectedFurnitureIds.includes(id)) ||
      typeof capture.nativeEvidencePath !== "string" ||
      nativePaths.has(capture.nativeEvidencePath) ||
      !isSha256Digest(capture.nativeEvidenceSha256) ||
      typeof capture.rawAttachmentPath !== "string" ||
      rawPaths.has(capture.rawAttachmentPath) ||
      !isSha256Digest(capture.rawAttachmentSha256)
    ) {
      isComplete = false
      continue
    }
    captureIds.add(capture.captureId)
    nativePaths.add(capture.nativeEvidencePath)
    rawPaths.add(capture.rawAttachmentPath)
    for (const furnitureId of capture.furnitureIds) {
      coverage.add(`${capture.shellId}:${furnitureId}`)
    }

    const nativePath = safeResolve(evidenceRoot, capture.nativeEvidencePath)
    const rawPath = safeResolve(evidenceRoot, capture.rawAttachmentPath)
    if (
      !nativePath ||
      !capture.nativeEvidencePath.startsWith("full-catalog-native/")
    ) {
      issues.add(`${capture.captureId}:unsafe_compatibility_native_path`)
      isComplete = false
    }
    if (
      !rawPath ||
      !capture.rawAttachmentPath.startsWith("full-catalog-native-raw/")
    ) {
      issues.add(`${capture.captureId}:unsafe_compatibility_raw_path`)
      isComplete = false
    }
    const nativeInspection = nativePath
      ? await inspectPng(
          nativePath,
          capture.nativeEvidencePath,
          issues,
          evidenceFiles,
          `${capture.captureId}:invalid_compatibility_native_evidence`
        )
      : null
    const rawInspection = rawPath
      ? await inspectPng(
          rawPath,
          capture.rawAttachmentPath,
          issues,
          evidenceFiles,
          `${capture.captureId}:invalid_compatibility_raw_attachment`
        )
      : null
    if (nativeInspection?.sha256 !== capture.nativeEvidenceSha256) {
      issues.add(`${capture.captureId}:compatibility_native_sha256_mismatch`)
      isComplete = false
    }
    if (rawInspection?.sha256 !== capture.rawAttachmentSha256) {
      issues.add(`${capture.captureId}:compatibility_raw_sha256_mismatch`)
      isComplete = false
    }
    if (
      nativeInspection?.pixelSha256 &&
      rawInspection?.pixelSha256 &&
      nativeInspection.pixelSha256 !== rawInspection.pixelSha256
    ) {
      issues.add(`${capture.captureId}:compatibility_raw_pixel_mismatch`)
      isComplete = false
    }
    if (nativeInspection?.pixelSha256) {
      if (nativePixelDigests.has(nativeInspection.pixelSha256)) {
        issues.add(`${capture.captureId}:duplicate_compatibility_capture_pixels`)
        isComplete = false
      }
      nativePixelDigests.add(nativeInspection.pixelSha256)
    }
  }

  const expectedCoverageCount = expectedShellIds.length * expectedFurnitureIds.length
  if (
    expectedShellIds.length !== EXPECTED_SHELL_COUNT ||
    expectedFurnitureIds.length !== 45 ||
    coverage.size !== expectedCoverageCount ||
    manifest?.coverageCount !== expectedCoverageCount
  ) {
    isComplete = false
  }

  if (!isComplete) issues.add("incomplete_full_catalog_shell_coverage")
  return {
    captureCount: captureIds.size,
    coverageCount: coverage.size,
    isComplete
  }
}

async function inspectShellEvidence({
  repositoryRoot,
  evidenceRoot,
  artifactReport,
  assetManifest,
  nativeManifest,
  sourceLedger,
  issues,
  evidenceFiles
}) {
  if (
    !Array.isArray(artifactReport?.shells) ||
    !Array.isArray(assetManifest?.assets)
  ) {
    return []
  }
  const manifestAssetsByPath = uniqueMap(assetManifest.assets, "path")
  if (!manifestAssetsByPath) {
    issues.add("duplicate_asset_manifest_path")
    return []
  }
  const nativeAttachments = getNativeAttachments(nativeManifest, issues)
  const sourceIds = new Set(
    Array.isArray(sourceLedger?.sources)
      ? sourceLedger.sources
          .filter(isRecord)
          .map((source) => source.source_id)
          .filter((id) => typeof id === "string")
      : []
  )
  const entries = []
  const nativePixelDigests = new Set()

  for (const shell of artifactReport.shells) {
    if (!isRecord(shell) || typeof shell.id !== "string") continue
    const shellId = `room_v3_shell_${shell.id}`
    const manifestAsset = manifestAssetsByPath.get(shell.path)
    if (!isRecord(manifestAsset)) {
      issues.add(`${shellId}:missing_asset_manifest_entry`)
      continue
    }
    if (
      manifestAsset.sha256 !== shell.sha256 ||
      manifestAsset.status !== "candidate"
    ) {
      issues.add(`${shellId}:asset_manifest_mismatch`)
    }

    const assetPath = safeResolve(repositoryRoot, shell.path)
    const assetInspection = assetPath
      ? await inspectFile(assetPath, `repo:${shell.path}`, issues, evidenceFiles)
      : null
    if (!assetPath) issues.add(`${shellId}:unsafe_asset_path`)
    if (assetInspection?.sha256 !== `sha256:${shell.sha256}`) {
      issues.add(`${shellId}:asset_sha256_mismatch`)
    }

    const nativeRelativePath = manifestAsset.native_evidence
    const nativePath = safeResolve(evidenceRoot, nativeRelativePath)
    if (!nativePath || !String(nativeRelativePath).startsWith("native-furnished/")) {
      issues.add(`${shellId}:unsafe_native_evidence_path`)
    }
    const nativeInspection = nativePath
      ? await inspectPng(
          nativePath,
          String(nativeRelativePath),
          issues,
          evidenceFiles,
          `${shellId}:invalid_native_evidence`
        )
      : null

    const attachment = nativeAttachments.get(shell.id)
    if (!attachment) issues.add(`${shellId}:missing_raw_native_attachment`)
    const rawRelativePath = attachment
      ? `native-furnished-raw/${attachment.exportedFileName}`
      : null
    const rawPath = rawRelativePath ? safeResolve(evidenceRoot, rawRelativePath) : null
    if (!rawPath) {
      issues.add(`${shellId}:unsafe_raw_native_attachment_path`)
    }
    const rawInspection = rawPath
      ? await inspectPng(
          rawPath,
          rawRelativePath,
          issues,
          evidenceFiles,
          `${shellId}:invalid_raw_native_attachment`
        )
      : null

    if (
      nativeInspection?.pixelSha256 &&
      rawInspection?.pixelSha256 &&
      nativeInspection.pixelSha256 !== rawInspection.pixelSha256
    ) {
      issues.add(`${shellId}:raw_pixel_mismatch`)
    }
    if (nativeInspection?.pixelSha256) {
      if (nativePixelDigests.has(nativeInspection.pixelSha256)) {
        issues.add(`${shellId}:duplicate_native_evidence_pixels`)
      }
      nativePixelDigests.add(nativeInspection.pixelSha256)
    }

    const sourceId = typeof manifestAsset.source_asset_id === "string"
      ? manifestAsset.source_asset_id
      : `asset-manifest:${manifestAsset.asset_id}`
    if (
      typeof manifestAsset.source_asset_id === "string" &&
      !sourceIds.has(manifestAsset.source_asset_id)
    ) {
      issues.add(`${shellId}:missing_source_provenance`)
    }

    entries.push({
      shellId,
      assetKey: basename(shell.path, ".png"),
      assetSha256: `sha256:${shell.sha256}`,
      sourceProvenanceId:
        `${evidenceFiles.get("source_reference_ledger.json")?.sha256 ?? "missing"}#${sourceId}`,
      nativeEvidencePath: nativeRelativePath,
      nativeEvidenceSha256: nativeInspection?.sha256 ?? null,
      rawAttachmentPath: rawRelativePath,
      rawAttachmentSha256: rawInspection?.sha256 ?? null
    })
  }

  if (entries.length !== EXPECTED_SHELL_COUNT) {
    issues.add("incomplete_shell_evidence")
  }
  return entries
}

function getNativeAttachments(nativeManifest, issues) {
  const result = new Map()
  if (
    !Array.isArray(nativeManifest) ||
    nativeManifest.length !== 1 ||
    nativeManifest[0]?.testIdentifier !== EXPECTED_NATIVE_TEST ||
    !Array.isArray(nativeManifest[0]?.attachments) ||
    nativeManifest[0].attachments.length !== EXPECTED_SHELL_COUNT
  ) {
    issues.add("invalid_native_attachment_manifest")
    return result
  }
  for (const attachment of nativeManifest[0].attachments) {
    if (
      !isRecord(attachment) ||
      attachment.isAssociatedWithFailure !== false ||
      typeof attachment.exportedFileName !== "string" ||
      basename(attachment.exportedFileName) !== attachment.exportedFileName ||
      typeof attachment.suggestedHumanReadableName !== "string"
    ) {
      issues.add("invalid_native_attachment")
      continue
    }
    const match = attachment.suggestedHumanReadableName.match(
      /^room_shell_([a-z0-9_]+)_furnished_my_room_/
    )
    if (!match || result.has(match[1])) {
      issues.add("invalid_native_attachment_shell_binding")
      continue
    }
    result.set(match[1], attachment)
  }
  return result
}

function validateIndependentReview({
  reviewReceipt,
  reviewReceiptSha256,
  artifactRegistrySha256,
  buildIdentity,
  shellEvidence,
  fullCatalogManifestSha256,
  fullCatalogCaptureCount,
  issues
}) {
  if (!isRecord(reviewReceipt)) return
  if (reviewReceipt.schemaVersion !== "room-v3-shell-independent-review-v1") {
    issues.add("invalid_review_schema")
  }
  if (
    typeof reviewReceipt.reviewerId !== "string" ||
    !reviewReceipt.reviewerId.trim() ||
    reviewReceipt.reviewerId === reviewReceipt.producerId
  ) {
    issues.add("reviewer_not_independent")
  }
  if (reviewReceipt.verdict === "PASS_CURRENT_RUN") {
    // The reviewer accepted the visible/runtime state, but intentionally did
    // not claim that a dirty mutable checkout is a production identity.
    issues.add("immutable_review_binding_required")
  } else if (reviewReceipt.verdict !== "PASS") {
    issues.add("review_verdict_not_pass")
  } else if (
    !buildIdentity ||
    reviewReceipt.reviewedBuildIdentity !== buildIdentity
  ) {
    issues.add("review_build_identity_mismatch")
  }
  if (reviewReceipt.artifactRegistrySha256 !== artifactRegistrySha256) {
    issues.add("review_artifact_registry_mismatch")
  }
  if (
    !isRecord(reviewReceipt.findings) ||
    ["critical", "high", "medium"].some((severity) =>
      !Array.isArray(reviewReceipt.findings[severity]) ||
      reviewReceipt.findings[severity].length > 0
    )
  ) {
    issues.add("unresolved_review_findings")
  }
  if (
    !isRecord(reviewReceipt.fullCatalogCompatibility) ||
    reviewReceipt.fullCatalogCompatibility.verdict !== "PASS" ||
    reviewReceipt.fullCatalogCompatibility.manifestSha256 !==
      fullCatalogManifestSha256 ||
    reviewReceipt.fullCatalogCompatibility.reviewedCaptureCount !==
      fullCatalogCaptureCount
  ) {
    issues.add("review_full_catalog_compatibility_missing")
  }
  const reviewShells = uniqueMap(reviewReceipt.shells, "shellId")
  if (!reviewShells || reviewShells.size !== shellEvidence.length) {
    issues.add("invalid_review_shell_coverage")
    return
  }
  for (const shell of shellEvidence) {
    const reviewed = reviewShells.get(shell.shellId)
    if (!isRecord(reviewed)) {
      issues.add(`${shell.shellId}:missing_review_row`)
      continue
    }
    if (reviewed.verdict !== "PASS") {
      issues.add(`${shell.shellId}:review_verdict_not_pass`)
    }
    if (reviewed.assetSha256 !== shell.assetSha256) {
      issues.add(`${shell.shellId}:review_asset_sha256_mismatch`)
    }
    if (
      reviewed.nativeEvidencePath !== shell.nativeEvidencePath ||
      reviewed.nativeEvidenceSha256 !== shell.nativeEvidenceSha256
    ) {
      issues.add(`${shell.shellId}:review_native_evidence_sha256_mismatch`)
    }
    if (
      reviewed.rawAttachmentPath !== shell.rawAttachmentPath ||
      reviewed.rawAttachmentSha256 !== shell.rawAttachmentSha256
    ) {
      issues.add(`${shell.shellId}:review_raw_attachment_sha256_mismatch`)
    }
  }
  if (!isSha256Digest(reviewReceiptSha256)) {
    issues.add("invalid_review_receipt_sha256")
  }
}

async function readJsonEvidence(
  root,
  relativePath,
  issuePrefix,
  issues,
  evidenceFiles
) {
  const value = await readTextEvidence(
    root,
    relativePath,
    issuePrefix,
    issues,
    evidenceFiles
  )
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    issues.add(`${issuePrefix}_invalid_json`)
    return null
  }
}

async function readTextEvidence(
  root,
  relativePath,
  issuePrefix,
  issues,
  evidenceFiles
) {
  const path = safeResolve(root, relativePath)
  if (!path) {
    issues.add(`${issuePrefix}_unsafe_path`)
    return null
  }
  const inspection = await inspectFile(path, relativePath, issues, evidenceFiles)
  if (!inspection) {
    issues.add(`${issuePrefix}_missing`)
    return null
  }
  return inspection.buffer.toString("utf8")
}

async function inspectFile(path, evidenceKey, issues, evidenceFiles) {
  try {
    const [metadata, buffer] = await Promise.all([stat(path), readFile(path)])
    if (!metadata.isFile()) {
      issues.add(`${evidenceKey}:not_regular_file`)
      return null
    }
    const inspection = { buffer, sha256: sha256Buffer(buffer) }
    evidenceFiles.set(evidenceKey, inspection)
    return inspection
  } catch {
    issues.add(`${evidenceKey}:missing_file`)
    return null
  }
}

async function inspectPng(
  path,
  evidenceKey,
  issues,
  evidenceFiles,
  issuePrefix
) {
  const inspection = await inspectFile(path, evidenceKey, issues, evidenceFiles)
  if (!inspection) return null
  try {
    const [metadata, pixels] = await Promise.all([
      sharp(path).metadata(),
      sharp(path).ensureAlpha().raw().toBuffer()
    ])
    if (
      metadata.format !== "png" ||
      metadata.width !== EXPECTED_NATIVE_VIEWPORT.width ||
      metadata.height !== EXPECTED_NATIVE_VIEWPORT.height
    ) {
      issues.add(issuePrefix)
    }
    return { ...inspection, pixelSha256: sha256Buffer(pixels) }
  } catch {
    issues.add(issuePrefix)
    return inspection
  }
}

function uniqueMap(values, key) {
  if (!Array.isArray(values)) return null
  const result = new Map()
  for (const value of values) {
    if (!isRecord(value) || typeof value[key] !== "string" || result.has(value[key])) {
      return null
    }
    result.set(value[key], value)
  }
  return result
}

function hasExactStringSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value) => typeof value === "string") &&
    new Set(actual).size === actual.length &&
    actual.every((value) => expected.includes(value))
  )
}

function safeResolve(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    !relativePath.trim() ||
    isAbsolute(relativePath)
  ) {
    return null
  }
  const target = resolve(root, relativePath)
  const pathFromRoot = relative(resolve(root), target)
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    return null
  }
  return target
}

function sha256Buffer(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(value, "utf8"))
}

function normalizeGitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value.trim())
    ? value.trim()
    : null
}

function isBareSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function isSha256Digest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const outputPath = process.argv[2] ?? DEFAULT_REPORT_PATH
  const report = await writeRoomV3ShellPromotionVerificationReport(outputPath)
  process.stdout.write(`${JSON.stringify({
    outputPath,
    promotionEligible: report.promotionEligible,
    issueIds: report.issueIds,
    inspectedShellCount: report.inspectedShellCount
  }, null, 2)}\n`)
}
