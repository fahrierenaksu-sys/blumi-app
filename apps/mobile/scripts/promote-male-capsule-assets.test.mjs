import assert from "node:assert/strict"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  promoteAssets,
  resolvePromotionRoots
} from "./promote-male-capsule-assets.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const expectedRepositoryRoot = resolve(scriptDirectory, "../../..")

test("promotion roots are anchored to the script instead of the caller cwd", () => {
  const originalCwd = process.cwd()
  const unrelatedCwd = mkdtempSync(join(tmpdir(), "male-capsule-cwd-"))

  try {
    process.chdir(unrelatedCwd)
    assert.equal(resolvePromotionRoots().repositoryRoot, expectedRepositoryRoot)
  } finally {
    process.chdir(originalCwd)
    rmSync(unrelatedCwd, { recursive: true, force: true })
  }
})

test("every source is preflighted before the first target is written", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "male-capsule-preflight-"))
  const sourceRoot = join(fixtureRoot, "source")
  const targetRoot = join(fixtureRoot, "target")
  mkdirSync(sourceRoot, { recursive: true })

  const validSource = join(sourceRoot, "valid.png")
  const missingSource = join(sourceRoot, "missing.png")
  const firstTarget = join(targetRoot, "first.png")
  const secondTarget = join(targetRoot, "second.png")
  writeFileSync(validSource, "approved-asset")

  try {
    assert.throws(
      () => promoteAssets([
        { source: validSource, destination: firstTarget, label: "valid" },
        { source: missingSource, destination: secondTarget, label: "missing" }
      ]),
      /promotion source is missing/
    )
    assert.equal(existsSync(firstTarget), false)
    assert.equal(existsSync(secondTarget), false)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("zero-byte sources fail preflight before any target is written", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "male-capsule-zero-byte-"))
  const validSource = join(fixtureRoot, "valid.png")
  const zeroByteSource = join(fixtureRoot, "zero.png")
  const firstTarget = join(fixtureRoot, "target", "first.png")
  const secondTarget = join(fixtureRoot, "target", "second.png")
  writeFileSync(validSource, "approved-asset")
  writeFileSync(zeroByteSource, "")

  try {
    assert.throws(
      () => promoteAssets([
        { source: validSource, destination: firstTarget },
        { source: zeroByteSource, destination: secondTarget }
      ]),
      /promotion source is invalid/
    )
    assert.equal(existsSync(firstTarget), false)
    assert.equal(existsSync(secondTarget), false)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("canonical destination aliases are rejected before either source is promoted", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "male-capsule-alias-"))
  const firstSource = join(fixtureRoot, "first.png")
  const secondSource = join(fixtureRoot, "second.png")
  const canonicalTarget = join(fixtureRoot, "target.png")
  const aliasTarget = `${fixtureRoot}/nested/../target.png`
  writeFileSync(firstSource, "first-approved-asset")
  writeFileSync(secondSource, "second-approved-asset")

  try {
    assert.throws(
      () => promoteAssets([
        { source: firstSource, destination: canonicalTarget },
        { source: secondSource, destination: aliasTarget }
      ]),
      /duplicate promotion destination/
    )
    assert.equal(existsSync(canonicalTarget), false)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("promotion is atomic per target and idempotent", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "male-capsule-idempotent-"))
  const source = join(fixtureRoot, "source.png")
  const destination = join(fixtureRoot, "nested", "target.png")
  writeFileSync(source, "approved-asset")

  try {
    const first = promoteAssets([{ source, destination, label: "fixture" }])
    const second = promoteAssets([{ source, destination, label: "fixture" }])

    assert.deepEqual(first, { promoted: 1, unchanged: 0 })
    assert.deepEqual(second, { promoted: 0, unchanged: 1 })
    assert.equal(readFileSync(destination, "utf8"), "approved-asset")
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("a failure after staging removes the temporary file and preserves the target", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "male-capsule-cleanup-"))
  const source = join(fixtureRoot, "source.png")
  const destination = join(fixtureRoot, "existing-target")
  writeFileSync(source, "approved-asset")
  mkdirSync(destination)

  try {
    assert.throws(() => promoteAssets([{ source, destination }]))
    const temporaryPrefix = `.${destination.split("/").at(-1)}.`
    const leftovers = readdirSync(fixtureRoot).filter(
      (name) => name.startsWith(temporaryPrefix) && name.endsWith(".tmp")
    )
    assert.deepEqual(leftovers, [])
    assert.equal(existsSync(destination), true)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
