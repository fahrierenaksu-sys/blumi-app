import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = (module, filename) => {
  module.exports = filename
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && /\.(png|webp)$/.test(request)) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS,
  createRoomVNextFullWaveCuteCandidateCatalog,
  createRoomVNextFullWaveCandidateCatalog,
  resolveRoomVNextFullWaveCandidateCatalog,
  resolveRoomVNextFullWaveCuteCandidateCatalog,
  resolveRoomV2FurnitureCatalogForVNextFullWaveRuntime
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextFullWaveCatalog") as typeof import("./roomVNextFullWaveCatalog")
const {
  ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextFullWaveRuntimeAssets") as typeof import("./roomVNextFullWaveRuntimeAssets")
const {
  ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextFullWavePolishRuntimeAssets") as typeof import("./roomVNextFullWavePolishRuntimeAssets")
const {
  ROOM_VNEXT_FULL_WAVE_POLISH_FULL45_RUNTIME_ASSETS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextFullWavePolishFull45RuntimeAssets") as typeof import("./roomVNextFullWavePolishFull45RuntimeAssets")
const {
  ROOM_V2_FURNITURE_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2.mock") as typeof import("./roomV2.mock")
const fullWaveSpec = require("../../../../../scripts/room-vnext-pilot/full-wave-catalog-spec.json") as {
  assets: {
    skuId: string
    physicalSizeCm: { width: number; depth: number; height: number }
    renderClass: "upright" | "floor_plane"
  }[]
}
const fullWaveManifest = require("../../../../../art/room-vnext/full-wave-v1/materialized-candidate-manifest.json") as {
  assets: {
    skuId: string
    directions: Record<string, { layers: { body: { canvas: { width: number; height: number }; alphaBounds: { width: number; height: number } } } }>
  }[]
}
const fullWavePolishManifest = require("../../../../../art/room-vnext/full-wave-v2-polish-final3/materialized-candidate-manifest.json") as {
  assets: {
    skuId: string
    directions: Record<string, { layers: { body: { sha256?: string }; contactShadow?: { sha256?: string }; thumbnail?: { sha256?: string } } }>
  }[]
}
const fullWavePolishFull45Manifest = require("../../../../../art/room-vnext/full-wave-v2-polish-full45-v2/materialized-candidate-manifest.json") as {
  assets: {
    skuId: string
    directions: Record<string, { layers: { body: { sha256?: string }; contactShadow?: { sha256?: string }; thumbnail?: { sha256?: string } } }>
  }[]
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { getRoomVNextCalibratedRenderSize } = require("./roomVNextScale") as typeof import("./roomVNextScale")

type Direction = "front" | "right" | "back" | "left"

type RuntimeAssetRegistry = Record<string, {
  body: Record<Direction, { integritySha256?: string }>
  shadow: Record<Direction, { integritySha256?: string }>
  thumbnail: { integritySha256?: string }
}>

type DigestManifest = {
  assets: {
    skuId: string
    directions: Record<Direction, {
      layers: {
        body: { sha256?: string }
        contactShadow?: { sha256?: string }
        thumbnail?: { sha256?: string }
      }
    }>
  }[]
}

function hydrateRegistryDigests(runtimeAssets: RuntimeAssetRegistry, manifest: DigestManifest) {
  for (const asset of manifest.assets) {
    const bundledAssets = runtimeAssets[asset.skuId]
    if (!bundledAssets) continue
    bundledAssets.thumbnail.integritySha256 = asset.directions.front.layers.thumbnail?.sha256
    for (const direction of ["front", "right", "back", "left"] as const) {
      bundledAssets.body[direction].integritySha256 = asset.directions[direction].layers.body.sha256
      bundledAssets.shadow[direction].integritySha256 =
        asset.directions[direction].layers.contactShadow?.sha256
    }
  }
}

function assertDigestMismatchFailsClosed(params: {
  candidateId: string
  runtimeAssets: RuntimeAssetRegistry
  manifest: DigestManifest
  resolverInput: Parameters<typeof resolveRoomVNextFullWaveCandidateCatalog>[0]
}) {
  const { candidateId, runtimeAssets, manifest, resolverInput } = params
  const bundledAssets = runtimeAssets[candidateId]
  const manifestAsset = manifest.assets.find((asset) => asset.skuId === candidateId)
  assert.ok(bundledAssets, `${candidateId} must exist in the runtime registry`)
  assert.ok(manifestAsset, `${candidateId} must exist in the manifest`)

  const originalBody = bundledAssets.body.front.integritySha256
  const originalShadow = bundledAssets.shadow.front.integritySha256
  const originalThumbnail = bundledAssets.thumbnail.integritySha256

  try {
    bundledAssets.body.front.integritySha256 = `${manifestAsset!.directions.front.layers.body.sha256}-mismatch`
    assert.equal(resolveRoomVNextFullWaveCandidateCatalog(resolverInput).enabled, false)

    bundledAssets.body.front.integritySha256 = originalBody
    bundledAssets.shadow.front.integritySha256 =
      `${manifestAsset!.directions.front.layers.contactShadow?.sha256}-mismatch`
    assert.equal(resolveRoomVNextFullWaveCandidateCatalog(resolverInput).enabled, false)

    bundledAssets.shadow.front.integritySha256 = originalShadow
    bundledAssets.thumbnail.integritySha256 =
      `${manifestAsset!.directions.front.layers.thumbnail?.sha256}-mismatch`
    assert.equal(resolveRoomVNextFullWaveCandidateCatalog(resolverInput).enabled, false)
  } finally {
    bundledAssets.body.front.integritySha256 = originalBody
    bundledAssets.shadow.front.integritySha256 = originalShadow
    bundledAssets.thumbnail.integritySha256 = originalThumbnail
  }
}

hydrateRegistryDigests(ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS, fullWaveManifest as DigestManifest)
hydrateRegistryDigests(
  ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS,
  fullWavePolishManifest as DigestManifest
)
hydrateRegistryDigests(
  ROOM_VNEXT_FULL_WAVE_POLISH_FULL45_RUNTIME_ASSETS,
  fullWavePolishFull45Manifest as DigestManifest
)

test("full-wave candidate catalog resolves the canonical 45 SKUs with four authored directions", () => {
  const catalog = createRoomVNextFullWaveCandidateCatalog()

  assert.equal(catalog.length, 45)
  assert.deepEqual(catalog.map((item) => item.id), [...ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS])

  for (const item of catalog) {
    assert.equal(item.sourceStatus, "candidate")
    assert.equal(item.qaStatus, "blocked")
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.ok(item.visualContract, `${item.id} needs a visual contract`)
    assert.deepEqual(
      Object.keys(item.visualContract!.directions).sort(),
      ["back", "front", "left", "right"],
      `${item.id} needs four authored directions`
    )
    for (const direction of ["front", "right", "back", "left"] as const) {
      const visual: NonNullable<typeof item.visualContract>["directions"][typeof direction] =
        item.visualContract!.directions[direction]!
      assert.ok(visual.bodyAsset.key.startsWith("room_vnext_full_wave_"))
      assert.ok(visual.contactShadowAsset?.key.startsWith("room_vnext_full_wave_"))
      assert.ok(String(visual.bodyAsset.source).includes("/assets/runtime/room-vnext/full-wave-v1/"))
      assert.ok(String(visual.contactShadowAsset?.source).includes("/assets/runtime/room-vnext/full-wave-v1/"))
      assert.ok(visual.normalizedRenderSize.width > 0)
      assert.ok(visual.normalizedRenderSize.height > 0)
    }
  }
})

test("full-wave runtime catalog stays candidate-only behind an explicit QA gate", () => {
  const disabled = resolveRoomVNextFullWaveCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: undefined
  })
  assert.equal(disabled.enabled, false)
  assert.deepEqual(disabled.catalog, [])
  assert.deepEqual(disabled.ownedItemIds, [])

  const enabled = resolveRoomVNextFullWaveCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1"
  })
  assert.equal(enabled.enabled, true)
  assert.deepEqual(enabled.catalog.map((item) => item.id), [...ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS])
  assert.deepEqual(enabled.ownedItemIds, [...ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS])
  assert.ok(enabled.catalog.every((item) => item.ownedByDefault === true && item.locked === false))
  assert.ok(enabled.catalog.every((item) => item.qaStatus === "blocked"))
})

test("full-wave polish flag swaps only the bounded v2 families and keeps v1 fallback", () => {
  const resolution = resolveRoomVNextFullWaveCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1",
    rawFullWavePolishFlag: "1"
  })
  assert.equal(resolution.enabled, true)
  const polished = resolution.catalog.find((item) => item.id === "universal_open_bookshelf_a")!
  const fallback = resolution.catalog.find((item) => item.id === "universal_petal_side_table_a")!
  assert.equal(polished.visualContract?.assetVersion, 2)
  assert.ok(String(polished.visualContract?.directions.front.bodyAsset.source).includes("full-wave-v2-polish-final3"))
  assert.equal(fallback.visualContract?.assetVersion, 1)
  assert.ok(String(fallback.visualContract?.directions.front.bodyAsset.source).includes("full-wave-v1"))
})

test("full-wave polish flag routes the wall-art candidates to their v2 directional sources", () => {
  const resolution = resolveRoomVNextFullWaveCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1",
    rawFullWavePolishFlag: "1"
  })

  for (const id of [
    "universal_full_length_mirror_a",
    "universal_wall_artwork_a",
    "universal_curtain_set_a"
  ]) {
    const item = resolution.catalog.find((candidate) => candidate.id === id)
    assert.ok(item, `${id} must remain in the bounded full-wave catalog`)
    assert.equal(item.visualContract?.assetVersion, 2)
    assert.equal(item.rotationPolicy, "directional_assets_required")
    for (const direction of ["front", "right", "back", "left"] as const) {
      const visual: NonNullable<typeof item.visualContract>["directions"][typeof direction] =
        item.visualContract!.directions[direction]
      assert.ok(
        String(visual.bodyAsset.source).includes(`full-wave-v2-polish-final3/${id}/${direction}_body.png`),
        `${id}:${direction} must use the v2 body source`
      )
      assert.equal(
        visual.contactShadowAsset,
        undefined,
        `${id}:${direction} must not render a floor shadow while mounted to a wall`
      )
    }
  }
})

test("full-wave full polish flag routes all 45 candidates to the append-only v2 packet", () => {
  const resolution = resolveRoomVNextFullWaveCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1",
    rawFullWavePolishFullFlag: "1"
  })

  assert.equal(resolution.enabled, true)
  assert.equal(resolution.catalog.length, 45)
  assert.ok(
    resolution.catalog.every((item) =>
      item.visualContract?.assetVersion === 2 &&
      String(item.visualContract?.directions.front.bodyAsset.source).includes(
        "full-wave-v2-polish-full45-v2"
      )
    )
  )
  for (const id of [
    "universal_full_length_mirror_a",
    "universal_wall_artwork_a",
    "universal_curtain_set_a"
  ]) {
    const item = resolution.catalog.find((candidate) => candidate.id === id)
    assert.ok(item)
    assert.equal(item.visualContract?.directions.front.contactShadowAsset, undefined)
  }
})

test("full-wave base packet fails closed on body, shadow, and thumbnail SHA mismatch", () => {
  assertDigestMismatchFailsClosed({
    candidateId: "universal_petal_side_table_a",
    runtimeAssets: ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS,
    manifest: fullWaveManifest as DigestManifest,
    resolverInput: {
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawFullWaveFlag: "1"
    }
  })
})

test("full-wave polish packet fails closed on body, shadow, and thumbnail SHA mismatch", () => {
  assertDigestMismatchFailsClosed({
    candidateId: "universal_open_bookshelf_a",
    runtimeAssets: ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS,
    manifest: fullWavePolishManifest as DigestManifest,
    resolverInput: {
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawFullWaveFlag: "1",
      rawFullWavePolishFlag: "1"
    }
  })
})

test("full-wave full45 packet fails closed on body, shadow, and thumbnail SHA mismatch", () => {
  assertDigestMismatchFailsClosed({
    candidateId: "universal_petal_side_table_a",
    runtimeAssets: ROOM_VNEXT_FULL_WAVE_POLISH_FULL45_RUNTIME_ASSETS,
    manifest: fullWavePolishFull45Manifest as DigestManifest,
    resolverInput: {
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawFullWaveFlag: "1",
      rawFullWavePolishFullFlag: "1"
    }
  })
})

test("cute v3 candidate catalog uses the append-only cute art packet", () => {
  const catalog = createRoomVNextFullWaveCuteCandidateCatalog()
  assert.equal(catalog.length, 45)
  assert.ok(
    catalog.every((item) =>
      (item.visualContract?.assetVersion ?? 0) >= 19 &&
      String(item.visualContract?.directions.front.bodyAsset.source).includes(
        "full-wave-v3-cute45-v3"
      ) &&
      Boolean(item.visualContract?.directions.front.bodyAsset.integritySha256) &&
      (Boolean(item.visualContract?.directions.front.contactShadowAsset?.integritySha256) ||
        item.placementSurface === "wall" ||
        item.placementSurface === "ceiling")
    )
  )
  assert.ok(catalog.every((item) => item.sourceStatus === "candidate" && item.qaStatus === "blocked"))
})

test("cute v3 resolver is fail-closed and requires its dedicated QA flag", () => {
  const disabled = resolveRoomVNextFullWaveCuteCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1"
  })
  assert.equal(disabled.enabled, false)

  const enabled = resolveRoomVNextFullWaveCuteCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1",
    rawFullWaveCuteFlag: "1"
  })
  assert.equal(enabled.enabled, true)
  assert.deepEqual(enabled.ownedItemIds, [...ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS])
  assert.ok(enabled.catalog.every((item) => item.locked === false && item.ownedByDefault === true))
})

test("full-wave resolver never mutates the production Room V2 catalog", () => {
  assert.ok(
    ROOM_V2_FURNITURE_CATALOG.every((item) => !ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.includes(item.id as never))
  )

  const legacyCatalog = [{
    id: "room_v2_legacy_probe",
    name: "Legacy probe"
  }] as never[]

  const disabled = resolveRoomV2FurnitureCatalogForVNextFullWaveRuntime({
    legacyCatalog,
    isDevelopmentRuntime: false,
    buildProfile: "development",
    rawFullWaveFlag: "1"
  })
  assert.equal(disabled.enabled, false)
  assert.deepEqual(disabled.catalog.map((item) => item.id), ["room_v2_legacy_probe"])

  const enabled = resolveRoomV2FurnitureCatalogForVNextFullWaveRuntime({
    legacyCatalog,
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1"
  })
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.catalog.length, 45)
  assert.ok(enabled.catalog.every((item) => !item.id.startsWith("room_v2_")))
})

test("full-wave render size uses physical height or floor extent and body alpha, never shared-crop pixels", () => {
  const catalog = createRoomVNextFullWaveCandidateCatalog()
  const specById = new Map(fullWaveSpec.assets.map((asset) => [asset.skuId, asset]))
  const manifestById = new Map(fullWaveManifest.assets.map((asset) => [asset.skuId, asset]))

  for (const item of catalog) {
    const spec = specById.get(item.id)!
    const manifest = manifestById.get(item.id)!
    const body = manifest.directions.front.layers.body
    const expected = getRoomVNextCalibratedRenderSize({
      physicalWidthCm: spec.physicalSizeCm.width,
      physicalDepthCm: spec.physicalSizeCm.depth,
      physicalHeightCm: spec.physicalSizeCm.height,
      renderClass: spec.renderClass,
      bodyAlphaWidthRatio: body.alphaBounds.width / body.canvas.width,
      bodyAlphaHeightRatio: body.alphaBounds.height / body.canvas.height
    })
    assert.deepEqual(item.visualContract!.directions.front.normalizedRenderSize, expected)
  }
})

test("full-wave seating candidates carry authored approach, seat, and exit metadata", () => {
  const catalog = createRoomVNextFullWaveCandidateCatalog()
  const seating = catalog.filter((item) => item.visualContract?.supportsAvatarSeat)
  assert.ok(seating.length > 0)
  for (const item of seating) {
    assert.equal(item.interactionType, "seat")
    assert.ok(item.seatSpec)
    assert.equal(item.seatSpec!.capacity, item.seatSpec!.seatPoints.length)
    assert.ok(item.seatSpec!.seatPoints.every((seat) =>
      seat.localPositionCm && seat.approachPointCm && seat.exitPointCm &&
      Number.isFinite(seat.seatHeight)
    ))
  }
  assert.ok(
    catalog
      .filter((item) => item.id.includes("mirror"))
      .every((item) => item.category === "wallDecor")
  )
})

test("full-wave resolver fails closed when a directional alpha envelope is missing", () => {
  const firstAsset = fullWaveManifest.assets[0]
  const frontLayers = firstAsset.directions.front.layers
  const originalBody = frontLayers.body

  try {
    delete (frontLayers as { body?: typeof originalBody }).body
    assert.deepEqual(createRoomVNextFullWaveCandidateCatalog(), [])
  } finally {
    ;(frontLayers as { body: typeof originalBody }).body = originalBody
  }
})
