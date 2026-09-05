import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import sharp from "sharp"

export const REPOSITORY_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
export const MASTER_PATH = resolve(
  REPOSITORY_ROOT,
  "apps/mobile/src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp"
)
export const SHELL_CANDIDATE_ROOT = resolve(
  REPOSITORY_ROOT,
  "apps/mobile/src/features/roomV2/assets/runtime/candidates"
)
export const DEFAULT_REGISTRY_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-28-six-shell-prototype-current/shell_artifact_registry.json"
)

export const ROOM_V3_SHELL_IDS = [
  "cocoa_navy_modern_studio",
  "forest_terracotta_creative_loft",
  "blush_petal_cottage",
  "lavender_moon_atelier",
  "sage_cloud_scandinavian",
  "apricot_sky_social_loft"
]

export const ROOM_V3_CURRENT_CANDIDATE_VERSIONS = Object.freeze({
  cocoa_navy_modern_studio: "v6",
  forest_terracotta_creative_loft: "v10",
  blush_petal_cottage: "v6",
  lavender_moon_atelier: "v10",
  sage_cloud_scandinavian: "v6",
  apricot_sky_social_loft: "v6"
})

const MAX_OPAQUE_NEAR_BLACK_EDGE_PIXELS = 0

export async function verifyRoomV3ShellAssets({
  masterPath = MASTER_PATH,
  candidateRoot = SHELL_CANDIDATE_ROOT,
  shellIds = ROOM_V3_SHELL_IDS,
  candidateVersion,
  candidateVersionsById = ROOM_V3_CURRENT_CANDIDATE_VERSIONS
} = {}) {
  const master = await inspectImage(masterPath)
  const issueIds = []
  const geometryIssueIds = []
  if (master.canvasSize.width !== 1254 || master.canvasSize.height !== 714) {
    issueIds.push("master:invalid_canvas_size")
    geometryIssueIds.push("master:invalid_canvas_size")
  }

  const shells = []
  for (const id of shellIds) {
    const resolvedCandidateVersion =
      candidateVersion ?? candidateVersionsById[id]
    if (!resolvedCandidateVersion) {
      throw new Error(`missing current candidate version for shell: ${id}`)
    }
    const path = resolve(
      candidateRoot,
      `room_v3_shell_${id}_candidate_${resolvedCandidateVersion}.png`
    )
    const asset = await inspectImage(path)
    const shellIssues = []
    const shellGeometryIssues = []
    if (asset.canvasSize.width !== 1254 || asset.canvasSize.height !== 714) {
      shellIssues.push("invalid_canvas_size")
      shellGeometryIssues.push("invalid_canvas_size")
    }
    if (asset.cornerAlpha.some((alpha) => alpha !== 0)) {
      shellIssues.push("opaque_corner")
      shellGeometryIssues.push("opaque_corner")
    }
    if (asset.alphaMaskSha256 !== master.alphaMaskSha256) {
      shellIssues.push("alpha_geometry_mismatch")
      shellGeometryIssues.push("alpha_geometry_mismatch")
    }
    if (!asset.alphaBounds) {
      shellIssues.push("missing_alpha_bounds")
      shellGeometryIssues.push("missing_alpha_bounds")
    }
    if (
      asset.opaqueNearBlackEdgePixelCount >
      MAX_OPAQUE_NEAR_BLACK_EDGE_PIXELS
    ) {
      shellIssues.push("opaque_near_black_matte")
    }
    issueIds.push(...shellIssues.map((issue) => `${id}:${issue}`))
    geometryIssueIds.push(...shellGeometryIssues.map((issue) => `${id}:${issue}`))
    shells.push({
      id,
      path: displayPath(path),
      candidateVersion: resolvedCandidateVersion,
      sha256: asset.sha256,
      canvasSize: asset.canvasSize,
      alphaMaskSha256: asset.alphaMaskSha256,
      alphaBounds: asset.alphaBounds,
      cornerAlpha: asset.cornerAlpha,
      opaqueNearBlackEdgePixelCount: asset.opaqueNearBlackEdgePixelCount,
      lockedGeometry: shellIssues.includes("alpha_geometry_mismatch")
        ? "FAIL"
        : "PASS",
      issueIds: shellIssues
    })
  }

  return {
    verifierVersion: "room-v3-shell-artifact-verifier-v3",
    candidateVersion: candidateVersion ?? "current",
    maxOpaqueNearBlackEdgePixels: MAX_OPAQUE_NEAR_BLACK_EDGE_PIXELS,
    master: {
      path: displayPath(masterPath),
      sha256: master.sha256,
      canvasSize: master.canvasSize,
      alphaMaskSha256: master.alphaMaskSha256,
      alphaBounds: master.alphaBounds,
      cornerAlpha: master.cornerAlpha
    },
    shellCount: shells.length,
    shells,
    issueIds,
    geometryIssueIds,
    isGeometryValid: geometryIssueIds.length === 0,
    isArtifactValid: issueIds.length === 0,
    trustIssueIds: [
      "visual_review_required",
      "native_simulator_evidence_required",
      "independent_review_required"
    ],
    // Geometry evidence is necessary but can never establish visual quality,
    // native fit, or independent approval on its own.
    isTrusted: false,
    promotionEligible: false
  }
}

export async function writeRoomV3ShellArtifactRegistry(
  outputPath = DEFAULT_REGISTRY_PATH,
  options = {}
) {
  const report = await verifyRoomV3ShellAssets(options)
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

async function inspectImage(path) {
  const [raw, file] = await Promise.all([
    sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    readFile(path)
  ])
  const { data, info } = raw
  const alpha = Buffer.alloc(info.width * info.height)
  let opaqueNearBlackEdgePixelCount = 0
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const offset = pixel * info.channels
    alpha[pixel] = data[offset + 3]
    const luminance =
      0.2126 * data[offset] +
      0.7152 * data[offset + 1] +
      0.0722 * data[offset + 2]
  }
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = y * info.width + x
      const offset = pixel * info.channels
      const luminance =
        0.2126 * data[offset] +
        0.7152 * data[offset + 1] +
        0.0722 * data[offset + 2]
      if (
        alpha[pixel] >= 200 &&
        luminance < 18 &&
        isNearTransparentAlpha(alpha, x, y, info.width, info.height, 3)
      ) {
        opaqueNearBlackEdgePixelCount += 1
      }
    }
  }
  return {
    sha256: createHash("sha256").update(file).digest("hex"),
    canvasSize: { width: info.width, height: info.height },
    alphaMaskSha256: createHash("sha256").update(alpha).digest("hex"),
    alphaBounds: findAlphaBounds(alpha, info.width, info.height),
    opaqueNearBlackEdgePixelCount,
    cornerAlpha: [
      alpha[0],
      alpha[info.width - 1],
      alpha[(info.height - 1) * info.width],
      alpha[alpha.length - 1]
    ]
  }
}

function isNearTransparentAlpha(alpha, x, y, width, height, radius) {
  if (
    x - radius < 0 ||
    y - radius < 0 ||
    x + radius >= width ||
    y + radius >= height
  ) {
    return true
  }
  for (let sampleY = y - radius; sampleY <= y + radius; sampleY += 1) {
    for (let sampleX = x - radius; sampleX <= x + radius; sampleX += 1) {
      if (alpha[sampleY * width + sampleX] === 0) return true
    }
  }
  return false
}

function findAlphaBounds(alpha, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX >= minX && maxY >= minY
    ? { minX, minY, maxXInclusive: maxX, maxYInclusive: maxY }
    : undefined
}

function displayPath(path) {
  const relativePath = path.startsWith(`${REPOSITORY_ROOT}/`)
    ? path.slice(REPOSITORY_ROOT.length + 1)
    : path
  return relativePath
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const report = await writeRoomV3ShellArtifactRegistry(process.argv[2] ?? DEFAULT_REGISTRY_PATH)
  process.stdout.write(JSON.stringify({
    registryPath: process.argv[2] ?? DEFAULT_REGISTRY_PATH,
    shellCount: report.shellCount,
    isGeometryValid: report.isGeometryValid,
    isTrusted: report.isTrusted,
    promotionEligible: report.promotionEligible,
    issueCount: report.issueIds.length,
    trustIssueCount: report.trustIssueIds.length
  }, null, 2) + "\n")
}
