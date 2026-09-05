import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const evidencePath = path.join(
  repoRoot,
  "docs/room-v3-qa/2026-07-20-cocoa-pilot-wave/simulator_evidence.json"
)

function readPngSize(filePath) {
  const bytes = fs.readFileSync(filePath)
  assert.deepEqual([...bytes.subarray(0, 8)], [
    137, 80, 78, 71, 13, 10, 26, 10
  ])
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR")
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  }
}

test("live Simulator evidence is bounded to portrait QA captures and explicit limitations", () => {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"))

  assert.equal(evidence.schemaVersion, "room-v3-universal-core-live-simulator-evidence-v1")
  assert.equal(evidence.status, "evidence_only")
  assert.equal(evidence.promotionEligible, false)
  assert.deepEqual(evidence.viewport, {
    logicalWidth: 390,
    logicalHeight: 844,
    orientation: "portrait",
    captureCanvas: "448x955"
  })
  assert.equal(evidence.runtime.providerNamespace, ":qa")
  assert.equal(evidence.runtime.productionOwnership, "not_touched")
  assert.equal(evidence.scenarios.length, 9)

  for (const scenario of evidence.scenarios) {
    const screenshotPath = path.join(repoRoot, scenario.screenshot)
    assert.equal(fs.existsSync(screenshotPath), true, scenario.id)
    assert.deepEqual(readPngSize(screenshotPath), { width: 448, height: 955 })
  }

  const wallClock = evidence.scenarios.find((scenario) => scenario.id === "wall_clock_surface")
  assert.deepEqual(wallClock && {
    candidateId: wallClock.candidateId,
    surface: wallClock.surface,
    placement: wallClock.placement
  }, {
    candidateId: "universal_wall_clock_a",
    surface: "wall",
    placement: "valid"
  })

  const tabletopLamp = evidence.scenarios.find((scenario) => scenario.id === "tabletop_lamp_surface")
  assert.deepEqual(tabletopLamp && {
    candidateId: tabletopLamp.candidateId,
    surface: tabletopLamp.surface,
    placement: tabletopLamp.placement
  }, {
    candidateId: "universal_table_lamp_a",
    surface: "tabletop",
    placement: "valid"
  })

  const loveseat = evidence.scenarios.find((scenario) =>
    scenario.id === "universal_cloud_loveseat_seating_after_fix"
  )
  assert.deepEqual(loveseat && {
    candidateId: loveseat.candidateId,
    surface: loveseat.surface,
    interaction: loveseat.interaction,
    result: loveseat.result
  }, {
    candidateId: "universal_cloud_loveseat_a",
    surface: "floor",
    interaction: "seat",
    result: "avatar_arrived_on_front_cushion_with_front_cushion_occlusion_seated_render_depth_and_reduced_scale"
  })

  assert.ok(evidence.limitations.some((limitation) => limitation.includes("cold relaunch")))
  assert.ok(evidence.limitations.some((limitation) => limitation.includes("45 SKUs")))
})
