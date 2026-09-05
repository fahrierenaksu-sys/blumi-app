import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import test from "node:test"
import sharp from "sharp"

import {
  REPOSITORY_ROOT,
  verifyRoomV3ShellAssets
} from "./verify-room-v3-shell-assets.mjs"
import { getCanonicalUniversalCoreIds } from "./verify-room-v3-universal-core-assets.mjs"
import {
  ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION,
  ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID,
  verifyRoomV3ShellPromotion
} from "./verify-room-v3-shell-promotion.mjs"

const CLEAN_HEAD = "a".repeat(40)
const CLEAN_BUILD_IDENTITY = `git:${CLEAN_HEAD}`
const artifactReport = await verifyRoomV3ShellAssets()
const canonicalFurnitureIds = await getCanonicalUniversalCoreIds()

async function sha256File(path) {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function createCompleteFixture({ includeFullCatalogCoverage = true } = {}) {
  const evidenceRoot = await mkdtemp(join(tmpdir(), "blumi-shell-promotion-"))
  const nativeRoot = join(evidenceRoot, "native-furnished")
  const rawRoot = join(evidenceRoot, "native-furnished-raw")
  await Promise.all([
    mkdir(nativeRoot, { recursive: true }),
    mkdir(rawRoot, { recursive: true })
  ])

  const registryPath = join(evidenceRoot, "shell_artifact_registry.json")
  await writeJson(registryPath, artifactReport)

  const assets = []
  const attachments = []
  const nativeEvidenceByShellId = new Map()
  const compatibilityEvidenceByCaptureId = new Map()
  let compatibilityManifestSha256 = null
  let compatibilityCaptureCount = 0
  for (const [index, shell] of artifactReport.shells.entries()) {
    const shellId = `room_v3_shell_${shell.id}`
    const friendlyRelativePath = `native-furnished/${shell.id}.png`
    const friendlyPath = join(evidenceRoot, friendlyRelativePath)
    const rawFileName = `${String(index).padStart(2, "0")}-${shell.id}.png`
    const rawPath = join(rawRoot, rawFileName)
    const image = sharp({
      create: {
        width: 750,
        height: 1334,
        channels: 4,
        background: {
          r: 40 + index * 20,
          g: 70 + index * 15,
          b: 100 + index * 10,
          alpha: 1
        }
      }
    }).png()
    await image.toFile(rawPath)
    await sharp(rawPath).png({ compressionLevel: 3 }).toFile(friendlyPath)

    assets.push({
      asset_id: `fixture-${shell.id}`,
      status: "candidate",
      path: shell.path,
      sha256: shell.sha256,
      source_asset_id: `source-${shell.id}`,
      native_evidence: friendlyRelativePath
    })
    attachments.push({
      configurationName: "Test Scheme Action",
      deviceId: "fixture-device-id",
      deviceName: "Blumi Short QA",
      exportedFileName: rawFileName,
      isAssociatedWithFailure: false,
      suggestedHumanReadableName:
        `room_shell_${shell.id}_furnished_my_room_0_fixture.png`,
      timestamp: 1_785_223_824 + index
    })
    nativeEvidenceByShellId.set(shellId, {
      friendlyRelativePath,
      friendlyPath,
      rawFileName,
      rawPath
    })
  }

  await writeJson(join(evidenceRoot, "asset_manifest.json"), {
    project_id: "blumi-room-v3-six-shell-current",
    owner: "Codex primary agent",
    status: "candidate",
    perspective_profile: "my-room-locked-2.5d-v1",
    canonical_master_sha256: artifactReport.master.sha256,
    canonical_alpha_sha256: artifactReport.master.alphaMaskSha256,
    assets,
    promotion: { eligible: false }
  })
  await writeJson(join(evidenceRoot, "source_reference_ledger.json"), {
    project_id: "blumi-room-v3-six-shell-current",
    sources: [
      {
        source_id: "canonical-master",
        path: artifactReport.master.path,
        sha256: artifactReport.master.sha256
      },
      ...artifactReport.shells.map((shell) => ({
        source_id: `source-${shell.id}`,
        origin: "fixture",
        path: shell.path,
        sha256: shell.sha256
      }))
    ]
  })
  await writeJson(join(evidenceRoot, "continuity_bible.json"), {
    project_id: "blumi-room-v3-six-shell-current",
    locked_scene: { perspective_profile: "my-room-locked-2.5d-v1" },
    shared_art_direction: { style: "cute premium painterly 2.5D consumer mobile game" }
  })
  await writeFile(
    join(evidenceRoot, "evidence.md"),
    "# Fixture evidence\n\nCurrent producer verdict: `PASS_CURRENT_RUN`\n",
    "utf8"
  )
  await writeJson(join(rawRoot, "manifest.json"), [
    {
      attachments,
      testIdentifier:
        "BlumiMobileUITests/testSixRoomV3ShellCandidatesRenderWithFurnishedMyRoom()",
      testIdentifierURL:
        "test://fixture/BlumiMobileUITests/testSixRoomV3ShellCandidatesRenderWithFurnishedMyRoom"
    }
  ])

  if (includeFullCatalogCoverage) {
    const compatibilityNativeRoot = join(evidenceRoot, "full-catalog-native")
    const compatibilityRawRoot = join(evidenceRoot, "full-catalog-native-raw")
    await Promise.all([
      mkdir(compatibilityNativeRoot, { recursive: true }),
      mkdir(compatibilityRawRoot, { recursive: true })
    ])
    const captures = []
    for (const [shellIndex, shell] of artifactReport.shells.entries()) {
      const shellId = `room_v3_shell_${shell.id}`
      for (let offset = 0; offset < canonicalFurnitureIds.length; offset += 8) {
        const batchIndex = Math.floor(offset / 8) + 1
        const captureId = `${shellId}:batch-${String(batchIndex).padStart(2, "0")}`
        const fileName = `${shell.id}_catalog_batch_${String(batchIndex).padStart(2, "0")}.png`
        const nativeRelativePath = `full-catalog-native/${fileName}`
        const rawRelativePath = `full-catalog-native-raw/${fileName}`
        const nativePath = join(evidenceRoot, nativeRelativePath)
        const rawPath = join(evidenceRoot, rawRelativePath)
        await sharp({
          create: {
            width: 750,
            height: 1334,
            channels: 4,
            background: {
              r: 25 + shellIndex * 24,
              g: 45 + batchIndex * 22,
              b: 80 + shellIndex * 12 + batchIndex * 3,
              alpha: 1
            }
          }
        }).png().toFile(rawPath)
        await sharp(rawPath).png({ compressionLevel: 3 }).toFile(nativePath)
        captures.push({
          captureId,
          shellId,
          furnitureIds: canonicalFurnitureIds.slice(offset, offset + 8),
          nativeEvidencePath: nativeRelativePath,
          nativeEvidenceSha256: await sha256File(nativePath),
          rawAttachmentPath: rawRelativePath,
          rawAttachmentSha256: await sha256File(rawPath),
          verdict: "PASS"
        })
        compatibilityEvidenceByCaptureId.set(captureId, {
          captureId,
          nativePath,
          rawPath
        })
      }
    }
    const compatibilityManifestPath = join(
      evidenceRoot,
      "full_catalog_shell_compatibility_manifest.json"
    )
    await writeJson(compatibilityManifestPath, {
        schemaVersion: "room-v3-shell-furniture-compatibility-manifest-v1",
        status: "PASS",
        perspectiveProfile: "my-room-locked-2.5d-v1",
        shellIds: artifactReport.shells.map((shell) => `room_v3_shell_${shell.id}`),
        furnitureIds: canonicalFurnitureIds,
        coverageCount: artifactReport.shells.length * canonicalFurnitureIds.length,
        captures
    })
    compatibilityManifestSha256 = await sha256File(compatibilityManifestPath)
    compatibilityCaptureCount = captures.length
  }

  const registrySha256 = await sha256File(registryPath)
  const reviewShells = []
  for (const shell of artifactReport.shells) {
    const shellId = `room_v3_shell_${shell.id}`
    const evidence = nativeEvidenceByShellId.get(shellId)
    reviewShells.push({
      shellId,
      assetSha256: `sha256:${shell.sha256}`,
      nativeEvidencePath: evidence.friendlyRelativePath,
      nativeEvidenceSha256: await sha256File(evidence.friendlyPath),
      rawAttachmentPath: `native-furnished-raw/${evidence.rawFileName}`,
      rawAttachmentSha256: await sha256File(evidence.rawPath),
      verdict: "PASS"
    })
  }
  await writeJson(join(evidenceRoot, "independent_review_receipt.json"), {
    schemaVersion: "room-v3-shell-independent-review-v1",
    reviewerId: "room_seating_review",
    producerId: "Codex primary agent",
    reviewedBuildIdentity: CLEAN_BUILD_IDENTITY,
    verdict: "PASS",
    artifactRegistrySha256: registrySha256,
    shells: reviewShells,
    findings: { critical: [], high: [], medium: [] },
    ...(compatibilityManifestSha256
      ? {
          fullCatalogCompatibility: {
            manifestSha256: compatibilityManifestSha256,
            reviewedCaptureCount: compatibilityCaptureCount,
            verdict: "PASS"
          }
        }
      : {})
  })

  return {
    evidenceRoot,
    assets,
    nativeEvidenceByShellId,
    compatibilityEvidenceByCaptureId
  }
}

async function withFixture(callback, options) {
  const fixture = await createCompleteFixture(options)
  try {
    await callback(fixture)
  } finally {
    await rm(fixture.evidenceRoot, { recursive: true, force: true })
  }
}

test("produces a trusted receipt only when immutable identity, artifacts, native proof, and review all match", async () => {
  await withFixture(async ({ evidenceRoot }) => {
    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: { headSha: CLEAN_HEAD, isClean: true, statusEntries: [] }
    })

    assert.equal(report.promotionEligible, true)
    assert.deepEqual(report.issueIds, [])
    assert.equal(report.receipt.schemaVersion, ROOM_V3_SHELL_ARTIFACT_RECEIPT_SCHEMA_VERSION)
    assert.equal(report.receipt.verifierId, ROOM_V3_SHELL_ARTIFACT_VERIFIER_ID)
    assert.equal(report.receipt.buildIdentity, CLEAN_BUILD_IDENTITY)
    assert.equal(report.receipt.approvedShells.length, 6)
    assert.equal(new Set(report.receipt.approvedShells.map((entry) => entry.shellId)).size, 6)
    assert.ok(report.receipt.approvedShells.every((entry) => entry.assetKey === basename(entry.assetKey)))
  })
})

test("does not substitute the representative furnished screenshots for full 45-by-6 catalog coverage", async () => {
  await withFixture(async ({ evidenceRoot }) => {
    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: { headSha: CLEAN_HEAD, isClean: true, statusEntries: [] }
    })

    assert.equal(report.promotionEligible, false)
    assert.equal(report.receipt, null)
    assert.ok(report.issueIds.includes("incomplete_full_catalog_shell_coverage"))
  }, { includeFullCatalogCoverage: false })
})

test("does not issue a receipt for a dirty worktree", async () => {
  await withFixture(async ({ evidenceRoot }) => {
    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: {
        headSha: CLEAN_HEAD,
        isClean: false,
        statusEntries: ["?? untracked-proof.png"]
      }
    })

    assert.equal(report.promotionEligible, false)
    assert.equal(report.receipt, null)
    assert.ok(report.issueIds.includes("dirty_worktree"))
  })
})

test("treats PASS_CURRENT_RUN as successful visual review that still needs immutable binding", async () => {
  await withFixture(async ({ evidenceRoot }) => {
    const reviewPath = join(evidenceRoot, "independent_review_receipt.json")
    const review = JSON.parse(await readFile(reviewPath, "utf8"))
    await writeJson(reviewPath, {
      ...review,
      reviewedBuildIdentity: null,
      verdict: "PASS_CURRENT_RUN"
    })

    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: {
        headSha: CLEAN_HEAD,
        isClean: false,
        statusEntries: ["?? current-run-evidence.png"]
      }
    })

    assert.equal(report.receipt, null)
    assert.deepEqual(report.issueIds, [
      "dirty_worktree",
      "immutable_review_binding_required"
    ])
    assert.ok(!report.issueIds.includes("review_verdict_not_pass"))
    assert.ok(!report.issueIds.includes("review_build_identity_mismatch"))
  })
})

test("detects native evidence changed after independent review", async () => {
  await withFixture(async ({ evidenceRoot, nativeEvidenceByShellId }) => {
    const [firstEvidence] = nativeEvidenceByShellId.values()
    await sharp({
      create: {
        width: 750,
        height: 1334,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    }).png().toFile(firstEvidence.friendlyPath)

    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: { headSha: CLEAN_HEAD, isClean: true, statusEntries: [] }
    })

    assert.equal(report.receipt, null)
    assert.ok(report.issueIds.some((issueId) =>
      issueId.endsWith(":review_native_evidence_sha256_mismatch")
    ))
    assert.ok(report.issueIds.some((issueId) =>
      issueId.endsWith(":raw_pixel_mismatch")
    ))
  })
})

test("detects a full-catalog shell capture changed after its manifest was written", async () => {
  await withFixture(async ({ evidenceRoot, compatibilityEvidenceByCaptureId }) => {
    const [firstCapture] = compatibilityEvidenceByCaptureId.values()
    await sharp({
      create: {
        width: 750,
        height: 1334,
        channels: 4,
        background: { r: 250, g: 20, b: 180, alpha: 1 }
      }
    }).png().toFile(firstCapture.nativePath)

    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: { headSha: CLEAN_HEAD, isClean: true, statusEntries: [] }
    })

    assert.equal(report.receipt, null)
    assert.ok(report.issueIds.includes(
      `${firstCapture.captureId}:compatibility_native_sha256_mismatch`
    ))
    assert.ok(report.issueIds.includes(
      `${firstCapture.captureId}:compatibility_raw_pixel_mismatch`
    ))
  })
})

test("requires independent review to bind the complete 45-by-6 compatibility manifest", async () => {
  await withFixture(async ({ evidenceRoot }) => {
    const reviewPath = join(evidenceRoot, "independent_review_receipt.json")
    const review = JSON.parse(await readFile(reviewPath, "utf8"))
    const { fullCatalogCompatibility: _removed, ...withoutCompatibilityReview } = review
    await writeJson(reviewPath, withoutCompatibilityReview)

    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: { headSha: CLEAN_HEAD, isClean: true, statusEntries: [] }
    })

    assert.equal(report.receipt, null)
    assert.ok(report.issueIds.includes("review_full_catalog_compatibility_missing"))
  })
})

test("rejects review approval bound to another build", async () => {
  await withFixture(async ({ evidenceRoot }) => {
    const reviewPath = join(evidenceRoot, "independent_review_receipt.json")
    const review = JSON.parse(await readFile(reviewPath, "utf8"))
    await writeJson(reviewPath, {
      ...review,
      reviewedBuildIdentity: `git:${"f".repeat(40)}`
    })

    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: { headSha: CLEAN_HEAD, isClean: true, statusEntries: [] }
    })

    assert.equal(report.receipt, null)
    assert.ok(report.issueIds.includes("review_build_identity_mismatch"))
  })
})

test("rejects native evidence paths that escape the evidence root", async () => {
  await withFixture(async ({ evidenceRoot }) => {
    const manifestPath = join(evidenceRoot, "asset_manifest.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    manifest.assets[0] = {
      ...manifest.assets[0],
      native_evidence: "../../outside.png"
    }
    await writeJson(manifestPath, manifest)

    const report = await verifyRoomV3ShellPromotion({
      repositoryRoot: REPOSITORY_ROOT,
      evidenceRoot,
      artifactReport,
      gitState: { headSha: CLEAN_HEAD, isClean: true, statusEntries: [] }
    })

    assert.equal(report.receipt, null)
    assert.ok(report.issueIds.some((issueId) =>
      issueId.endsWith(":unsafe_native_evidence_path")
    ))
  })
})
