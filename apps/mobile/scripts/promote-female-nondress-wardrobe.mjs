#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { PNG } from "pngjs"

export const STATES = [
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01"
]

export const PROMOTION_ITEMS = [
  { kind: "top", slug: "cream_basic_tee", staging: "premium" },
  { kind: "top", slug: "blush_lace_cardigan", staging: "premium" },
  { kind: "top", slug: "sage_ribbon_knit_jacket", staging: "premium" },
  { kind: "top", slug: "cherry_heart_milkmaid_blouse", staging: "premium" },
  { kind: "top", slug: "powder_blue_ribbon_corset_top", staging: "premium" },
  { kind: "top", slug: "noir_rose_heart_cardigan", staging: "premium" },
  { kind: "bottom", slug: "denim_skort_shorts", staging: "bottom" },
  { kind: "bottom", slug: "striped_crochet_shorts", staging: "bottom" },
  { kind: "bottom", slug: "black_palm_embellished_pants", staging: "long-pant-refit" },
  { kind: "bottom", slug: "coral_embellished_laceup_pants", staging: "long-pant-refit" },
  { kind: "bottom", slug: "smoky_floral_mesh_pants", staging: "long-pant-refit" },
  { kind: "bottom", slug: "layered_lace_ruffle_mini_skirt", staging: "bottom" },
  { kind: "bottom", slug: "yellow_bow_lace_ruffle_skirt", staging: "bottom" },
  { kind: "shoes", slug: "cherry_satin_ballets", staging: "shoes" },
  { kind: "shoes", slug: "milk_tea_court_sneakers", staging: "shoes" },
  { kind: "shoes", slug: "onyx_heart_mary_janes", staging: "shoes" },
  { kind: "shoes", slug: "pearl_slingback_sandals", staging: "shoes" },
  { kind: "shoes", slug: "rosewood_platform_loafers", staging: "shoes" }
]

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const EXPECTED_CANVAS = { width: 256, height: 384, colorType: 6 }
const APPROVAL_RELATIVE_PATH = "docs/avatar-motion-pipeline/female-nondress-promotion-approval.json"
const REQUIRED_EVIDENCE_TYPES = ["static_full_body", "close_up", "motion_contact_sheet"]

export const resolvePromotionRoots = () => {
  const repositoryRoot = resolve(scriptDirectory, "../../..")
  const roomRoot = join(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/room")
  return {
    repositoryRoot,
    roomRoot,
    motionRoot: join(roomRoot, "motion"),
    topStagingRoot: join(repositoryRoot, "docs/avatar-motion-pipeline/female-premium-top-motion-staging"),
    bottomStagingRoot: join(repositoryRoot, "docs/avatar-motion-pipeline/female-bottom-motion-staging/extracted"),
    longPantRefitStagingRoot: join(repositoryRoot, "docs/avatar-motion-pipeline/female-long-pant-shoe-refit-staging/2026-07-15"),
    shoeStagingRoot: join(repositoryRoot, "docs/avatar-motion-pipeline/female-shoes-accessories-staging/2026-07-15/shoes"),
    approvalPath: join(repositoryRoot, APPROVAL_RELATIVE_PATH)
  }
}

const itemKey = ({ kind, slug }) => `${kind}:${slug}`
const EXPECTED_PRODUCTION_ITEM_KEYS = PROMOTION_ITEMS.map(itemKey).sort()
const canonicalName = ({ kind, slug, state }) => state === "static"
  ? `avatar_room_${kind}_female_${slug}_v2.png`
  : `room_avatar_${kind}_female_${slug}_v2_${state}.png`

const sourceName = ({ kind, slug, state, staging }) => {
  if (staging === "shoes" || staging === "long-pant-refit") {
    return state === "static" ? "static.png" : `${state}.png`
  }
  return canonicalName({ kind, slug, state })
}

const sourceDirectory = (item, roots) => {
  if (item.staging === "premium") return join(roots.topStagingRoot, item.slug, "extracted")
  if (item.staging === "bottom") return join(roots.bottomStagingRoot, item.slug)
  if (item.staging === "long-pant-refit") return join(roots.longPantRefitStagingRoot, item.slug)
  return join(roots.shoeStagingRoot, item.slug)
}

export const createPromotionPlan = (roots = resolvePromotionRoots()) => {
  const plan = PROMOTION_ITEMS.flatMap((item) => {
    const directory = sourceDirectory(item, roots)
    return STATES.map((state) => ({
      ...item,
      itemKey: itemKey(item),
      state,
      sourceDirectory: directory,
      source: join(directory, sourceName({ ...item, state })),
      destination: state === "static"
        ? join(roots.roomRoot, canonicalName({ ...item, state }))
        : join(roots.motionRoot, canonicalName({ ...item, state }))
    }))
  })
  validateProductionPlan(plan)
  return plan
}

export const buildFixturePlan = (root, { itemCount = 1 } = {}) => Array.from(
  { length: itemCount },
  (_, index) => ({ kind: "top", slug: `fixture_${index + 1}`, staging: "fixture" })
).flatMap((item) => {
  const directory = join(root, "source", item.slug)
  return STATES.map((state) => ({
    ...item,
    itemKey: itemKey(item),
    state,
    sourceDirectory: directory,
    source: join(directory, state === "static" ? "static.png" : `${state}.png`),
    destination: join(root, "destination", item.slug, state === "static" ? "static.png" : `${state}.png`)
  }))
})

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const errorMessage = (error) => error instanceof Error ? error.message : String(error)

const assertFile = (path, label) => {
  if (!existsSync(path)) throw new Error(`missing ${label}: ${path}`)
  const stat = statSync(path)
  if (!stat.isFile() || stat.size === 0) throw new Error(`invalid ${label}: ${path}`)
}

const readValidatedPng = (path, label) => {
  assertFile(path, label)
  let png
  try {
    png = PNG.sync.read(readFileSync(path))
  } catch (error) {
    throw new Error(`${label} is not a readable PNG: ${path} (${errorMessage(error)})`)
  }
  if (png.width !== EXPECTED_CANVAS.width || png.height !== EXPECTED_CANVAS.height) {
    throw new Error(`${label} must be 256x384: ${path} is ${png.width}x${png.height}`)
  }
  if (png.colorType !== EXPECTED_CANVAS.colorType) {
    throw new Error(`${label} must be RGBA (PNG color type 6): ${path} has color type ${png.colorType}`)
  }
  return png
}

const isInside = (root, path) => {
  const candidate = relative(resolve(root), resolve(path))
  return candidate === "" || (!candidate.startsWith("..") && !isAbsolute(candidate))
}

export const validateProductionPlan = (plan) => {
  if (plan.length !== PROMOTION_ITEMS.length * STATES.length) {
    throw new Error(`production plan must contain exactly 108 states; received ${plan.length}`)
  }
  const actualKeys = [...new Set(plan.map(({ itemKey: key }) => key))].sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(EXPECTED_PRODUCTION_ITEM_KEYS)) {
    throw new Error(`production allowlist mismatch: expected ${EXPECTED_PRODUCTION_ITEM_KEYS.join(", ")}; received ${actualKeys.join(", ")}`)
  }
  const expectedPairs = new Set(PROMOTION_ITEMS.flatMap((item) => STATES.map((state) => `${itemKey(item)}:${state}`)))
  const actualPairs = plan.map(({ itemKey: key, state }) => `${key}:${state}`)
  if (actualPairs.length !== new Set(actualPairs).size || actualPairs.some((pair) => !expectedPairs.has(pair))) {
    throw new Error("production plan must contain each allowlisted item/state exactly once")
  }
  return true
}

export const validateApprovalManifest = ({ approval, plan, repositoryRoot }) => {
  if (!approval || typeof approval !== "object") throw new Error("approval manifest is required")
  if (approval.schemaVersion !== 2) throw new Error("approval schemaVersion must be 2")
  if (approval.verdict !== "PASS") throw new Error("approval overall verdict must be PASS")
  if (approval.reviewerRole !== "independent" || !approval.independentReviewer) {
    throw new Error("approval reviewer must be independent")
  }
  if (!approval.producer || approval.producer === approval.independentReviewer) {
    throw new Error("approval reviewer must be independent from producer")
  }
  if (!approval.reviewedAt || Number.isNaN(Date.parse(approval.reviewedAt))) {
    throw new Error("approval reviewedAt must be an ISO timestamp")
  }

  const expectedKeys = [...new Set(plan.map(({ itemKey: key }) => key))].sort()
  const actualKeys = Object.keys(approval.items ?? {}).sort()
  const usedEvidencePaths = new Map()
  const usedEvidenceHashes = new Map()
  for (const key of expectedKeys) {
    const item = approval.items?.[key]
    if (!item) throw new Error(`missing item approval: ${key}`)
    if (item.verdict !== "PASS") throw new Error(`${key} independent verdict must be PASS; received ${item.verdict ?? "missing"}`)
    const itemPlan = plan.filter(({ itemKey: keyForEntry }) => keyForEntry === key)
    const sourceStates = Object.keys(item.sources ?? {}).sort()
    if (JSON.stringify(sourceStates) !== JSON.stringify([...STATES].sort())) {
      throw new Error(`${key} approval must bind the exact Static+W1-W4+S1 source set`)
    }
    for (const entry of itemPlan) {
      assertFile(entry.source, `${key} ${entry.state} reviewed source`)
      if (item.sources[entry.state] !== sha256(entry.source)) {
        throw new Error(`${key} ${entry.state} reviewed source hash mismatch`)
      }
    }
    if (!Array.isArray(item.evidence) || item.evidence.length !== REQUIRED_EVIDENCE_TYPES.length) {
      throw new Error(`${key} must include exactly three evidence entries`)
    }
    const evidenceTypes = item.evidence.map(({ type }) => type)
    for (const requiredType of REQUIRED_EVIDENCE_TYPES) {
      if (!evidenceTypes.includes(requiredType)) throw new Error(`${key} missing required evidence type: ${requiredType}`)
    }
    if (new Set(evidenceTypes).size !== evidenceTypes.length) {
      throw new Error(`${key} evidence types must be unique`)
    }
    const itemEvidencePaths = new Set()
    const itemEvidenceHashes = new Set()
    for (const evidenceEntry of item.evidence) {
      if (!evidenceEntry || typeof evidenceEntry !== "object" || typeof evidenceEntry.path !== "string" || typeof evidenceEntry.sha256 !== "string") {
        throw new Error(`${key} evidence entries require type, path, and sha256`)
      }
      const evidencePath = isAbsolute(evidenceEntry.path) ? evidenceEntry.path : join(repositoryRoot, evidenceEntry.path)
      if (!isInside(repositoryRoot, evidencePath)) throw new Error(`${key} evidence must stay inside repository: ${evidenceEntry.path}`)
      assertFile(evidencePath, `${key} review evidence`)
      const evidenceHash = sha256(evidencePath)
      if (evidenceHash !== evidenceEntry.sha256) throw new Error(`${key} ${evidenceEntry.type} evidence hash mismatch`)
      const resolvedEvidencePath = resolve(evidencePath)
      itemEvidencePaths.add(resolvedEvidencePath)
      itemEvidenceHashes.add(evidenceHash)
      const previousPathOwner = usedEvidencePaths.get(resolvedEvidencePath)
      const previousHashOwner = usedEvidenceHashes.get(evidenceHash)
      if ((previousPathOwner && previousPathOwner !== key) || (previousHashOwner && previousHashOwner !== key)) {
        throw new Error(`${key} evidence cannot be reused across items`)
      }
      usedEvidencePaths.set(resolvedEvidencePath, key)
      usedEvidenceHashes.set(evidenceHash, key)
    }
    if (itemEvidencePaths.size !== REQUIRED_EVIDENCE_TYPES.length || itemEvidenceHashes.size !== REQUIRED_EVIDENCE_TYPES.length) {
      throw new Error(`${key} must use three distinct evidence paths and hashes`)
    }
  }
  const unexpected = actualKeys.filter((key) => !expectedKeys.includes(key))
  if (unexpected.length > 0) throw new Error(`unexpected item approvals: ${unexpected.join(", ")}`)
  return true
}

const validatePlanShape = (plan) => {
  const destinations = new Set()
  const byItem = new Map()
  for (const entry of plan) {
    const destination = resolve(entry.destination)
    if (destinations.has(destination)) throw new Error(`duplicate promotion destination: ${destination}`)
    destinations.add(destination)
    const group = byItem.get(entry.itemKey) ?? []
    group.push(entry)
    byItem.set(entry.itemKey, group)
  }

  for (const [key, entries] of byItem) {
    const states = entries.map(({ state }) => state).sort()
    if (JSON.stringify(states) !== JSON.stringify([...STATES].sort())) {
      throw new Error(`${key} must have exact Static+W1-W4+S1 state set`)
    }
    const directories = new Set(entries.map(({ sourceDirectory }) => resolve(sourceDirectory)))
    if (directories.size !== 1) throw new Error(`${key} sources must share one staging directory`)
    const directory = entries[0].sourceDirectory
    if (!existsSync(directory)) throw new Error(`missing source directory: ${directory}`)
    const expectedNames = new Set(entries.map(({ source }) => basename(source)))
    const stateLike = readdirSync(directory).filter((name) => {
      if (!name.endsWith(".png") || name === "contact-sheet.png") return false
      return name === "static.png" || name.includes("walking_front_f") || name.includes("sitting_front_f") || name.startsWith("avatar_room_")
    })
    const unexpected = stateLike.filter((name) => !expectedNames.has(name))
    if (unexpected.length > 0) throw new Error(`${key} has unexpected state asset(s): ${unexpected.join(", ")}`)
    const missing = [...expectedNames].filter((name) => !stateLike.includes(name))
    if (missing.length > 0) throw new Error(`${key} has incomplete state set: ${missing.join(", ")}`)
  }
}

const preflight = ({ plan, approval, repositoryRoot, validateDestinations = false }) => {
  validatePlanShape(plan)
  validateApprovalManifest({ approval, plan, repositoryRoot })
  for (const entry of plan) {
    readValidatedPng(entry.source, `${entry.itemKey} ${entry.state} source`)
    if (validateDestinations || existsSync(entry.destination)) {
      readValidatedPng(entry.destination, `${entry.itemKey} ${entry.state} destination`)
    }
  }
}

export const inspectPromotion = ({ plan, approval, repositoryRoot }) => {
  const errors = []
  try {
    validatePlanShape(plan)
  } catch (error) {
    errors.push(errorMessage(error))
  }
  try {
    validateApprovalManifest({ approval, plan, repositoryRoot })
  } catch (error) {
    errors.push(errorMessage(error))
  }

  let destinationMissing = 0
  let sourceDestinationDifferences = 0
  const staticStateMismatches = []
  for (const entry of plan) {
    let sourceValid = false
    try {
      readValidatedPng(entry.source, `${entry.itemKey} ${entry.state} source`)
      sourceValid = true
    } catch (error) {
      errors.push(errorMessage(error))
    }
    if (!existsSync(entry.destination)) {
      destinationMissing += 1
      if (entry.state === "static") staticStateMismatches.push(`${entry.itemKey}: destination missing`)
      continue
    }
    let destinationValid = false
    try {
      readValidatedPng(entry.destination, `${entry.itemKey} ${entry.state} destination`)
      destinationValid = true
    } catch (error) {
      errors.push(errorMessage(error))
    }
    if (sourceValid && destinationValid && sha256(entry.source) !== sha256(entry.destination)) {
      sourceDestinationDifferences += 1
      if (entry.state === "static") staticStateMismatches.push(`${entry.itemKey}: staged static differs from live`)
    }
  }
  return {
    mode: "dry-run",
    ready: errors.length === 0,
    itemCount: new Set(plan.map(({ itemKey: key }) => key)).size,
    assetCount: plan.length,
    destinationMissing,
    sourceDestinationDifferences,
    staticStateMismatches,
    errors
  }
}

export const checkPromoted = ({ plan, approval, repositoryRoot }) => {
  const errors = []
  try {
    preflight({ plan, approval, repositoryRoot, validateDestinations: true })
    for (const entry of plan) {
      if (sha256(entry.source) !== sha256(entry.destination)) {
        errors.push(`destination hash mismatch: ${entry.itemKey} ${entry.state}`)
      }
    }
  } catch (error) {
    errors.push(errorMessage(error))
  }
  return { mode: "check", ok: errors.length === 0, errors }
}

export const promotePlanAtomically = ({ plan, approval, repositoryRoot, testHooks }) => {
  preflight({ plan, approval, repositoryRoot })
  const changed = plan.filter((entry) => !existsSync(entry.destination) || sha256(entry.source) !== sha256(entry.destination))
  if (changed.length === 0) return { promoted: 0, unchanged: plan.length }

  const transaction = randomUUID()
  const prepared = []
  const installed = []
  let committed = false
  try {
    for (const entry of changed) {
      mkdirSync(dirname(entry.destination), { recursive: true })
      const temporary = join(dirname(entry.destination), `.${basename(entry.destination)}.promotion-${transaction}.tmp`)
      const backup = join(dirname(entry.destination), `.${basename(entry.destination)}.promotion-${transaction}.bak`)
      copyFileSync(entry.source, temporary)
      readValidatedPng(temporary, `${entry.itemKey} ${entry.state} temporary`)
      if (sha256(temporary) !== sha256(entry.source)) throw new Error(`temporary hash mismatch: ${entry.itemKey} ${entry.state}`)
      const hadDestination = existsSync(entry.destination)
      if (hadDestination) {
        copyFileSync(entry.destination, backup)
        readValidatedPng(backup, `${entry.itemKey} ${entry.state} backup`)
        if (sha256(backup) !== sha256(entry.destination)) throw new Error(`backup hash mismatch: ${entry.itemKey} ${entry.state}`)
      }
      prepared.push({ ...entry, temporary, backup, hadDestination })
    }

    for (const [index, entry] of prepared.entries()) {
      // POSIX rename on the same filesystem atomically replaces an existing path:
      // readers see either the verified old file or the verified new file, never ENOENT.
      renameSync(entry.temporary, entry.destination)
      installed.push(entry)
      testHooks?.afterInstall?.({ entry, index })
    }

    testHooks?.beforePostCheck?.()
    const result = checkPromoted({ plan, approval, repositoryRoot })
    if (!result.ok) throw new Error(`post-promotion check failed: ${result.errors.join("; ")}`)
    committed = true
  } catch (error) {
    const rollbackErrors = []
    for (const entry of [...installed].reverse()) {
      try {
        if (entry.hadDestination && existsSync(entry.backup)) {
          // Atomic replace again: rollback also keeps the live path continuously present.
          renameSync(entry.backup, entry.destination)
        } else {
          rmSync(entry.destination, { force: true })
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    testHooks?.afterRollback?.()
    if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], "promotion failed and rollback was incomplete")
    throw error
  } finally {
    for (const entry of prepared) {
      rmSync(entry.temporary, { force: true })
      if (!committed && entry.hadDestination && existsSync(entry.backup)) {
        if (!existsSync(entry.destination)) renameSync(entry.backup, entry.destination)
        else if (!installed.includes(entry)) rmSync(entry.backup, { force: true })
      }
      if (!entry.hadDestination) rmSync(entry.backup, { force: true })
    }
  }

  // The transaction is already committed. Cleanup is deliberately best-effort
  // and cannot enter rollback or mutate the installed destination.
  for (const [index, entry] of prepared.entries()) {
    try {
      testHooks?.beforeBackupCleanup?.({ entry, index })
      rmSync(entry.backup, { force: true })
    } catch (cleanupError) {
      if (testHooks?.onBackupCleanupError) testHooks.onBackupCleanupError({ entry, index, error: cleanupError })
      else console.warn(`backup cleanup deferred: ${entry.backup} (${errorMessage(cleanupError)})`)
    }
  }
  return { promoted: changed.length, unchanged: plan.length - changed.length }
}

const parseArgs = (argv) => {
  const mode = argv.includes("--promote") ? "promote" : argv.includes("--check") ? "check" : "dry-run"
  if (argv.includes("--promote") && argv.includes("--check")) throw new Error("choose only one of --promote or --check")
  const approvalIndex = argv.indexOf("--approval")
  return { mode, approvalPath: approvalIndex >= 0 ? resolve(argv[approvalIndex + 1] ?? "") : resolvePromotionRoots().approvalPath }
}

const isMainModule = process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  try {
    const roots = resolvePromotionRoots()
    const plan = createPromotionPlan(roots)
    const { mode, approvalPath } = parseArgs(process.argv.slice(2))
    const approval = existsSync(approvalPath) ? JSON.parse(readFileSync(approvalPath, "utf8")) : undefined
    const result = mode === "promote"
      ? promotePlanAtomically({ plan, approval, repositoryRoot: roots.repositoryRoot })
      : mode === "check"
        ? checkPromoted({ plan, approval, repositoryRoot: roots.repositoryRoot })
        : inspectPromotion({ plan, approval, repositoryRoot: roots.repositoryRoot })
    console.log(JSON.stringify({ ...result, approvalPath: relative(roots.repositoryRoot, approvalPath) }, null, 2))
    if ((mode === "dry-run" && !result.ready) || (mode === "check" && !result.ok)) process.exitCode = 1
  } catch (error) {
    console.error(JSON.stringify({ mode: "blocked", error: errorMessage(error) }, null, 2))
    process.exitCode = 1
  }
}
