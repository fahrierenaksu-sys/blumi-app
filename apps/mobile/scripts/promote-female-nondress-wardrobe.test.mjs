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
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { PNG } from "pngjs"

import {
  PROMOTION_ITEMS,
  STATES,
  buildFixturePlan,
  checkPromoted,
  createPromotionPlan,
  inspectPromotion,
  promotePlanAtomically,
  resolvePromotionRoots,
  validateApprovalManifest,
  validateProductionPlan
} from "./promote-female-nondress-wardrobe.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const expectedRepositoryRoot = resolve(scriptDirectory, "../../..")

const writePng = (path, { width = 256, height = 384, colorType = 6, seed = 1 } = {}) => {
  mkdirSync(dirname(path), { recursive: true })
  const png = new PNG({ width, height })
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = seed
    png.data[offset + 1] = seed * 2
    png.data[offset + 2] = seed * 3
    png.data[offset + 3] = 255
  }
  writeFileSync(path, PNG.sync.write(png, { colorType }))
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const approvedManifest = (plan, root) => ({
  schemaVersion: 2,
  verdict: "PASS",
  producer: "producer-agent",
  independentReviewer: "reviewer-agent",
  reviewerRole: "independent",
  reviewedAt: "2026-07-15T12:00:00.000Z",
  items: Object.fromEntries(
    [...new Set(plan.map(({ itemKey }) => itemKey))].map((itemKey, itemIndex) => {
      const itemPlan = plan.filter((entry) => entry.itemKey === itemKey)
      const evidence = ["static_full_body", "close_up", "motion_contact_sheet"].map((type, evidenceIndex) => {
        const path = join(root, "evidence", `${itemKey.replace(":", "-")}-${type}.png`)
        writePng(path, { seed: 8 + itemIndex * 3 + evidenceIndex })
        return { type, path, sha256: sha256(path) }
      })
      return [itemKey, {
        verdict: "PASS",
        sources: Object.fromEntries(itemPlan.map(({ state, source }) => [state, sha256(source)])),
        evidence
      }]
    })
  )
})

test("promotion roots are script-anchored and the production mapping is nondress-only", () => {
  const originalCwd = process.cwd()
  const unrelated = mkdtempSync(join(tmpdir(), "female-promotion-cwd-"))
  try {
    process.chdir(unrelated)
    assert.equal(resolvePromotionRoots().repositoryRoot, expectedRepositoryRoot)
  } finally {
    process.chdir(originalCwd)
    rmSync(unrelated, { recursive: true, force: true })
  }

  assert.equal(PROMOTION_ITEMS.length, 18)
  assert.deepEqual(
    PROMOTION_ITEMS.filter(({ kind }) => kind === "bottom").map(({ slug }) => slug).sort(),
    [
      "black_palm_embellished_pants",
      "coral_embellished_laceup_pants",
      "denim_skort_shorts",
      "layered_lace_ruffle_mini_skirt",
      "smoky_floral_mesh_pants",
      "striped_crochet_shorts",
      "yellow_bow_lace_ruffle_skirt"
    ]
  )
  assert.equal(PROMOTION_ITEMS.some(({ slug }) => slug.includes("dress")), false)
  const plan = createPromotionPlan()
  assert.equal(plan.length, PROMOTION_ITEMS.length * STATES.length)
  assert.equal(new Set(plan.map(({ destination }) => resolve(destination))).size, plan.length)
  for (const entry of plan.filter(({ staging }) => staging === "long-pant-refit")) {
    assert.equal(entry.source.endsWith(entry.state === "static" ? "/static.png" : `/${entry.state}.png`), true)
  }
  assert.doesNotThrow(() => validateProductionPlan(plan))
  assert.throws(() => validateProductionPlan(plan.slice(0, -1)), /exactly 108 states/)
  assert.throws(
    () => validateProductionPlan(plan.map((entry, index) => index === 0 ? { ...entry, slug: "not-approved", itemKey: "top:not-approved" } : entry)),
    /production allowlist mismatch/
  )
})

test("approval is independent, item-complete, evidence-backed, and fail-closed", () => {
  const root = mkdtempSync(join(tmpdir(), "female-promotion-approval-"))
  const plan = buildFixturePlan(root, { itemCount: 2 })
  try {
    for (const [index, entry] of plan.entries()) writePng(entry.source, { seed: index + 1 })
    const approval = approvedManifest(plan, root)
    assert.doesNotThrow(() => validateApprovalManifest({ approval, plan, repositoryRoot: root }))

    assert.throws(
      () => validateApprovalManifest({ approval: { ...approval, verdict: "HOLD" }, plan, repositoryRoot: root }),
      /overall verdict must be PASS/
    )
    assert.throws(
      () => validateApprovalManifest({ approval: { ...approval, independentReviewer: approval.producer }, plan, repositoryRoot: root }),
      /reviewer must be independent/
    )
    const [firstKey] = Object.keys(approval.items)
    const incomplete = { ...approval, items: { ...approval.items } }
    delete incomplete.items[firstKey]
    assert.throws(
      () => validateApprovalManifest({ approval: incomplete, plan, repositoryRoot: root }),
      /missing item approval/
    )
    assert.throws(
      () => validateApprovalManifest({ approval: undefined, plan, repositoryRoot: root }),
      /approval manifest is required/
    )

    writePng(plan[0].source, { seed: 222 })
    assert.throws(
      () => validateApprovalManifest({ approval, plan, repositoryRoot: root }),
      /reviewed source hash mismatch/
    )
    writePng(plan[0].source, { seed: 1 })

    const staleEvidence = structuredClone(approval)
    writePng(staleEvidence.items[firstKey].evidence[0].path, { seed: 201 })
    assert.throws(
      () => validateApprovalManifest({ approval: staleEvidence, plan, repositoryRoot: root }),
      /evidence hash mismatch/
    )

    const reusedEvidence = approvedManifest(plan, root)
    const [secondKey] = Object.keys(reusedEvidence.items).slice(1)
    reusedEvidence.items[secondKey].evidence[0] = reusedEvidence.items[firstKey].evidence[0]
    assert.throws(
      () => validateApprovalManifest({ approval: reusedEvidence, plan, repositoryRoot: root }),
      /evidence cannot be reused across items/
    )

    const missingEvidenceType = approvedManifest(plan, root)
    missingEvidenceType.items[firstKey].evidence[1] = {
      ...missingEvidenceType.items[firstKey].evidence[1],
      type: "static_full_body"
    }
    assert.throws(
      () => validateApprovalManifest({ approval: missingEvidenceType, plan, repositoryRoot: root }),
      /missing required evidence type: close_up/
    )

    const sameItemPathReuse = approvedManifest(plan, root)
    sameItemPathReuse.items[firstKey].evidence[1] = {
      ...sameItemPathReuse.items[firstKey].evidence[1],
      path: sameItemPathReuse.items[firstKey].evidence[0].path,
      sha256: sameItemPathReuse.items[firstKey].evidence[0].sha256
    }
    assert.throws(
      () => validateApprovalManifest({ approval: sameItemPathReuse, plan, repositoryRoot: root }),
      /three distinct evidence paths and hashes/
    )

    const sameItemHashReuse = approvedManifest(plan, root)
    writeFileSync(
      sameItemHashReuse.items[firstKey].evidence[1].path,
      readFileSync(sameItemHashReuse.items[firstKey].evidence[0].path)
    )
    sameItemHashReuse.items[firstKey].evidence[1].sha256 = sameItemHashReuse.items[firstKey].evidence[0].sha256
    assert.throws(
      () => validateApprovalManifest({ approval: sameItemHashReuse, plan, repositoryRoot: root }),
      /three distinct evidence paths and hashes/
    )

    const extraEvidence = approvedManifest(plan, root)
    const extraPath = join(root, "evidence", "unrelated-fourth.png")
    writePng(extraPath, { seed: 77 })
    extraEvidence.items[firstKey].evidence.push({ type: "montage", path: extraPath, sha256: sha256(extraPath) })
    assert.throws(
      () => validateApprovalManifest({ approval: extraEvidence, plan, repositoryRoot: root }),
      /exactly three evidence entries/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("preflight rejects missing, wrong-size, non-RGBA, and incomplete state sets before writes", () => {
  const root = mkdtempSync(join(tmpdir(), "female-promotion-png-"))
  const plan = buildFixturePlan(root, { itemCount: 1 })
  try {
    for (const [index, entry] of plan.entries()) writePng(entry.source, { seed: index + 1 })
    const approval = approvedManifest(plan, root)
    rmSync(plan[1].source)
    let report = inspectPromotion({ plan, approval, repositoryRoot: root })
    assert.equal(report.ready, false)
    assert.match(report.errors.join("\n"), /missing source|incomplete state set/)
    assert.equal(plan.some(({ destination }) => existsSync(destination)), false)

    writePng(plan[1].source, { width: 128 })
    report = inspectPromotion({ plan, approval, repositoryRoot: root })
    assert.match(report.errors.join("\n"), /must be 256x384/)

    writePng(plan[1].source, { colorType: 0 })
    report = inspectPromotion({ plan, approval, repositoryRoot: root })
    assert.match(report.errors.join("\n"), /must be RGBA/)

    writePng(plan[1].source)
    writePng(join(dirname(plan[1].source), "walking_front_f05.png"))
    report = inspectPromotion({ plan, approval, repositoryRoot: root })
    assert.match(report.errors.join("\n"), /unexpected state asset/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("dry-run reports source/destination differences without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "female-promotion-dry-"))
  const plan = buildFixturePlan(root, { itemCount: 1 })
  try {
    for (const [index, entry] of plan.entries()) writePng(entry.source, { seed: index + 1 })
    const approval = approvedManifest(plan, root)
    writePng(plan[0].destination, { seed: 99 })
    const before = readFileSync(plan[0].destination)
    const report = inspectPromotion({ plan, approval, repositoryRoot: root })
    assert.equal(report.ready, true)
    assert.equal(report.destinationMissing, STATES.length - 1)
    assert.equal(report.sourceDestinationDifferences, 1)
    assert.equal(report.staticStateMismatches.length, 1)
    assert.deepEqual(readFileSync(plan[0].destination), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("promotion uses a batch transaction, is idempotent, and --check detects drift", () => {
  const root = mkdtempSync(join(tmpdir(), "female-promotion-atomic-"))
  const plan = buildFixturePlan(root, { itemCount: 1 })
  try {
    for (const [index, entry] of plan.entries()) {
      writePng(entry.source, { seed: index + 1 })
      writePng(entry.destination, { seed: 90 + index })
    }
    const approval = approvedManifest(plan, root)
    const first = promotePlanAtomically({ plan, approval, repositoryRoot: root })
    assert.deepEqual(first, { promoted: STATES.length, unchanged: 0 })
    assert.equal(checkPromoted({ plan, approval, repositoryRoot: root }).ok, true)
    const second = promotePlanAtomically({ plan, approval, repositoryRoot: root })
    assert.deepEqual(second, { promoted: 0, unchanged: STATES.length })

    writePng(plan[2].destination, { seed: 201 })
    const drift = checkPromoted({ plan, approval, repositoryRoot: root })
    assert.equal(drift.ok, false)
    assert.match(drift.errors.join("\n"), /destination hash mismatch/)

    const leftovers = readdirSync(dirname(plan[0].destination)).filter(
      (name) => name.includes(".promotion-") || name.endsWith(".bak")
    )
    assert.deepEqual(leftovers, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("injected install failure never exposes a missing live path and restores every destination hash", () => {
  const root = mkdtempSync(join(tmpdir(), "female-promotion-install-failure-"))
  const plan = buildFixturePlan(root, { itemCount: 2 })
  try {
    for (const [index, entry] of plan.entries()) {
      writePng(entry.source, { seed: index + 1 })
      writePng(entry.destination, { seed: 100 + index })
    }
    const before = new Map(plan.map(({ destination }) => [destination, sha256(destination)]))
    const approval = approvedManifest(plan, root)
    const observedMissing = []
    assert.throws(
      () => promotePlanAtomically({
        plan,
        approval,
        repositoryRoot: root,
        testHooks: {
          afterInstall: ({ index }) => {
            observedMissing.push(...plan.filter(({ destination }) => !existsSync(destination)).map(({ destination }) => destination))
            if (index === 3) throw new Error("injected install failure")
          }
        }
      }),
      /injected install failure/
    )
    assert.deepEqual(observedMissing, [])
    assert.deepEqual(plan.map(({ destination }) => sha256(destination)), plan.map(({ destination }) => before.get(destination)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("injected post-check failure restores every live hash without a missing-path window", () => {
  const root = mkdtempSync(join(tmpdir(), "female-promotion-postcheck-failure-"))
  const plan = buildFixturePlan(root, { itemCount: 1 })
  try {
    for (const [index, entry] of plan.entries()) {
      writePng(entry.source, { seed: index + 1 })
      writePng(entry.destination, { seed: 180 + index })
    }
    const before = new Map(plan.map(({ destination }) => [destination, sha256(destination)]))
    const approval = approvedManifest(plan, root)
    const missing = []
    assert.throws(
      () => promotePlanAtomically({
        plan,
        approval,
        repositoryRoot: root,
        testHooks: {
          beforePostCheck: () => {
            missing.push(...plan.filter(({ destination }) => !existsSync(destination)).map(({ destination }) => destination))
            throw new Error("injected post-check failure")
          },
          afterRollback: () => missing.push(...plan.filter(({ destination }) => !existsSync(destination)).map(({ destination }) => destination))
        }
      }),
      /injected post-check failure/
    )
    assert.deepEqual(missing, [])
    assert.deepEqual(plan.map(({ destination }) => sha256(destination)), plan.map(({ destination }) => before.get(destination)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("backup cleanup failure after commit cannot roll back or remove current live destinations", () => {
  const root = mkdtempSync(join(tmpdir(), "female-promotion-cleanup-failure-"))
  const plan = buildFixturePlan(root, { itemCount: 1 })
  try {
    for (const [index, entry] of plan.entries()) {
      writePng(entry.source, { seed: index + 1 })
      writePng(entry.destination, { seed: 210 + index })
    }
    const approval = approvedManifest(plan, root)
    const cleanupAttempts = []
    const result = promotePlanAtomically({
      plan,
      approval,
      repositoryRoot: root,
      testHooks: {
        beforeBackupCleanup: ({ index }) => {
          cleanupAttempts.push(index)
          if (index === 0) throw new Error("injected cleanup failure")
        },
        onBackupCleanupError: () => {}
      }
    })

    assert.deepEqual(result, { promoted: STATES.length, unchanged: 0 })
    assert.equal(cleanupAttempts.length, STATES.length)
    assert.equal(checkPromoted({ plan, approval, repositoryRoot: root }).ok, true)
    for (const entry of plan) {
      assert.equal(existsSync(entry.destination), true)
      assert.equal(sha256(entry.destination), sha256(entry.source))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
