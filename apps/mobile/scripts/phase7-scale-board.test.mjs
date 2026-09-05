import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const evidenceRoot = join(repositoryRoot, "docs/room-v3-qa/2026-07-18-phase7-scale")
const tablePath = join(evidenceRoot, "phase7_canonical_measurement_table.json")
const simulatorPlacementPath = join(evidenceRoot, "simulator_room_placement_evidence.json")

test("Phase 7 scale board contains four measured mobile subjects and remains fail-closed", () => {
  assert.ok(existsSync(tablePath))
  const table = JSON.parse(readFileSync(tablePath, "utf8"))
  assert.equal(table.status, "evidence_draft_pending_simulator_and_independent_review")
  assert.deepEqual(
    table.subjects.map((subject) => subject.id),
    ["female_standing", "female_sitting", "male_standing", "male_sitting"]
  )
  assert.equal(table.viewport.widthPx, 390)
  assert.equal(table.camera.rendererWidthPx, 741)
  assert.equal(table.camera.rendererHeightPx, 422)
  assert.equal(table.evidence.simulatorVisualReviewId, null)
  assert.equal(table.evidence.independentReviewId, null)
  assert.equal(table.evidence.simulatorShellSmokeEvidenceId, "simulator-my-room-vertical-2026-07-18")
  assert.ok(existsSync(join(repositoryRoot, table.evidence.simulatorShellSmokePath)))

  assert.ok(existsSync(simulatorPlacementPath))
  const simulatorPlacement = JSON.parse(readFileSync(simulatorPlacementPath, "utf8"))
  assert.equal(simulatorPlacement.status, "pass_evidence_only")
  assert.equal(simulatorPlacement.observed.savedItemCountAfterRelaunch, 2)
  assert.equal(simulatorPlacement.observed.keychainEntitlementErrorVisible, false)
  for (const screenshot of Object.values(simulatorPlacement.screenshots)) {
    assert.ok(existsSync(join(evidenceRoot, screenshot)))
  }

  for (const subject of table.subjects) {
    assert.ok(existsSync(join(repositoryRoot, subject.screenshotPath)))
    assert.ok(subject.measuredBodyBoundsPx.maxXExclusive > subject.measuredBodyBoundsPx.minX)
    assert.ok(subject.measuredBodyBoundsPx.maxYExclusive > subject.measuredBodyBoundsPx.minY)
    assert.ok(subject.visibleHeightPx > 0)
    assert.equal(subject.footFloorY, table.camera.floorY)
    if (subject.state === "sitting") assert.ok(subject.seatContactY)
    else assert.equal(subject.seatContactY, null)
  }
})
