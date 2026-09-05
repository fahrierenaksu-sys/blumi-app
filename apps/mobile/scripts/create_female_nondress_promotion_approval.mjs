#!/usr/bin/env node

import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createPromotionPlan, resolvePromotionRoots } from "./promote-female-nondress-wardrobe.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, "../../..")
const evidenceTypes = ["static_full_body", "close_up", "motion_contact_sheet"]
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`

const valueFor = (argv, flag) => {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

export const createApproval = ({ evidenceRoot, candidateManifestPath, producer, independentReviewer, reviewedAt }) => {
  assert.ok(producer && independentReviewer, "producer and independent reviewer are required")
  assert.notEqual(producer, independentReviewer, "producer and independent reviewer must differ")
  assert.ok(!Number.isNaN(Date.parse(reviewedAt ?? "")), "reviewed-at must be an ISO timestamp")
  const evidence = JSON.parse(readFileSync(resolve(evidenceRoot, "manifest.json"), "utf8"))
  assert.equal(evidence.schemaVersion, 1, "unsupported promotion evidence schema")
  assert.equal(evidence.candidateManifest, relative(repositoryRoot, candidateManifestPath), "evidence candidate manifest mismatch")

  const plan = createPromotionPlan(resolvePromotionRoots())
  const planKeys = [...new Set(plan.map(({ itemKey }) => itemKey))].sort()
  assert.equal(evidence.itemCount, planKeys.length, "evidence must cover every promotion item")
  assert.equal(evidence.assetCount, plan.length, "evidence must cover every promotion asset")
  assert.deepEqual(Object.keys(evidence.items).sort(), planKeys, "evidence item set does not match promotion plan")
  const items = {}
  for (const itemKey of planKeys) {
    const itemEvidence = evidence.items[itemKey]
    const itemPlan = plan.filter((entry) => entry.itemKey === itemKey)
    assert.equal(Object.keys(itemEvidence.sourceStates ?? {}).length, itemPlan.length, `${itemKey} source state count`)
    assert.deepEqual(
      Object.keys(itemEvidence.evidence ?? {}).sort(),
      [...evidenceTypes].sort(),
      `${itemKey} evidence types`
    )
    items[itemKey] = {
      verdict: "PASS",
      sources: itemEvidence.sourceStates,
      evidence: evidenceTypes.map((type) => ({
        type,
        path: relative(repositoryRoot, resolve(evidenceRoot, itemEvidence.evidence[type].file)),
        sha256: itemEvidence.evidence[type].sha256
      }))
    }
  }
  return {
    schemaVersion: 2,
    verdict: "PASS",
    producer,
    independentReviewer,
    reviewerRole: "independent",
    reviewedAt,
    candidateManifest: relative(repositoryRoot, candidateManifestPath),
    evidenceManifest: relative(repositoryRoot, resolve(evidenceRoot, "manifest.json")),
    items
  }
}

const parseArgs = (argv) => {
  const output = valueFor(argv, "--output")
  const evidenceRoot = valueFor(argv, "--evidence-root")
  const candidateManifest = valueFor(argv, "--candidate-manifest")
  const producer = valueFor(argv, "--producer")
  const independentReviewer = valueFor(argv, "--independent-reviewer")
  const reviewedAt = valueFor(argv, "--reviewed-at")
  assert.ok(argv.includes("--confirm-independent-review"), "--confirm-independent-review is required")
  assert.ok(output, "--output is required")
  assert.ok(evidenceRoot, "--evidence-root is required")
  assert.ok(candidateManifest, "--candidate-manifest is required")
  assert.ok(producer, "--producer is required")
  assert.ok(independentReviewer, "--independent-reviewer is required")
  assert.ok(reviewedAt, "--reviewed-at is required")
  return {
    output: resolve(output),
    evidenceRoot: resolve(evidenceRoot),
    candidateManifestPath: resolve(candidateManifest),
    producer,
    independentReviewer,
    reviewedAt
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  const approval = createApproval(args)
  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, canonicalJson(approval))
  process.stdout.write(`${JSON.stringify({ itemCount: Object.keys(approval.items).length, output: relative(repositoryRoot, args.output) }, null, 2)}\n`)
}
