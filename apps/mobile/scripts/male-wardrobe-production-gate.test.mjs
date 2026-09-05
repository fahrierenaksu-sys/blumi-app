import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const evidencePath = resolve(
  repositoryRoot,
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/" +
    "male-wardrobe-66-runtime-promotion-evidence-v1.json",
)
const requiredStates = [
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01",
]

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex")

const resolveRepositoryPath = (relativePath) => {
  assert.equal(relativePath.startsWith("/"), false, `${relativePath} must be relative`)
  assert.equal(relativePath.split("/").includes(".."), false, `${relativePath} escapes`)
  const path = resolve(repositoryRoot, relativePath)
  assert.ok(path.startsWith(`${repositoryRoot}/`), `${relativePath} escapes repository`)
  return path
}

const readPng = (path) => PNG.sync.read(readFileSync(path))

const assertRuntimeDerivative = (candidate, runtime, label) => {
  assert.deepEqual(
    [candidate.width, candidate.height],
    [256, 384],
    `${label} candidate canvas`,
  )
  assert.deepEqual(
    [runtime.width, runtime.height],
    [256, 384],
    `${label} runtime canvas`,
  )
  let visiblePixels = 0
  for (let offset = 0; offset < candidate.data.length; offset += 4) {
    const candidateAlpha = candidate.data[offset + 3]
    const runtimeAlpha = runtime.data[offset + 3]
    assert.equal(runtimeAlpha, candidateAlpha, `${label} alpha changed at ${offset / 4}`)
    if (candidateAlpha === 0) {
      assert.deepEqual(
        [...runtime.data.subarray(offset, offset + 3)],
        [0, 0, 0],
        `${label} hidden RGB residue at ${offset / 4}`,
      )
      continue
    }
    visiblePixels += 1
    assert.deepEqual(
      [...runtime.data.subarray(offset, offset + 3)],
      [...candidate.data.subarray(offset, offset + 3)],
      `${label} visible art changed at ${offset / 4}`,
    )
  }
  assert.ok(visiblePixels > 0, `${label} must contain visible art`)
}

test("runtime promotion evidence is exact, current, and independently reviewed", () => {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"))
  assert.equal(evidence.schemaVersion, 1)
  assert.equal(evidence.verdict, "PASS")
  assert.equal(evidence.itemCount, 66)
  assert.equal(evidence.fileCount, 396)
  assert.equal(evidence.explicitUserApproval, true)

  for (const contract of Object.values(evidence.contracts)) {
    const path = resolveRepositoryPath(contract.path)
    assert.equal(sha256(path), contract.sha256, `${contract.path} drift`)
  }
  const review = JSON.parse(
    readFileSync(resolveRepositoryPath(evidence.contracts.independentReview.path), "utf8"),
  )
  assert.equal(review.verdict, "PASS")
  assert.equal(review.reviewedItemCount, 66)
  assert.equal(review.boardSha256, evidence.contracts.board.sha256)
  assert.equal(review.selectionSha256, evidence.contracts.selection.sha256)
})

test("all 66 approved items expose exact static plus 4W+1S runtime derivatives", () => {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"))
  const identities = new Set()
  let frameCount = 0

  for (const item of evidence.items) {
    const identity = `${item.category}:${item.slug}`
    assert.equal(identities.has(identity), false, `duplicate ${identity}`)
    identities.add(identity)
    assert.deepEqual(Object.keys(item.frames).sort(), [...requiredStates].sort())

    for (const state of requiredStates) {
      const frame = item.frames[state]
      const candidatePath = resolveRepositoryPath(frame.candidatePath)
      const runtimePath = resolveRepositoryPath(frame.runtimePath)
      assert.match(
        frame.candidatePath,
        /^docs\/avatar-motion-pipeline\//,
      )
      assert.match(
        frame.runtimePath,
        /^apps\/mobile\/src\/features\/avatarV2\/assets\/room\//,
      )
      assert.equal(sha256(candidatePath), frame.candidateSha256, `${identity}/${state} candidate`)
      assert.equal(sha256(runtimePath), frame.runtimeSha256, `${identity}/${state} runtime`)
      assertRuntimeDerivative(
        readPng(candidatePath),
        readPng(runtimePath),
        `${identity}/${state}`,
      )
      frameCount += 1
    }
  }

  assert.equal(identities.size, 66)
  assert.equal(frameCount, 396)
})
