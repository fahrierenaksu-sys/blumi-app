#!/usr/bin/env node
// Runs the avatar tests whose fixtures live only in the Blumi Art Workbench
// (docs/quality/WORKBENCH_FIXTURE_TESTS_2026-09-30.md). They protect shipped
// runtime assets against the approved Workbench evidence, so they must not be
// skipped: without BLUMI_WORKBENCH_ROOT, or with a required fixture tree
// missing, this runner fails before running anything.
//
// BLUMI_WORKBENCH_ROOT points at a directory that holds the fixture trees at
// their original repository-relative paths, for example
//   $BLUMI_WORKBENCH_ROOT/docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/...
// For the run, every Workbench child of docs/avatar-motion-pipeline that the
// repository does not have is linked into the checkout; the links are removed
// afterwards. Existing repository paths are never replaced, and the tests run
// unmodified from the repository root.
//
// Usage: BLUMI_WORKBENCH_ROOT=/path/to/root npm --workspace @blumi/mobile run test:workbench

import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, readdirSync, statSync, symlinkSync, unlinkSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const WORKBENCH_ROOT_VARIABLE = "BLUMI_WORKBENCH_ROOT"
export const FIXTURE_PARENT = "docs/avatar-motion-pipeline"

const pipeline = (name) => `${FIXTURE_PARENT}/${name}`

// Test file (relative to apps/mobile) -> fixture trees it reads (repository-relative).
export const WORKBENCH_FIXTURE_TESTS = Object.freeze({
  "scripts/create_female_nondress_promotion_approval.test.mjs": [
    pipeline("female-nondress-promotion-evidence"),
    pipeline("female-combined-promotion-gate")
  ],
  "scripts/female-nondress-promotion-evidence.test.mjs": [pipeline("female-combined-promotion-gate")],
  "scripts/female-accessory-occlusion-staging.test.mjs": [
    pipeline("female-accessory-occlusion-staging"),
    pipeline("female-shoes-accessories-staging")
  ],
  "scripts/female-dress-capsule.test.mjs": [pipeline("render-sources")],
  "scripts/female-fresh-bottom-shoe-motion.test.mjs": [pipeline("female-fresh-bottom-shoe-capsule")],
  "scripts/female-fresh-bottom-shoe-static.test.mjs": [pipeline("female-fresh-bottom-shoe-capsule")],
  "scripts/female-new-tops-jackets-capsule.test.mjs": [pipeline("female-new-tops-jackets")],
  "scripts/male-premium-capsule-motion-contract.test.mjs": [pipeline("male-premium-capsule")],
  "scripts/male-premium-capsule-static-contract.test.mjs": [pipeline("male-premium-capsule")],
  "scripts/male-wardrobe-fit-profile.test.mjs": [pipeline("male-wardrobe-redesign")],
  "scripts/male-wardrobe-motion-fit.test.mjs": [pipeline("male-wardrobe-redesign")],
  "scripts/male-wardrobe-production-gate.test.mjs": [pipeline("male-wardrobe-redesign")],
  "scripts/male-wardrobe-redesign-status.test.mjs": [pipeline("male-wardrobe-redesign")],
  "scripts/male-young-drop-contract.test.mjs": [pipeline("male-young-drop")]
})

export function resolveWorkbenchRoot(environment) {
  const raw = environment[WORKBENCH_ROOT_VARIABLE]?.trim()
  if (!raw) {
    throw new Error(
      `${WORKBENCH_ROOT_VARIABLE} is not set. These tests guard shipped avatar assets against ` +
        "Workbench evidence and must not be skipped; point it at the directory that holds " +
        `${FIXTURE_PARENT}/... from the Blumi Art Workbench.`
    )
  }
  const root = path.resolve(raw)
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`${WORKBENCH_ROOT_VARIABLE}=${root} is not a directory.`)
  }
  return root
}

export function findMissingFixtures(workbenchRoot, tests = WORKBENCH_FIXTURE_TESTS) {
  const required = [...new Set(Object.values(tests).flat())].sort()
  return required.filter((relative) => !existsSync(path.join(workbenchRoot, relative)))
}

function pathExists(target) {
  try {
    lstatSync(target)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

// Links every Workbench child of FIXTURE_PARENT that the checkout lacks.
// Returns the created link paths; never replaces an existing path.
export function linkWorkbenchFixtures({ repositoryRoot, workbenchRoot }) {
  const source = path.join(workbenchRoot, FIXTURE_PARENT)
  const target = path.join(repositoryRoot, FIXTURE_PARENT)
  if (!existsSync(target)) throw new Error(`Repository directory ${FIXTURE_PARENT} is missing.`)
  const created = []
  for (const name of readdirSync(source)) {
    const link = path.join(target, name)
    if (pathExists(link)) continue
    symlinkSync(path.join(source, name), link)
    created.push(link)
  }
  return created
}

export function unlinkWorkbenchFixtures(created) {
  for (const link of created) {
    if (pathExists(link) && lstatSync(link).isSymbolicLink()) unlinkSync(link)
  }
}

export function runWorkbenchFixtureTests({ environment = process.env, repositoryRoot, mobileRoot, run = spawnSync } = {}) {
  const workbenchRoot = resolveWorkbenchRoot(environment)
  const missing = findMissingFixtures(workbenchRoot)
  if (missing.length > 0) {
    throw new Error(`Missing Workbench fixtures under ${workbenchRoot}:\n  ${missing.join("\n  ")}`)
  }
  const created = linkWorkbenchFixtures({ repositoryRoot, workbenchRoot })
  try {
    const files = Object.keys(WORKBENCH_FIXTURE_TESTS).map((file) => path.join(mobileRoot, file))
    const result = run(process.execPath, ["--test", ...files], { cwd: repositoryRoot, stdio: "inherit" })
    return result.status ?? 1
  } finally {
    unlinkWorkbenchFixtures(created)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  try {
    process.exitCode = runWorkbenchFixtureTests({ repositoryRoot: path.resolve(mobileRoot, "../.."), mobileRoot })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
