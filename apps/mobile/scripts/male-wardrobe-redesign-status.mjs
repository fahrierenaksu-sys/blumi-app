import { createHash } from "node:crypto"
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import sharp from "sharp"

export const REQUIRED_REDESIGN_STATES = Object.freeze([
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01",
])

const EXPECTED_COUNTS = Object.freeze({
  top: 27,
  bottom: 19,
  shoes: 8,
  total: 54,
})
const REDESIGN_ROOT =
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
const CANDIDATE_PREFIX = `${REDESIGN_ROOT}/candidates/`
const RUNTIME_ROOT = "apps/mobile/src/features/avatarV2/assets/room"
const DEFAULT_MANIFEST_PATH = `${REDESIGN_ROOT}/asset-manifest.json`
const EXPECTED_IMAGE = Object.freeze({
  width: 256,
  height: 384,
  channels: 4,
  format: "png",
  hasAlpha: true,
})
const VERSION_TOKEN = /(?:^|[-_/])v(\d+)(?:[._/-]|$)/

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const sha256File = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex")

const resolveInsideRepository = (repositoryRoot, repositoryPath) => {
  const absoluteRoot = resolve(repositoryRoot)
  const absolutePath = resolve(absoluteRoot, repositoryPath)
  const relation = relative(absoluteRoot, absolutePath)
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`path escapes repository: ${repositoryPath}`)
  }
  return absolutePath
}

const candidatePathParts = (path) => {
  if (
    typeof path !== "string" ||
    isAbsolute(path) ||
    !path.startsWith(`${REDESIGN_ROOT}/`) ||
    path.split("/").includes("..") ||
    !VERSION_TOKEN.test(path)
  ) {
    return null
  }
  if (path.startsWith(CANDIDATE_PREFIX)) {
    const [category, rawSlug] = path.slice(CANDIDATE_PREFIX.length).split("/")
    const slug = rawSlug?.replace(/_v\d+$/, "")
    return category && slug ? { category, slug } : null
  }
  const relativeParts = path.slice(`${REDESIGN_ROOT}/`.length).split("/")
  const filenameCategory = basename(path).match(/^room_avatar_(top|bottom|shoes)_male_/)?.[1]
  const slug = relativeParts.length >= 3 ? relativeParts.at(-2) : null
  return filenameCategory && slug ? { category: filenameCategory, slug } : null
}

const versionNumber = (record, path) => {
  const version = String(record.version ?? "").match(/^v(\d+)$/)?.[1]
  const pathVersion = path.match(VERSION_TOKEN)?.[1]
  return Number.parseInt(version ?? pathVersion ?? "0", 10)
}

const reviewPassed = (review) => {
  if (review === "PASS") return true
  if (!isPlainObject(review)) return false
  const values = Object.values(review).filter((value) => typeof value === "string")
  return values.includes("PASS") && !values.includes("PENDING") && !values.includes("FAIL")
}

const approvalPassed = (record) =>
  record.explicitUserApproval === true &&
  record.approvalVerdict === "PASS" &&
  reviewPassed(record.independentReviewVerdict)

const selectedApprovalPassed = (record) =>
  record.explicitUserApproval === true &&
  record.approvalVerdict === "PASS" &&
  record.independentReviewPass === true

const walkJsonFiles = (root) => {
  if (!existsSync(root)) return []
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      if (entry.isFile() && entry.name.endsWith(".json")) files.push(path)
    }
  }
  visit(root)
  return files.sort()
}

const repositoryPath = (repositoryRoot, absolutePath) =>
  relative(resolve(repositoryRoot), absolutePath).split("\\").join("/")

const collectDirectItemManifest = (record, recordPath) => {
  if (!record.itemId || record.candidateOnly !== true) return []
  const trustedApprovalRecord =
    record.recordType === "male_wardrobe_item_approval" &&
    record.approvalScope === "exact_item_static_4w1s_runtime"
  const states = {}

  for (const [state, frame] of Object.entries(record.frames ?? {})) {
    if (
      REQUIRED_REDESIGN_STATES.includes(state) &&
      isPlainObject(frame) &&
      typeof frame.path === "string" &&
      typeof frame.sha256 === "string"
    ) {
      states[state] = { path: frame.path, sha256: frame.sha256 }
      if (typeof frame.runtimeSha256 === "string") {
        states[state].runtimeSha256 = frame.runtimeSha256
      }
    }
  }

  const staticOutput = Object.entries(record.outputs ?? {}).find(([path, checksum]) =>
    typeof checksum === "string" &&
    path.includes(`/${record.itemId}/rig/`) &&
    /^static-review.+v\d+\.png$/.test(basename(path)),
  )
  if (staticOutput) {
    states.static = { path: staticOutput[0], sha256: staticOutput[1] }
  }

  if (Object.keys(states).length === 0) return []
  return [{
    recordType: record.recordType,
    itemId: record.itemId,
    candidateOnly: true,
    version:
      typeof record.version === "string"
        ? record.version
        : recordPath.match(VERSION_TOKEN)?.[0]?.replaceAll("/", "") ?? undefined,
    recordPath,
    explicitUserApproval:
      trustedApprovalRecord && record.explicitUserApproval === true,
    approvalVerdict:
      trustedApprovalRecord ? record.approvalVerdict ?? "PENDING" : "PENDING",
    independentReviewVerdict:
      trustedApprovalRecord
        ? record.independentReviewVerdict ?? "PENDING"
        : "PENDING",
    states,
  }]
}

const collectApprovedArtifacts = (record, recordPath) => {
  if (
    record.explicitUserApproval !== true ||
    record.verdict !== "PASS" ||
    !isPlainObject(record.approvedArtifacts)
  ) {
    return []
  }

  const records = []
  for (const [path, checksum] of Object.entries(record.approvedArtifacts)) {
    const parts = candidatePathParts(path)
    if (
      !parts ||
      typeof checksum !== "string" ||
      !/^static-review.+v\d+\.png$/.test(basename(path))
    ) {
      continue
    }
    records.push({
      itemId: parts.slug,
      candidateOnly: true,
      version: `v${path.match(VERSION_TOKEN)?.[1] ?? "0"}`,
      recordPath,
      explicitUserApproval: true,
      approvalVerdict: "PASS",
      independentReviewVerdict: record.independentReviewVerdict ?? "PENDING",
      states: { static: { path, sha256: checksum } },
    })
  }
  return records
}

const collectApprovedShoeStyles = (record, recordPath) => {
  if (
    record.explicitUserApproval !== true ||
    record.verdict !== "PASS" ||
    !isPlainObject(record.styles) ||
    !String(record.approvalScope ?? "").includes("male_shoes_")
  ) {
    return []
  }
  const versionMatch =
    record.approvalScope.match(/(?:^|_)v(\d+)(?:_|$)/) ??
    recordPath.match(VERSION_TOKEN)
  if (!versionMatch) return []
  const version = `v${versionMatch[1]}`
  const motionRoot = dirname(recordPath)

  return Object.entries(record.styles).map(([slug, checksums]) => {
    const states = {}
    for (const state of REQUIRED_REDESIGN_STATES) {
      const checksum = checksums?.[state]
      if (typeof checksum !== "string") continue
      const path = state === "static"
        ? `${CANDIDATE_PREFIX}shoes/${slug}/rig/static-review-${version}.png`
        : `${motionRoot}/${slug}/room_avatar_shoes_male_${slug}_v1_${state}.png`
      states[state] = { path, sha256: checksum }
    }
    return {
      itemId: slug,
      candidateOnly: true,
      version,
      recordPath,
      explicitUserApproval: true,
      approvalVerdict: "PASS",
      independentReviewVerdict: record.independentReviewVerdict,
      states,
    }
  })
}

export const collectMaleWardrobeCandidateRecords = (repositoryRoot) => {
  const absoluteRedesignRoot = resolveInsideRepository(repositoryRoot, REDESIGN_ROOT)
  const records = []
  const errors = []

  for (const absolutePath of walkJsonFiles(absoluteRedesignRoot)) {
    const recordPath = repositoryPath(repositoryRoot, absolutePath)
    if (recordPath === DEFAULT_MANIFEST_PATH) continue
    let record
    try {
      record = JSON.parse(readFileSync(absolutePath, "utf8"))
    } catch (error) {
      errors.push({ recordPath, reason: `invalid JSON: ${error.message}` })
      continue
    }
    records.push(
      ...collectDirectItemManifest(record, recordPath),
      ...collectApprovedArtifacts(record, recordPath),
      ...collectApprovedShoeStyles(record, recordPath),
    )
  }

  return Object.freeze({ records: Object.freeze(records), errors: Object.freeze(errors) })
}

const validateInventory = (manifest) => {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.items)) {
    throw new Error("asset manifest must contain an items array")
  }
  const actual = manifest.items.reduce(
    (counts, item) => ({
      ...counts,
      ...(Object.hasOwn(counts, item?.category)
        ? { [item.category]: counts[item.category] + 1 }
        : {}),
      total: counts.total + 1,
    }),
    { top: 0, bottom: 0, shoes: 0, total: 0 },
  )
  const slugs = manifest.items.map((item) => item?.slug)
  const assetIds = manifest.items.map((item) => item?.assetId)
  const countsValid = Object.entries(EXPECTED_COUNTS)
    .every(([category, count]) => actual[category] === count)
  const identitiesValid =
    new Set(slugs).size === EXPECTED_COUNTS.total &&
    new Set(assetIds).size === EXPECTED_COUNTS.total &&
    slugs.every(Boolean) &&
    assetIds.every(Boolean)
  if (!countsValid || !identitiesValid) {
    throw new Error(
      `male wardrobe inventory must be 27 tops, 19 bottoms, 8 shoes, ` +
      `54 unique items; received ${JSON.stringify(actual)}`,
    )
  }
  return Object.freeze({
    expected: { ...EXPECTED_COUNTS },
    actual,
    valid: true,
  })
}

const indexCandidateRecords = (manifest, records) => {
  const itemsBySlug = new Map(manifest.items.map((item) => [item.slug, item]))
  const indexed = new Map()
  const errors = []

  for (const record of records) {
    const item = itemsBySlug.get(record?.itemId)
    // Motion candidate evidence can be generated for archived/out-of-scope
    // accessories or future wardrobe drops. It must not contaminate the
    // active 54-item catalog audit; unknown records of every other type still
    // fail closed below.
    if (!item && record?.recordType === "male_wardrobe_item_motion_candidate") {
      continue
    }
    if (!item || record?.candidateOnly !== true || !isPlainObject(record.states)) {
      errors.push({
        recordPath: record?.recordPath ?? null,
        itemId: record?.itemId ?? null,
        reason: "record must identify one manifest item and be candidateOnly",
      })
      continue
    }

    for (const [state, evidence] of Object.entries(record.states)) {
      if (!REQUIRED_REDESIGN_STATES.includes(state) || !isPlainObject(evidence)) continue
      const parts = candidatePathParts(evidence.path)
      if (
        !parts ||
        parts.category !== item.category ||
        parts.slug !== item.slug ||
        typeof evidence.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/i.test(evidence.sha256)
      ) {
        errors.push({
          recordPath: record.recordPath ?? null,
          itemId: item.slug,
          state,
          reason: "state requires a checksummed, versioned candidate-only path for this item",
        })
        continue
      }

      const key = `${item.slug}:${state}`
      const entries = indexed.get(key) ?? []
      indexed.set(key, [
        ...entries,
        {
          path: evidence.path,
          sha256: evidence.sha256.toLowerCase(),
          runtimeSha256:
            typeof evidence.runtimeSha256 === "string" &&
            /^[a-f0-9]{64}$/i.test(evidence.runtimeSha256)
              ? evidence.runtimeSha256.toLowerCase()
              : null,
          version: versionNumber(record, evidence.path),
          explicitUserApproval: record.explicitUserApproval === true,
          approvalVerdict: record.approvalVerdict,
          independentReviewPass: reviewPassed(record.independentReviewVerdict),
          recordPaths: record.recordPath ? [record.recordPath] : [],
        },
      ])
    }
  }

  const selected = new Map()
  for (const [key, entries] of indexed) {
    const mergedByArtifact = new Map()
    for (const entry of entries) {
      const artifactKey = `${entry.path}:${entry.sha256}`
      const previous = mergedByArtifact.get(artifactKey)
      mergedByArtifact.set(artifactKey, previous
        ? {
            ...entry,
            explicitUserApproval:
              previous.explicitUserApproval || entry.explicitUserApproval,
            approvalVerdict:
              previous.approvalVerdict === "PASS" || entry.approvalVerdict === "PASS"
                ? "PASS"
                : entry.approvalVerdict,
            independentReviewPass:
              previous.independentReviewPass || entry.independentReviewPass,
            runtimeSha256:
              previous.runtimeSha256 ?? entry.runtimeSha256,
            recordPaths: [...new Set([...previous.recordPaths, ...entry.recordPaths])],
          }
        : entry)
    }
    const ranked = [...mergedByArtifact.values()].sort((left, right) => {
      const approvalDelta =
        Number(selectedApprovalPassed(right)) - Number(selectedApprovalPassed(left))
      if (approvalDelta !== 0) return approvalDelta
      if (right.version !== left.version) return right.version - left.version
      return left.path.localeCompare(right.path)
    })
    selected.set(key, ranked[0])
  }

  return { selected, errors }
}

const auditState = async (repositoryRoot, selected) => {
  if (!selected) {
    return Object.freeze({
      path: null,
      exists: false,
      status: "UNRESOLVED",
      image: null,
      expectedSha256: null,
      expectedRuntimeSha256: null,
      actualSha256: null,
      recordPaths: [],
      approved: false,
    })
  }

  const absolutePath = resolveInsideRepository(repositoryRoot, selected.path)
  if (!existsSync(absolutePath)) {
    return Object.freeze({
      path: selected.path,
      exists: false,
      status: "MISSING",
      image: null,
      expectedSha256: selected.sha256,
      expectedRuntimeSha256: selected.runtimeSha256,
      actualSha256: null,
      recordPaths: selected.recordPaths,
      approved: false,
    })
  }

  const actualSha256 = sha256File(absolutePath)
  let metadata
  try {
    const image = await sharp(absolutePath).metadata()
    metadata = {
      width: image.width ?? null,
      height: image.height ?? null,
      channels: image.channels ?? null,
      format: image.format ?? null,
      hasAlpha: image.hasAlpha ?? false,
    }
  } catch {
    metadata = {
      width: null,
      height: null,
      channels: null,
      format: null,
      hasAlpha: false,
    }
  }
  const validImage = Object.entries(EXPECTED_IMAGE)
    .every(([key, value]) => metadata[key] === value)
  const checksumMatches = actualSha256 === selected.sha256
  const approved = approvalPassed({
    explicitUserApproval: selected.explicitUserApproval,
    approvalVerdict: selected.approvalVerdict,
    independentReviewVerdict: selected.independentReviewPass ? "PASS" : "PENDING",
  })
  const status = !validImage
    ? "INVALID_IMAGE"
    : !checksumMatches
      ? "CHECKSUM_MISMATCH"
      : approved
        ? "APPROVED_VERIFIED"
        : "CANDIDATE_VERIFIED"

  return Object.freeze({
    path: selected.path,
    exists: true,
    status,
    image: metadata,
    expectedSha256: selected.sha256,
    expectedRuntimeSha256: selected.runtimeSha256,
    actualSha256,
    recordPaths: selected.recordPaths,
    approved: status === "APPROVED_VERIFIED",
  })
}

const itemStatus = (states) => {
  const values = Object.values(states)
  const staticStatus = states.static.status
  const motion = REQUIRED_REDESIGN_STATES.slice(1).map((state) => states[state])
  if (values.some(({ status }) =>
    ["MISSING", "INVALID_IMAGE", "CHECKSUM_MISMATCH"].includes(status))) {
    return "BLOCKED_INVALID_OR_STALE_CANDIDATE"
  }
  if (values.every(({ status }) => status === "APPROVED_VERIFIED")) {
    return "APPROVED_CANDIDATE_RUNTIME_HOLD"
  }
  if (values.every(({ status }) =>
    ["APPROVED_VERIFIED", "CANDIDATE_VERIFIED"].includes(status))) {
    return "COMPLETE_CANDIDATE_AWAITING_APPROVAL"
  }
  if (motion.some(({ status }) => status !== "UNRESOLVED") &&
      !["APPROVED_VERIFIED", "CANDIDATE_VERIFIED"].includes(staticStatus)) {
    return "BLOCKED_STATIC_GATE"
  }
  if (staticStatus === "APPROVED_VERIFIED") {
    return "STATIC_APPROVED_MOTION_INCOMPLETE"
  }
  if (staticStatus === "CANDIDATE_VERIFIED") {
    return "STATIC_CANDIDATE_MOTION_INCOMPLETE"
  }
  return "PLANNED_NO_VERSIONED_CANDIDATE"
}

const runtimePathForState = (item, state, staticPath) => {
  if (state === "static") return staticPath
  const prefix = item.runtimeFilename
    .replace(/^avatar_room_/, "room_avatar_")
    .replace(/\.png$/, "")
  return `${RUNTIME_ROOT}/motion/${prefix}_${state}.png`
}

const runtimeStatus = (repositoryRoot, item, states, approvedCandidate) => {
  const targetPath = `${RUNTIME_ROOT}/${item.runtimeFilename}`
  const replacementPath = item.replacesRuntimeFilename
    ? `${RUNTIME_ROOT}/${item.replacesRuntimeFilename}`
    : null
  const livePath =
    replacementPath && existsSync(resolveInsideRepository(repositoryRoot, replacementPath))
      ? replacementPath
      : targetPath
  const runtimeStates = Object.freeze(Object.fromEntries(
    REQUIRED_REDESIGN_STATES.map((state) => {
      const path = runtimePathForState(item, state, livePath)
      const absolutePath = resolveInsideRepository(repositoryRoot, path)
      const exists = existsSync(absolutePath)
      const actualSha256 = exists ? sha256File(absolutePath) : null
      const expectedSha256 =
        states[state].expectedRuntimeSha256 ?? states[state].actualSha256
      return [state, Object.freeze({
        path,
        exists,
        expectedSha256,
        actualSha256,
        verified: exists && expectedSha256 === actualSha256,
      })]
    }),
  ))
  const verifiedStateCount = Object.values(runtimeStates)
    .filter(({ verified }) => verified)
    .length
  const staticRuntime = runtimeStates.static
  const redesigned =
    verifiedStateCount === REQUIRED_REDESIGN_STATES.length &&
    item.runtimePromoted === true &&
    approvedCandidate
  return Object.freeze({
    path: livePath,
    targetPath,
    replacesPath: replacementPath,
    exists: staticRuntime.exists,
    actualSha256: staticRuntime.actualSha256,
    states: runtimeStates,
    verifiedStateCount,
    redesigned,
    role: !staticRuntime.exists
      ? "RUNTIME_TARGET_MISSING"
      : redesigned
        ? "LIVE_RUNTIME_PROMOTED_REDESIGN"
        : item.runtimePromoted === true && approvedCandidate
          ? "LIVE_RUNTIME_INCOMPLETE_OR_STALE"
          : "LIVE_RUNTIME_PRE_REDESIGN",
  })
}

export const auditMaleWardrobeRedesignStatus = async ({
  repositoryRoot,
  manifest,
  candidateRecords,
} = {}) => {
  if (!repositoryRoot) throw new Error("repositoryRoot is required")
  const resolvedManifest = manifest ?? JSON.parse(
    readFileSync(resolveInsideRepository(repositoryRoot, DEFAULT_MANIFEST_PATH), "utf8"),
  )
  const inventory = validateInventory(resolvedManifest)
  const collected = candidateRecords === undefined
    ? collectMaleWardrobeCandidateRecords(repositoryRoot)
    : { records: candidateRecords, errors: [] }
  const indexed = indexCandidateRecords(resolvedManifest, collected.records)

  const items = await Promise.all(resolvedManifest.items.map(async (item) => {
    const stateEntries = await Promise.all(REQUIRED_REDESIGN_STATES.map(async (state) => [
      state,
      await auditState(repositoryRoot, indexed.selected.get(`${item.slug}:${state}`)),
    ]))
    const states = Object.freeze(Object.fromEntries(stateEntries))
    const motionStates = REQUIRED_REDESIGN_STATES.slice(1).map((state) => states[state])
    const approvedCandidate = Object.values(states)
      .every(({ status }) => status === "APPROVED_VERIFIED")
    const candidateStatus = itemStatus(states)
    const promotionEligible =
      approvedCandidate &&
      resolvedManifest.runtimePromotionAllowed === true &&
      item.runtimePromoted !== true
    const runtime = runtimeStatus(
      repositoryRoot,
      item,
      states,
      approvedCandidate,
    )
    const status = runtime.redesigned
      ? "LIVE_RUNTIME_PROMOTED_VERIFIED"
      : candidateStatus

    return Object.freeze({
      assetId: item.assetId,
      category: item.category,
      slug: item.slug,
      family: item.family,
      runtime,
      states,
      static: Object.freeze({
        exists: states.static.exists,
        technicallyVerified: [
          "APPROVED_VERIFIED",
          "CANDIDATE_VERIFIED",
        ].includes(states.static.status),
        approvedVerified: states.static.status === "APPROVED_VERIFIED",
      }),
      motion: Object.freeze({
        requiredStates: REQUIRED_REDESIGN_STATES.slice(1),
        exists: motionStates.every(({ exists }) => exists),
        technicallyVerified: motionStates.every(({ status }) =>
          ["APPROVED_VERIFIED", "CANDIDATE_VERIFIED"].includes(status)),
        approvedVerified: motionStates.every(({ status }) =>
          status === "APPROVED_VERIFIED"),
      }),
      status,
      promotionEligible,
    })
  }))

  const stateValues = items.flatMap((item) => Object.values(item.states))
  const statusCounts = items.reduce(
    (counts, item) => ({
      ...counts,
      [item.status]: (counts[item.status] ?? 0) + 1,
    }),
    {},
  )
  const allPromotionEligible = items.every(({ promotionEligible }) => promotionEligible)
  const allRuntimePromoted = items.every(({ runtime }) => runtime.redesigned)
  const summary = Object.freeze({
    liveRuntimeAssets: items.filter(({ runtime }) => runtime.exists).length,
    promotedRedesignRuntimeAssets:
      items.filter(({ runtime }) => runtime.redesigned).length,
    resolvedStates: stateValues.filter(({ path }) => path !== null).length,
    technicallyVerifiedStates: stateValues.filter(({ status }) =>
      ["APPROVED_VERIFIED", "CANDIDATE_VERIFIED"].includes(status)).length,
    approvedVerifiedStates:
      stateValues.filter(({ status }) => status === "APPROVED_VERIFIED").length,
    staticTechnicallyVerifiedItems:
      items.filter(({ static: state }) => state.technicallyVerified).length,
    completeMotionCandidateItems:
      items.filter(({ motion }) => motion.technicallyVerified).length,
    statusCounts,
  })

  return Object.freeze({
    schemaVersion: 1,
    projectId: resolvedManifest.projectId,
    rigId: resolvedManifest.rigId,
    fitProfileId: resolvedManifest.fitProfileId,
    canvas: { ...EXPECTED_IMAGE },
    inventory,
    evidencePolicy: Object.freeze({
      plannedManifestPathsCountAsRedesign: false,
      runtimePathsCountAsRedesignCandidates: false,
      candidatePathMustBeVersioned: true,
      checksumRequired: true,
      technicalVerificationIsVisualPass: false,
      promotionRequiresExplicitApprovalAndIndependentReview: true,
    }),
    items,
    summary,
    recordErrors: Object.freeze([...collected.errors, ...indexed.errors]),
    verdict: allPromotionEligible || allRuntimePromoted ? "PASS" : "BLOCKED",
    promotionEligible: allPromotionEligible,
    runtimeVerified: allRuntimePromoted,
  })
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ""
if (invokedPath === import.meta.url) {
  const repositoryRoot = resolve(import.meta.dirname, "../../..")
  const report = await auditMaleWardrobeRedesignStatus({ repositoryRoot })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
