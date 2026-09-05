import assert from "node:assert/strict"
import test from "node:test"

import type { RoomShell } from "./roomV2.types"
import { resolveRoomV3QaShellCatalogRuntime } from "./roomV3QaShellCatalogRuntime"

const BASE_SHELL: RoomShell = {
  id: "room_v2_shell_blumi_world_v1",
  name: "Blumi Home",
  asset: { key: "base", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  sourceStatus: "approved",
  qaStatus: "pass",
  walkablePolygon: [{ x: 0.5, y: 0.5 }]
}

const CANDIDATES: RoomShell[] = [
  "apricot_sky_social_loft",
  "blush_petal_cottage",
  "cocoa_navy_modern_studio",
  "sage_cloud_scandinavian",
  "forest_terracotta_creative_loft",
  "lavender_moon_atelier"
].map((id, index) => ({
  ...BASE_SHELL,
  id: `room_v3_shell_${id}`,
  name: `Candidate ${index + 1}`,
  asset: { key: `candidate-${index + 1}`, source: index as never },
  sourceStatus: "candidate" as const,
  qaStatus: "pending" as const
}))

test("enables six source-locked shell candidates only in explicit development QA", () => {
  const result = resolveRoomV3QaShellCatalogRuntime({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    productionCatalog: [BASE_SHELL],
    candidateCatalog: CANDIDATES
  })

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.equal(result.catalog.length, 7)
  assert.deepEqual(result.catalog.slice(1).map((shell) => shell.id), CANDIDATES.map((shell) => shell.id))
  assert.notEqual(result.catalog[0], BASE_SHELL)
  assert.notEqual(result.catalog[1], CANDIDATES[0])
})

test("keeps production catalog isolated when the explicit QA gate is absent", () => {
  const result = resolveRoomV3QaShellCatalogRuntime({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: undefined,
    productionCatalog: [BASE_SHELL],
    candidateCatalog: CANDIDATES
  })

  assert.equal(result.enabled, false)
  assert.equal(result.reason, "disabled")
  assert.deepEqual(result.catalog.map((shell) => shell.id), [BASE_SHELL.id])
})

test("native UI test profile exposes six candidates only with its explicit preview flag", () => {
  const result = resolveRoomV3QaShellCatalogRuntime({
    isDevelopmentRuntime: false,
    buildProfile: "native-ui-test",
    rawPreviewFlag: "1",
    productionCatalog: [BASE_SHELL],
    candidateCatalog: CANDIDATES
  })

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.deepEqual(result.catalog.slice(1).map((shell) => shell.id), CANDIDATES.map((shell) => shell.id))
})

test("fails closed when candidate geometry or QA provenance drifts", () => {
  const invalidCandidate: RoomShell = {
    ...CANDIDATES[0],
    canvasSize: { width: 1200, height: 714 },
    qaStatus: "pass"
  }
  const result = resolveRoomV3QaShellCatalogRuntime({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    productionCatalog: [BASE_SHELL],
    candidateCatalog: [invalidCandidate, ...CANDIDATES.slice(1)]
  })

  assert.equal(result.enabled, false)
  assert.equal(result.reason, "invalid_candidate_catalog")
  assert.deepEqual(result.catalog.map((shell) => shell.id), [BASE_SHELL.id])
})
