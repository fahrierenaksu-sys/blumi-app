import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test, { after } from "node:test"

import sharp from "sharp"

import {
  REQUIRED_REDESIGN_STATES,
  auditMaleWardrobeRedesignStatus,
  collectMaleWardrobeCandidateRecords,
} from "./male-wardrobe-redesign-status.mjs"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const sourceManifest = JSON.parse(
  readFileSync(
    join(
      repositoryRoot,
      "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/asset-manifest.json",
    ),
    "utf8",
  ),
)
const temporaryRoots = []

after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true })
  }
})

const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "male-wardrobe-status-"))
  temporaryRoots.push(root)
  return root
}

const writeRgbaPng = async (root, path, width = 256, height = 384, red = 91) => {
  const absolutePath = join(root, path)
  mkdirSync(dirname(absolutePath), { recursive: true })
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: red, g: 117, b: 143, alpha: 0.8 },
    },
  }).png().toFile(absolutePath)
  const sha256 = createHash("sha256").update(readFileSync(absolutePath)).digest("hex")
  return { path, sha256 }
}

const runtimePathFor = (item, state) => {
  if (state === "static") {
    return `apps/mobile/src/features/avatarV2/assets/room/${item.runtimeFilename}`
  }
  const prefix = item.runtimeFilename
    .replace(/^avatar_room_/, "room_avatar_")
    .replace(/\.png$/, "")
  return `apps/mobile/src/features/avatarV2/assets/room/motion/${prefix}_${state}.png`
}

test("approved direct item manifests preserve approval and review evidence", async () => {
  const root = makeRoot()
  const item = sourceManifest.items.find(({ slug }) =>
    slug === "creative_utility_bottom")
  const states = Object.fromEntries(await Promise.all(
    REQUIRED_REDESIGN_STATES.map(async (state) => [
      state,
      {
        ...await writeRgbaPng(
          root,
          `${item.candidateRoot}/motion-v15/${state}-v15.png`,
        ),
        runtimeSha256: "a".repeat(64),
      },
    ]),
  ))
  const recordPath =
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/" +
    "creative-utility-bottom-v15-motion-manifest.json"
  mkdirSync(dirname(join(root, recordPath)), { recursive: true })
  writeFileSync(join(root, recordPath), JSON.stringify({
    recordType: "male_wardrobe_item_approval",
    approvalScope: "exact_item_static_4w1s_runtime",
    itemId: item.slug,
    candidateOnly: true,
    version: "v15",
    explicitUserApproval: true,
    approvalVerdict: "PASS",
    independentReviewVerdict: "PASS",
    frames: states,
  }))

  const collected = collectMaleWardrobeCandidateRecords(root)
  const direct = collected.records.find(({ recordPath: path }) =>
    path === recordPath)

  assert.equal(direct.itemId, item.slug)
  assert.equal(direct.explicitUserApproval, true)
  assert.equal(direct.approvalVerdict, "PASS")
  assert.equal(direct.independentReviewVerdict, "PASS")
  assert.deepEqual(Object.keys(direct.states).sort(), [...REQUIRED_REDESIGN_STATES].sort())
  assert.equal(direct.states.static.runtimeSha256, "a".repeat(64))
})

test("self-declared approval fields without an approval-record schema fail closed", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  const staticState = await writeRgbaPng(
    root,
    `${item.candidateRoot}/rig/static-review-v15.png`,
  )
  const recordPath =
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/" +
    "untrusted-self-declared-v15.json"
  mkdirSync(dirname(join(root, recordPath)), { recursive: true })
  writeFileSync(join(root, recordPath), JSON.stringify({
    itemId: item.slug,
    candidateOnly: true,
    version: "v15",
    explicitUserApproval: true,
    approvalVerdict: "PASS",
    independentReviewVerdict: "PASS",
    frames: { static: staticState },
  }))

  const collected = collectMaleWardrobeCandidateRecords(root)
  const direct = collected.records.find(({ recordPath: path }) =>
    path === recordPath)

  assert.equal(direct.explicitUserApproval, false)
  assert.equal(direct.approvalVerdict, "PENDING")
  assert.equal(direct.independentReviewVerdict, "PENDING")
})

test("inventory audit reports 27 tops, 19 bottoms, 8 shoes, and 54 total", async () => {
  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: makeRoot(),
    manifest: sourceManifest,
    candidateRecords: [],
  })

  assert.deepEqual(report.inventory, {
    expected: { top: 27, bottom: 19, shoes: 8, total: 54 },
    actual: { top: 27, bottom: 19, shoes: 8, total: 54 },
    valid: true,
  })
  assert.equal(report.items.length, 54)
})

test("existing planned and live runtime paths never count as redesigned candidates", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  await writeRgbaPng(root, item.candidatePaths.static)
  const liveRuntimePath =
    `apps/mobile/src/features/avatarV2/assets/room/${item.runtimeFilename}`
  await writeRgbaPng(root, liveRuntimePath)

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest: sourceManifest,
    candidateRecords: [],
  })
  const audited = report.items.find(({ slug }) => slug === item.slug)

  assert.equal(audited.runtime.exists, true)
  assert.equal(audited.runtime.role, "LIVE_RUNTIME_PRE_REDESIGN")
  assert.equal(audited.runtime.redesigned, false)
  assert.equal(audited.states.static.status, "UNRESOLVED")
  assert.equal(audited.states.static.path, null)
  assert.equal(report.summary.approvedVerifiedStates, 0)
})

test("only checksummed versioned candidate paths can become technically verified", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  const stateEntries = await Promise.all(
    REQUIRED_REDESIGN_STATES.map(async (state) => {
      const path =
        `docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/` +
        `candidates/${item.category}/${item.slug}/motion-v3/${state}-v3.png`
      return [state, await writeRgbaPng(root, path)]
    }),
  )
  const candidateRecords = [{
    itemId: item.slug,
    candidateOnly: true,
    version: "v3",
    recordPath:
      `docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/` +
      `candidates/${item.category}/${item.slug}/motion-v3/approval-v3.json`,
    explicitUserApproval: true,
    approvalVerdict: "PASS",
    independentReviewVerdict: "PASS",
    states: Object.fromEntries(stateEntries),
  }]

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest: sourceManifest,
    candidateRecords,
  })
  const audited = report.items.find(({ slug }) => slug === item.slug)

  assert.equal(audited.states.static.status, "APPROVED_VERIFIED")
  assert.equal(audited.states.static.image.width, 256)
  assert.equal(audited.states.static.image.height, 384)
  assert.equal(audited.states.static.image.channels, 4)
  assert.equal(audited.states.static.image.format, "png")
  assert.equal(audited.motion.exists, true)
  assert.equal(audited.motion.approvedVerified, true)
  assert.equal(audited.status, "APPROVED_CANDIDATE_RUNTIME_HOLD")
  assert.equal(audited.promotionEligible, false)
})

test("explicitly approved evidence outranks a newer unapproved candidate", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  const approved = await writeRgbaPng(
    root,
    `${item.candidateRoot}/rig/static-review-v2.png`,
  )
  const newerUnapproved = await writeRgbaPng(
    root,
    `${item.candidateRoot}/rig/static-review-v4.png`,
  )
  const baseRecord = {
    itemId: item.slug,
    candidateOnly: true,
    independentReviewVerdict: "PASS",
  }

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest: sourceManifest,
    candidateRecords: [
      {
        ...baseRecord,
        version: "v2",
        explicitUserApproval: true,
        approvalVerdict: "PASS",
        states: { static: approved },
      },
      {
        ...baseRecord,
        version: "v4",
        explicitUserApproval: false,
        approvalVerdict: "PENDING",
        states: { static: newerUnapproved },
      },
    ],
  })
  const audited = report.items.find(({ slug }) => slug === item.slug)

  assert.equal(audited.states.static.path, approved.path)
  assert.equal(audited.states.static.status, "APPROVED_VERIFIED")
})

test("a promotion flag cannot relabel mismatched old runtime pixels as redesigned", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  const states = Object.fromEntries(await Promise.all(
    REQUIRED_REDESIGN_STATES.map(async (state) => [
      state,
      await writeRgbaPng(
        root,
        `${item.candidateRoot}/motion-v3/${state}-v3.png`,
      ),
    ]),
  ))
  const manifest = {
    ...sourceManifest,
    runtimePromotionAllowed: true,
    items: sourceManifest.items.map((candidate) =>
      candidate.slug === item.slug
        ? { ...candidate, runtimePromoted: true }
        : candidate),
  }
  await writeRgbaPng(
    root,
    `apps/mobile/src/features/avatarV2/assets/room/${item.runtimeFilename}`,
    256,
    384,
    12,
  )

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest,
    candidateRecords: [{
      itemId: item.slug,
      candidateOnly: true,
      version: "v3",
      explicitUserApproval: true,
      approvalVerdict: "PASS",
      independentReviewVerdict: "PASS",
      states,
    }],
  })
  const audited = report.items.find(({ slug }) => slug === item.slug)

  assert.equal(audited.runtime.exists, true)
  assert.equal(audited.runtime.redesigned, false)
  assert.equal(audited.runtime.role, "LIVE_RUNTIME_INCOMPLETE_OR_STALE")
})

test("a hash-bound normalized runtime derivative is recognized without relabeling candidate bytes", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  const states = Object.fromEntries(await Promise.all(
    REQUIRED_REDESIGN_STATES.map(async (state) => [
      state,
      await writeRgbaPng(
        root,
        `${item.candidateRoot}/motion-v3/${state}-v3.png`,
      ),
    ]),
  ))
  const runtimeStates = Object.fromEntries(await Promise.all(
    REQUIRED_REDESIGN_STATES.map(async (state) => [
      state,
      await writeRgbaPng(root, runtimePathFor(item, state), 256, 384, 12),
    ]),
  ))
  for (const state of REQUIRED_REDESIGN_STATES) {
    states[state].runtimeSha256 = runtimeStates[state].sha256
  }
  const manifest = {
    ...sourceManifest,
    runtimePromotionAllowed: true,
    items: sourceManifest.items.map((candidate) =>
      candidate.slug === item.slug
        ? { ...candidate, runtimePromoted: true }
        : candidate),
  }

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest,
    candidateRecords: [{
      itemId: item.slug,
      candidateOnly: true,
      version: "v3",
      explicitUserApproval: true,
      approvalVerdict: "PASS",
      independentReviewVerdict: "PASS",
      states,
    }],
  })
  const audited = report.items.find(({ slug }) => slug === item.slug)

  assert.notEqual(audited.states.static.actualSha256, runtimeStates.static.sha256)
  assert.equal(
    audited.states.static.expectedRuntimeSha256,
    runtimeStates.static.sha256,
  )
  assert.equal(audited.runtime.verifiedStateCount, 6)
  assert.equal(audited.runtime.redesigned, true)
  assert.equal(audited.runtime.role, "LIVE_RUNTIME_PROMOTED_REDESIGN")
})

test("a missing promoted motion frame prevents item-level runtime verification", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  const states = Object.fromEntries(await Promise.all(
    REQUIRED_REDESIGN_STATES.map(async (state) => {
      const candidate = await writeRgbaPng(
        root,
        `${item.candidateRoot}/motion-v3/${state}-v3.png`,
      )
      const runtime = state === "walking_front_f04"
        ? null
        : await writeRgbaPng(root, runtimePathFor(item, state), 256, 384, 12)
      return [state, {
        ...candidate,
        runtimeSha256: runtime?.sha256 ?? "f".repeat(64),
      }]
    }),
  ))
  const manifest = {
    ...sourceManifest,
    runtimePromotionAllowed: true,
    items: sourceManifest.items.map((candidate) =>
      candidate.slug === item.slug
        ? { ...candidate, runtimePromoted: true }
        : candidate),
  }

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest,
    candidateRecords: [{
      itemId: item.slug,
      candidateOnly: true,
      version: "v3",
      explicitUserApproval: true,
      approvalVerdict: "PASS",
      independentReviewVerdict: "PASS",
      states,
    }],
  })
  const audited = report.items.find(({ slug }) => slug === item.slug)

  assert.equal(audited.runtime.verifiedStateCount, 5)
  assert.equal(audited.runtime.states.walking_front_f04.exists, false)
  assert.equal(audited.runtime.redesigned, false)
  assert.equal(audited.runtime.role, "LIVE_RUNTIME_INCOMPLETE_OR_STALE")
})

test("wrong canvas, stale checksum, unversioned path, and runtime path fail closed", async () => {
  const root = makeRoot()
  const [wrongCanvasItem, staleItem, unversionedItem, runtimeItem] =
    sourceManifest.items.slice(0, 4)
  const wrongCanvas = await writeRgbaPng(
    root,
    `docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/` +
      `candidates/top/${wrongCanvasItem.slug}/rig/static-v2.png`,
    128,
    192,
  )
  const stale = await writeRgbaPng(
    root,
    `docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/` +
      `candidates/top/${staleItem.slug}/rig/static-v2.png`,
  )
  const unversioned = await writeRgbaPng(
    root,
    `docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/` +
      `candidates/top/${unversionedItem.slug}/rig/static.png`,
  )
  const runtime = await writeRgbaPng(
    root,
    `apps/mobile/src/features/avatarV2/assets/room/${runtimeItem.runtimeFilename}`,
  )
  const record = (itemId, state) => ({
    itemId,
    candidateOnly: true,
    version: "v2",
    explicitUserApproval: true,
    approvalVerdict: "PASS",
    independentReviewVerdict: "PASS",
    states: { static: state },
  })

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest: sourceManifest,
    candidateRecords: [
      record(wrongCanvasItem.slug, wrongCanvas),
      record(staleItem.slug, { ...stale, sha256: "0".repeat(64) }),
      record(unversionedItem.slug, unversioned),
      record(runtimeItem.slug, runtime),
    ],
  })
  const bySlug = Object.fromEntries(report.items.map((item) => [item.slug, item]))

  assert.equal(bySlug[wrongCanvasItem.slug].states.static.status, "INVALID_IMAGE")
  assert.equal(bySlug[staleItem.slug].states.static.status, "CHECKSUM_MISMATCH")
  assert.equal(bySlug[unversionedItem.slug].states.static.status, "UNRESOLVED")
  assert.equal(bySlug[runtimeItem.slug].states.static.status, "UNRESOLVED")
  assert.match(
    report.recordErrors.map(({ reason }) => reason).join("\n"),
    /versioned candidate-only path/,
  )
})

test("out-of-scope motion candidates do not block the active 54-item catalog audit", async () => {
  const root = makeRoot()
  const item = sourceManifest.items[0]
  const states = Object.fromEntries(await Promise.all(
    REQUIRED_REDESIGN_STATES.map(async (state) => [
      state,
      await writeRgbaPng(
        root,
        `${item.candidateRoot}/motion-v3/${state}-v3.png`,
      ),
    ]),
  ))

  const report = await auditMaleWardrobeRedesignStatus({
    repositoryRoot: root,
    manifest: sourceManifest,
    candidateRecords: [{
      recordType: "male_wardrobe_item_motion_candidate",
      itemId: "matte_black_panto_sunglasses",
      candidateOnly: true,
      version: "v1",
      recordPath:
        "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/" +
        "candidates/accessory/matte_black_panto_sunglasses/motion_v1/motion-manifest.json",
      explicitUserApproval: false,
      approvalVerdict: "PENDING",
      independentReviewVerdict: "PASS",
      states,
    }],
  })

  assert.equal(report.recordErrors.length, 0)
  assert.equal(report.items.length, 54)
})

test("current checkout audit never exposes runtime or unversioned paths as candidates", async () => {
  const report = await auditMaleWardrobeRedesignStatus({ repositoryRoot })

  assert.equal(report.inventory.valid, true)
  assert.equal(report.summary.promotedRedesignRuntimeAssets, 54)
  assert.equal(report.verdict, "PASS")
  for (const item of report.items) {
    for (const state of REQUIRED_REDESIGN_STATES) {
      const candidate = item.states[state]
      if (candidate.path === null) continue
      assert.match(
        candidate.path,
        /^docs\/avatar-motion-pipeline\/male-wardrobe-redesign\/2026-07-27\//,
      )
      assert.doesNotMatch(candidate.path, /^apps\/mobile\/src\//)
      assert.match(candidate.path, /(?:^|[-_/])v\d+(?:[._/-]|$)/)
      if (candidate.exists) {
        assert.deepEqual(
          {
            width: candidate.image.width,
            height: candidate.image.height,
            channels: candidate.image.channels,
            format: candidate.image.format,
            hasAlpha: candidate.image.hasAlpha,
          },
          { width: 256, height: 384, channels: 4, format: "png", hasAlpha: true },
        )
      }
    }
  }
})
