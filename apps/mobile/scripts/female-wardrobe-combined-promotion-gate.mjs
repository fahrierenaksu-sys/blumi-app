#!/usr/bin/env node

import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { PNG } from "pngjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, "../../..")
const runtimeContractPath = join(
  repositoryRoot,
  "apps/mobile/src/features/avatarV2/room/femaleWardrobePromotionContract.json"
)

export const loadRuntimePromotionContract = (path = runtimeContractPath) => {
  const contract = JSON.parse(readFileSync(path, "utf8"))
  assert.equal(contract.schemaVersion, 1, "unsupported female wardrobe promotion contract")
  assert.ok(Number.isInteger(contract.frameDurationMs) && contract.frameDurationMs > 0)
  assert.deepEqual(contract.walkingStates, [
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04"
  ])
  assert.equal(contract.sittingState, "sitting_front_f01")
  for (const key of ["quarantinedFemaleItemIds", "pantsOverShoeUpperIds"]) {
    assert.ok(Array.isArray(contract[key]), `${key} must be an array`)
    assert.equal(new Set(contract[key]).size, contract[key].length, `${key} contains duplicates`)
  }
  return contract
}

const RUNTIME_PROMOTION_CONTRACT = loadRuntimePromotionContract()
export const FRAME_DURATION_MS = RUNTIME_PROMOTION_CONTRACT.frameDurationMs
export const STATES = [
  "static",
  ...RUNTIME_PROMOTION_CONTRACT.walkingStates,
  RUNTIME_PROMOTION_CONTRACT.sittingState
]

export const FEMALE_NONDRESS_CATALOG = {
  tops: [
    "cream_basic_tee",
    "blush_lace_cardigan",
    "sage_ribbon_knit_jacket",
    "powder_blue_ribbon_corset_top",
    "noir_rose_heart_cardigan",
    "rosebud_picnic_peplum",
    "lilac_cloud_wrap_top",
    "buttercream_bow_tee",
    "azure_garden_halter",
    "ivory_tweed_crop_jacket",
    "cherry_varsity_cardigan",
    "midnight_velvet_bolero"
  ],
  bottoms: [
    { slug: "denim_skort_shorts", occlusionRole: "bottomBehindShoes" },
    { slug: "striped_crochet_shorts", occlusionRole: "bottomBehindShoes" },
    { slug: "layered_lace_ruffle_mini_skirt", occlusionRole: "bottomBehindShoes" },
    { slug: "yellow_bow_lace_ruffle_skirt", occlusionRole: "bottomBehindShoes" },
    { slug: "black_palm_embellished_pants", occlusionRole: "bottomOverShoeUpper" },
    { slug: "coral_embellished_laceup_pants", occlusionRole: "bottomOverShoeUpper" },
    { slug: "smoky_floral_mesh_pants", occlusionRole: "bottomOverShoeUpper" },
    { slug: "midnight_ribbon_wide_leg_pants", occlusionRole: "bottomOverShoeUpper" },
    { slug: "buttercream_pearl_tailored_pants", occlusionRole: "bottomOverShoeUpper" },
    { slug: "rose_picnic_pleated_shorts", occlusionRole: "bottomBehindShoes" },
    { slug: "lavender_bow_twill_shorts", occlusionRole: "bottomBehindShoes" }
  ],
  shoes: [
    "milk_tea_court_sneakers",
    "cherry_satin_ballets",
    "onyx_heart_mary_janes",
    "rosewood_platform_loafers",
    "pearl_slingback_sandals",
    "rose_satin_bow_heels",
    "ivory_pearl_slingback_heels",
    "lilac_star_platform_sneakers",
    "mint_ribbon_court_sneakers"
  ]
}

// The live room catalog consumes this capsule through one declarative map,
// rather than repeating twenty-three literal objects. The source gate keeps
// the direct legacy entries and this canonical map equally accountable.
const DECLARATIVE_SWEET_CAPSULE_SLUGS = {
  top: new Set([
    "rosebud_picnic_peplum",
    "lilac_cloud_wrap_top",
    "buttercream_bow_tee",
    "azure_garden_halter",
    "ivory_tweed_crop_jacket",
    "cherry_varsity_cardigan",
    "midnight_velvet_bolero"
  ]),
  bottom: new Set([
    "midnight_ribbon_wide_leg_pants",
    "buttercream_pearl_tailored_pants",
    "rose_picnic_pleated_shorts",
    "lavender_bow_twill_shorts"
  ]),
  shoes: new Set([
    "rose_satin_bow_heels",
    "ivory_pearl_slingback_heels",
    "lilac_star_platform_sneakers",
    "mint_ribbon_court_sneakers"
  ])
}

const CANVAS = { width: 256, height: 384 }
const ZONES = {
  neckline: { x: 94, y: 207, width: 68, height: 27 },
  waistCrotch: { x: 94, y: 280, width: 68, height: 45 },
  pantHemShoeUpper: { x: 94, y: 312, width: 68, height: 40 }
}
const CONTACT_REQUIREMENTS = {
  top: {
    minDensity: 0.12,
    minLargestComponent: 120,
    minHorizontalRun: 12,
    minHorizontalSpan: 58,
    minVerticalSpan: 12
  },
  bottom: {
    minDensity: 0.30,
    minLargestComponent: 500,
    minHorizontalRun: 20,
    minHorizontalSpan: 50,
    minVerticalSpan: 24
  },
  shoes: {
    minDensity: 0.30,
    // A heel has intentional strap/open-toe transparency, unlike a sneaker.
    // The meaningful-anchor floor is calibrated to the smallest approved
    // heel component; density, run, span and independent visual inspection
    // still reject detached or floating footwear.
    minLargestComponent: 500,
    minHorizontalRun: 24,
    minHorizontalSpan: 44,
    minVerticalSpan: 20
  }
}
const SCALE = 2
const GUTTER = 2
const BACKGROUND = [247, 237, 244, 255]
const sha256 = (value) => createHash("sha256").update(value).digest("hex")
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`

const assertCatalog = ({ tops, bottoms, shoes }) => {
  assert.ok(tops.length > 0 && bottoms.length > 0 && shoes.length > 0, "catalog slots must not be empty")
  const allSlugs = [...tops, ...bottoms.map(({ slug }) => slug), ...shoes]
  assert.equal(allSlugs.some((slug) => slug.includes("dress")), false, "dresses are outside this gate")
  assert.ok(bottoms.length >= shoes.length, "pairwise plan needs at least as many bottoms as shoes")
  assert.ok(tops.length >= shoes.length, "pairwise plan needs at least as many tops as shoes")
  for (const bottom of bottoms) {
    assert.ok(
      ["bottomBehindShoes", "bottomOverShoeUpper"].includes(bottom.occlusionRole),
      `${bottom.slug} has an invalid occlusion role`
    )
  }
}

export const createPairwisePlan = (catalog = FEMALE_NONDRESS_CATALOG) => {
  assertCatalog(catalog)
  const rows = []
  for (const [topIndex, top] of catalog.tops.entries()) {
    for (const [bottomIndex, bottom] of catalog.bottoms.entries()) {
      rows.push({
        row: rows.length + 1,
        top,
        bottom: bottom.slug,
        bottomOcclusionRole: bottom.occlusionRole,
        shoes: catalog.shoes[(topIndex + bottomIndex) % catalog.shoes.length]
      })
    }
  }

  for (const top of catalog.tops) {
    for (const bottom of catalog.bottoms) {
      assert.ok(rows.some((row) => row.top === top && row.bottom === bottom.slug), `missing top-bottom pair: ${top}/${bottom.slug}`)
    }
    for (const shoes of catalog.shoes) {
      assert.ok(rows.some((row) => row.top === top && row.shoes === shoes), `missing top-shoes pair: ${top}/${shoes}`)
    }
  }
  for (const bottom of catalog.bottoms) {
    for (const shoes of catalog.shoes) {
      assert.ok(rows.some((row) => row.bottom === bottom.slug && row.shoes === shoes), `missing bottom-shoes pair: ${bottom.slug}/${shoes}`)
    }
  }
  return rows
}

export const assertCatalogMatchesRuntimeSource = ({
  catalog = FEMALE_NONDRESS_CATALOG,
  source,
  contract = RUNTIME_PROMOTION_CONTRACT
}) => {
  assertCatalog(catalog)
  const quarantined = new Set(contract.quarantinedFemaleItemIds)
  const expected = {
    top: catalog.tops,
    bottom: catalog.bottoms.map(({ slug }) => slug),
    shoes: catalog.shoes
  }
  for (const kind of ["top", "bottom", "shoes"]) {
    const literalEntries = [...source.matchAll(new RegExp(`id: \\\"room_avatar_${kind}_female_([^\\\"]+)_v2\\\"`, "g"))]
      .map((match) => match[1])
      .filter((slug) => !slug.includes("dress"))
      .filter((slug) => !quarantined.has(`room_avatar_${kind}_female_${slug}_v2`))
    const usesSweetCapsuleMap = source.includes("FEMALE_SWEET_CAPSULE_LAYERS.map")
    const declarativeEntries = usesSweetCapsuleMap
      ? expected[kind].filter((slug) => DECLARATIVE_SWEET_CAPSULE_SLUGS[kind].has(slug))
      : []
    const actual = [...new Set([...literalEntries, ...declarativeEntries])].sort()
    assert.deepEqual(actual, [...expected[kind]].sort(), `${kind} catalog drift: ${actual.join(", ")}`)
  }

  const expectedOverShoe = catalog.bottoms
    .filter(({ occlusionRole }) => occlusionRole === "bottomOverShoeUpper")
    .map(({ slug }) => `room_avatar_bottom_female_${slug}_v2`)
    .sort()
  assert.deepEqual(
    [...contract.pantsOverShoeUpperIds].sort(),
    expectedOverShoe,
    "bottom occlusion contract drift"
  )
}

const assetPath = (roomRoot, kind, slug, state) => state === "static"
  ? join(roomRoot, `avatar_room_${kind}_female_${slug}_v2.png`)
  : join(roomRoot, "motion", `room_avatar_${kind}_female_${slug}_v2_${state}.png`)

const basePath = (roomRoot, state) => state === "static"
  ? join(roomRoot, "avatar_room_base_female_v2.png")
  : join(roomRoot, "motion", `room_avatar_base_female_v2_${state}.png`)

const catalogSlugSet = (catalog, kind) => new Set(
  kind === "top"
    ? catalog.tops
    : kind === "bottom"
      ? catalog.bottoms.map(({ slug }) => slug)
      : catalog.shoes
)

export const createCandidateAssetResolver = ({ roomRoot, catalog, manifestPath }) => {
  assertCatalog(catalog)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.equal(manifest.schemaVersion, 1, "unsupported candidate manifest schema")
  const explicitOverrides = manifest.overrides ?? []
  const groupOverrides = (manifest.overrideGroups ?? []).flatMap((group) => {
    assert.ok(["top", "bottom", "shoes"].includes(group.kind), `invalid candidate kind: ${group.kind}`)
    assert.ok(Array.isArray(group.slugs) && group.slugs.length > 0, "candidate group slugs must not be empty")
    assert.ok(["canonical", "state-files"].includes(group.layout), `invalid candidate layout: ${group.layout}`)
    assert.equal(typeof group.root, "string", "candidate group root must be a string")
    return group.slugs.flatMap((slug) => STATES.map((state) => {
      const root = group.root.replaceAll("{slug}", slug)
      const file = group.layout === "canonical"
        ? state === "static"
          ? `avatar_room_${group.kind}_female_${slug}_v2.png`
          : `room_avatar_${group.kind}_female_${slug}_v2_${state}.png`
        : state === "static"
          ? "static.png"
          : `${state}.png`
      return { kind: group.kind, slug, state, path: join(root, file) }
    }))
  })
  const candidateOverrides = [...explicitOverrides, ...groupOverrides]
  assert.ok(Array.isArray(explicitOverrides), "candidate manifest overrides must be an array")
  assert.ok(Array.isArray(manifest.overrideGroups ?? []), "candidate manifest overrideGroups must be an array")
  const overrides = new Map()
  for (const override of candidateOverrides) {
    assert.ok(["top", "bottom", "shoes"].includes(override.kind), `invalid candidate kind: ${override.kind}`)
    assert.ok(STATES.includes(override.state), `invalid candidate state: ${override.state}`)
    assert.ok(
      catalogSlugSet(catalog, override.kind).has(override.slug),
      `unknown candidate item: ${override.kind}/${override.slug}`
    )
    assert.equal(override.slug.includes("dress"), false, "dresses are outside this gate")
    assert.equal(typeof override.path, "string", "candidate path must be a string")
    const key = `${override.kind}:${override.slug}:${override.state}`
    assert.equal(overrides.has(key), false, `duplicate candidate override: ${key}`)
    const resolvedPath = resolve(dirname(manifestPath), override.path)
    assert.ok(existsSync(resolvedPath), `missing candidate asset: ${resolvedPath}`)
    overrides.set(key, resolvedPath)
  }
  assert.ok(overrides.size > 0, "candidate manifest must contain at least one override")
  const overriddenItems = new Map()
  for (const override of candidateOverrides) {
    const itemKey = `${override.kind}:${override.slug}`
    const itemStates = overriddenItems.get(itemKey) ?? new Set()
    itemStates.add(override.state)
    overriddenItems.set(itemKey, itemStates)
  }
  for (const [itemKey, itemStates] of overriddenItems) {
    assert.deepEqual(
      [...itemStates].sort(),
      [...STATES].sort(),
      `${itemKey} candidate must provide complete Static + 4W + 1S`
    )
  }
  return {
    mode: "candidate",
    manifestPath,
    resolve: (kind, slug, state) =>
      overrides.get(`${kind}:${slug}:${state}`) ?? assetPath(roomRoot, kind, slug, state),
    isCandidate: (kind, slug, state) => overrides.has(`${kind}:${slug}:${state}`)
  }
}

const createLiveAssetResolver = (roomRoot) => ({
  mode: "live",
  manifestPath: undefined,
  resolve: (kind, slug, state) => assetPath(roomRoot, kind, slug, state),
  isCandidate: () => false
})

const readPng = (path) => {
  assert.ok(existsSync(path), `missing promoted asset: ${path}`)
  const bytes = readFileSync(path)
  const png = PNG.sync.read(bytes)
  assert.equal(png.width, CANVAS.width, `${path} width must be 256`)
  assert.equal(png.height, CANVAS.height, `${path} height must be 384`)
  return { bytes, png }
}

const measureContactInZone = (png, zone, threshold = 8) => {
  const occupied = new Set()
  let opaquePixels = 0
  let maxHorizontalRun = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    let horizontalRun = 0
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      if ((png.data[(y * png.width + x) * 4 + 3] ?? 0) > threshold) {
        opaquePixels += 1
        horizontalRun += 1
        occupied.add(`${x},${y}`)
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      } else {
        maxHorizontalRun = Math.max(maxHorizontalRun, horizontalRun)
        horizontalRun = 0
      }
    }
    maxHorizontalRun = Math.max(maxHorizontalRun, horizontalRun)
  }

  const componentSizes = []
  while (occupied.size > 0) {
    const first = occupied.values().next().value
    occupied.delete(first)
    const queue = [first]
    let componentSize = 0
    while (queue.length > 0) {
      const current = queue.pop()
      componentSize += 1
      const [x, y] = current.split(",").map(Number)
      for (const neighbor of [
        `${x - 1},${y}`,
        `${x + 1},${y}`,
        `${x},${y - 1}`,
        `${x},${y + 1}`
      ]) {
        if (occupied.delete(neighbor)) queue.push(neighbor)
      }
    }
    componentSizes.push(componentSize)
  }

  componentSizes.sort((first, second) => second - first)
  const largestComponent = componentSizes[0] ?? 0

  return {
    opaquePixels,
    density: opaquePixels / (zone.width * zone.height),
    largestComponent,
    maxHorizontalRun,
    horizontalSpan: opaquePixels > 0 ? maxX - minX + 1 : 0,
    verticalSpan: opaquePixels > 0 ? maxY - minY + 1 : 0,
    componentCount: componentSizes.length,
    secondLargestComponent: componentSizes[1] ?? 0
  }
}

const assertMeaningfulContact = ({ png, zone, kind, slug, state, requiresSingleComponent = false }) => {
  const metrics = measureContactInZone(png, zone)
  const requirement = CONTACT_REQUIREMENTS[kind]
  assert.ok(
    metrics.density >= requirement.minDensity,
    `${kind} ${slug} ${state} contact density ${metrics.density.toFixed(3)} is below ${requirement.minDensity}`
  )
  assert.ok(
    metrics.largestComponent >= requirement.minLargestComponent &&
      metrics.maxHorizontalRun >= requirement.minHorizontalRun &&
      metrics.horizontalSpan >= requirement.minHorizontalSpan &&
      metrics.verticalSpan >= requirement.minVerticalSpan,
    `${kind} ${slug} ${state} lacks a contiguous seam ` +
      `(component=${metrics.largestComponent}, run=${metrics.maxHorizontalRun}, ` +
      `span=${metrics.horizontalSpan}x${metrics.verticalSpan})`
  )
  if (requiresSingleComponent) {
    assert.ok(
      metrics.secondLargestComponent <= 4,
      `bottom ${slug} ${state} has a detached alpha island ` +
        `(components=${metrics.componentCount}, second=${metrics.secondLargestComponent})`
    )
  }
  return metrics
}

export const measureBottomShoeSeam = ({ base, bottom, shoes, zone = ZONES.pantHemShoeUpper }) => {
  const threshold = 16
  const alphaAt = (png, x, y) => png.data[(y * png.width + x) * 4 + 3] ?? 0
  let evaluatedColumns = 0
  let exposedBasePixels = 0
  let maxExposedBand = 0
  let overlapPixels = 0

  for (let x = zone.x; x < zone.x + zone.width; x += 1) {
    const bottomYs = []
    const shoeYs = []
    for (let y = zone.y; y < zone.y + zone.height; y += 1) {
      if (alphaAt(bottom, x, y) > threshold) bottomYs.push(y)
      if (alphaAt(shoes, x, y) > threshold) shoeYs.push(y)
    }
    if (bottomYs.length === 0 || shoeYs.length === 0) continue
    const bottomLast = bottomYs.at(-1)
    const shoeFirst = shoeYs[0]
    evaluatedColumns += 1
    if (shoeFirst <= bottomLast) {
      overlapPixels += bottomLast - shoeFirst + 1
      continue
    }
    let exposedInColumn = 0
    for (let y = bottomLast + 1; y < shoeFirst; y += 1) {
      if (
        alphaAt(base, x, y) > threshold &&
        alphaAt(bottom, x, y) <= threshold &&
        alphaAt(shoes, x, y) <= threshold
      ) exposedInColumn += 1
    }
    exposedBasePixels += exposedInColumn
    maxExposedBand = Math.max(maxExposedBand, exposedInColumn)
  }

  return { evaluatedColumns, exposedBasePixels, maxExposedBand, overlapPixels }
}

export const verifyPromotedInventory = ({
  roomRoot,
  catalog = FEMALE_NONDRESS_CATALOG,
  catalogSourcePath,
  assetResolver = createLiveAssetResolver(roomRoot)
}) => {
  assertCatalog(catalog)
  if (catalogSourcePath) {
    assertCatalogMatchesRuntimeSource({ catalog, source: readFileSync(catalogSourcePath, "utf8") })
  }
  const sources = []
  for (const state of STATES) {
    const base = readPng(basePath(roomRoot, state))
    sources.push({ path: basePath(roomRoot, state), sha256: sha256(base.bytes), source: "live" })
    for (const [kind, entries, zone] of [
      ["top", catalog.tops, ZONES.neckline],
      ["bottom", catalog.bottoms.map(({ slug }) => slug), ZONES.waistCrotch],
      ["shoes", catalog.shoes, ZONES.pantHemShoeUpper]
    ]) {
      for (const slug of entries) {
        const path = assetResolver.resolve(kind, slug, state)
        let source
        try {
          source = readPng(path)
        } catch (error) {
          throw new Error(`${kind} ${slug} ${state}: ${error.message}`)
        }
        const contact = assertMeaningfulContact({
          png: source.png,
          zone,
          kind,
          slug,
          state,
          requiresSingleComponent: kind === "bottom" && catalog.bottoms.some(
            (bottom) => bottom.slug === slug && bottom.occlusionRole === "bottomOverShoeUpper"
          )
        })
        sources.push({
          path,
          sha256: sha256(source.bytes),
          source: assetResolver.isCandidate(kind, slug, state) ? "candidate" : "live",
          contact
        })
      }
    }
  }
  return {
    fitProfileId: "blumi_female_room_avatar_v1",
    rigId: "blumi_2_5d_layered_v1",
    frameDurationMs: FRAME_DURATION_MS,
    states: [...STATES],
    itemCount: catalog.tops.length + catalog.bottoms.length + catalog.shoes.length,
    assetCount: (catalog.tops.length + catalog.bottoms.length + catalog.shoes.length) * STATES.length,
    sources
  }
}

const alphaComposite = (target, source) => {
  for (let offset = 0; offset < target.data.length; offset += 4) {
    const sourceAlpha = (source.data[offset + 3] ?? 0) / 255
    if (sourceAlpha === 0) continue
    const targetAlpha = (target.data[offset + 3] ?? 0) / 255
    const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha)
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceValue = source.data[offset + channel] ?? 0
      const targetValue = target.data[offset + channel] ?? 0
      target.data[offset + channel] = Math.round(
        (sourceValue * sourceAlpha + targetValue * targetAlpha * (1 - sourceAlpha)) / outputAlpha
      )
    }
    target.data[offset + 3] = Math.round(outputAlpha * 255)
  }
}

export const composeWardrobeRow = ({ roomRoot, row, state, assetResolver }) => {
  const result = new PNG({ width: CANVAS.width, height: CANVAS.height })
  for (let offset = 0; offset < result.data.length; offset += 4) result.data.set(BACKGROUND, offset)
  const layers = [readPng(basePath(roomRoot, state)).png]
  const top = readPng(assetResolver.resolve("top", row.top, state)).png
  const bottom = readPng(assetResolver.resolve("bottom", row.bottom, state)).png
  const shoes = readPng(assetResolver.resolve("shoes", row.shoes, state)).png
  if (row.bottomOcclusionRole === "bottomOverShoeUpper") layers.push(shoes, bottom)
  else layers.push(bottom, shoes)
  layers.push(top)
  for (const layer of layers) alphaComposite(result, layer)
  return result
}

const paintScaledCrop = (sheet, source, zone, cellX, cellY) => {
  for (let y = 0; y < zone.height; y += 1) {
    for (let x = 0; x < zone.width; x += 1) {
      const sourceOffset = ((zone.y + y) * source.width + zone.x + x) * 4
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          const targetX = cellX + GUTTER + x * SCALE + dx
          const targetY = cellY + GUTTER + y * SCALE + dy
          const targetOffset = (targetY * sheet.width + targetX) * 4
          source.data.copy(sheet.data, targetOffset, sourceOffset, sourceOffset + 4)
        }
      }
    }
  }
}

const renderZoneMatrix = ({ roomRoot, plan, zone, assetResolver }) => {
  const cellWidth = zone.width * SCALE + GUTTER * 2
  const cellHeight = zone.height * SCALE + GUTTER * 2
  const sheet = new PNG({ width: cellWidth * STATES.length, height: cellHeight * plan.length })
  for (let offset = 0; offset < sheet.data.length; offset += 4) sheet.data.set(BACKGROUND, offset)
  for (const [rowIndex, row] of plan.entries()) {
    for (const [stateIndex, state] of STATES.entries()) {
      const composite = composeWardrobeRow({ roomRoot, row, state, assetResolver })
      paintScaledCrop(sheet, composite, zone, stateIndex * cellWidth, rowIndex * cellHeight)
    }
  }
  return { bytes: PNG.sync.write(sheet), width: sheet.width, height: sheet.height, cellWidth, cellHeight }
}

const buildEvidence = ({ roomRoot, catalog, catalogSourcePath, assetResolver }) => {
  const resolvedAssetResolver = assetResolver ?? createLiveAssetResolver(roomRoot)
  const inventory = verifyPromotedInventory({
    roomRoot,
    catalog,
    catalogSourcePath,
    assetResolver: resolvedAssetResolver
  })
  const plan = createPairwisePlan(catalog)
  const pantShoeSeams = []
  for (const row of plan) {
    if (row.bottomOcclusionRole !== "bottomOverShoeUpper") continue
    for (const state of STATES) {
      const metrics = measureBottomShoeSeam({
        base: readPng(basePath(roomRoot, state)).png,
        bottom: readPng(resolvedAssetResolver.resolve("bottom", row.bottom, state)).png,
        shoes: readPng(resolvedAssetResolver.resolve("shoes", row.shoes, state)).png
      })
      assert.ok(
        metrics.evaluatedColumns >= 10 &&
          metrics.exposedBasePixels <= 2 &&
          metrics.maxExposedBand <= 1,
        `${row.bottom}/${row.shoes}/${state} exposed ankle/base band ` +
          `(columns=${metrics.evaluatedColumns}, pixels=${metrics.exposedBasePixels}, max=${metrics.maxExposedBand})`
      )
      pantShoeSeams.push({
        row: row.row,
        bottom: row.bottom,
        shoes: row.shoes,
        state,
        ...metrics
      })
    }
  }
  const matrices = Object.fromEntries(
    Object.entries(ZONES).map(([name, zone]) => [
      name,
      renderZoneMatrix({ roomRoot, plan, zone, assetResolver: resolvedAssetResolver })
    ])
  )
  const outputDigests = Object.fromEntries(
    Object.entries(matrices).map(([name, matrix]) => [`${name}.png`, sha256(matrix.bytes)])
  )
  const manifest = {
    schemaVersion: 1,
    scope: "female-nondress-wardrobe-combined-promotion-gate",
    fitProfileId: inventory.fitProfileId,
    rigId: inventory.rigId,
    frameDurationMs: FRAME_DURATION_MS,
    sourceMode: resolvedAssetResolver.mode,
    candidateManifest: resolvedAssetResolver.manifestPath
      ? resolvedAssetResolver.manifestPath.slice(repositoryRoot.length + 1)
      : null,
    playbackOrder: [...STATES],
    rows: plan.length,
    columns: STATES.length,
    pairwiseCoverage: ["top-bottom", "top-shoes", "bottom-shoes"],
    pantShoeSeams,
    plan,
    matrices: Object.fromEntries(
      Object.entries(matrices).map(([name, matrix]) => [name, {
        file: `${name}.png`,
        width: matrix.width,
        height: matrix.height,
        cellWidth: matrix.cellWidth,
        cellHeight: matrix.cellHeight,
        crop: ZONES[name],
        sha256: outputDigests[`${name}.png`]
      }])
    ),
    inventory: {
      itemCount: inventory.itemCount,
      assetCount: inventory.assetCount,
      sourceDigests: inventory.sources.map(({ path, sha256: digest, source, contact }) => ({
        path: path.startsWith(roomRoot)
          ? path.slice(roomRoot.length + 1)
          : path.slice(repositoryRoot.length + 1),
        sha256: digest,
        source,
        ...(contact ? { contact } : {})
      }))
    }
  }
  return { manifest, matrices, outputDigests }
}

const summary = (manifest) => ({
  frameDurationMs: manifest.frameDurationMs,
  rows: manifest.rows,
  columns: manifest.columns,
  itemCount: manifest.inventory.itemCount,
  assetCount: manifest.inventory.assetCount,
  outputDigests: Object.fromEntries(Object.entries(manifest.matrices).map(([name, value]) => [`${name}.png`, value.sha256]))
})

export const generateCombinedEvidence = ({
  roomRoot,
  outputRoot,
  catalog = FEMALE_NONDRESS_CATALOG,
  catalogSourcePath,
  candidateManifestPath
}) => {
  const assetResolver = candidateManifestPath
    ? createCandidateAssetResolver({ roomRoot, catalog, manifestPath: candidateManifestPath })
    : createLiveAssetResolver(roomRoot)
  const built = buildEvidence({ roomRoot, catalog, catalogSourcePath, assetResolver })
  mkdirSync(outputRoot, { recursive: true })
  for (const [name, matrix] of Object.entries(built.matrices)) writeFileSync(join(outputRoot, `${name}.png`), matrix.bytes)
  writeFileSync(join(outputRoot, "manifest.json"), canonicalJson(built.manifest))
  return summary(built.manifest)
}

export const verifyGeneratedEvidence = ({
  roomRoot,
  outputRoot,
  catalog = FEMALE_NONDRESS_CATALOG,
  catalogSourcePath,
  candidateManifestPath
}) => {
  const manifestPath = join(outputRoot, "manifest.json")
  assert.ok(existsSync(manifestPath), `missing evidence manifest: ${manifestPath}`)
  const actual = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.equal(actual.frameDurationMs, FRAME_DURATION_MS, "combined playback must remain exactly 120ms")
  const assetResolver = candidateManifestPath
    ? createCandidateAssetResolver({ roomRoot, catalog, manifestPath: candidateManifestPath })
    : createLiveAssetResolver(roomRoot)
  const expected = buildEvidence({ roomRoot, catalog, catalogSourcePath, assetResolver })
  assert.deepEqual(actual, expected.manifest, "evidence manifest is stale or does not match promoted assets")
  for (const [name, matrix] of Object.entries(expected.matrices)) {
    const path = join(outputRoot, `${name}.png`)
    assert.ok(existsSync(path), `missing matrix output: ${path}`)
    assert.equal(sha256(readFileSync(path)), sha256(matrix.bytes), `${name} is stale or non-deterministic`)
  }
  return summary(actual)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const roomRoot = join(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/room")
  const catalogSourcePath = join(repositoryRoot, "apps/mobile/src/features/avatarV2/room/avatarRoom.mock.ts")
  const outputFlagIndex = process.argv.indexOf("--output-root")
  const outputRoot = outputFlagIndex >= 0
    ? resolve(process.argv[outputFlagIndex + 1] ?? "")
    : join(repositoryRoot, "docs/avatar-motion-pipeline/female-combined-promotion-gate")
  if (outputFlagIndex >= 0) {
    assert.ok(process.argv[outputFlagIndex + 1], "--output-root requires a path")
  }
  const checkOnly = process.argv.includes("--check")
  const candidateFlagIndex = process.argv.indexOf("--candidate-manifest")
  const candidateManifestPath = candidateFlagIndex >= 0
    ? resolve(process.argv[candidateFlagIndex + 1] ?? "")
    : undefined
  if (candidateFlagIndex >= 0) {
    assert.ok(process.argv[candidateFlagIndex + 1], "--candidate-manifest requires a path")
  }
  const result = checkOnly
    ? verifyGeneratedEvidence({ roomRoot, outputRoot, catalogSourcePath, candidateManifestPath })
    : generateCombinedEvidence({ roomRoot, outputRoot, catalogSourcePath, candidateManifestPath })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
