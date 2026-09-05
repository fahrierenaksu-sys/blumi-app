import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import {
  createUniversalConsoleTableAPilot,
  createUniversalLargeStandingPlantAPilot,
  type UniversalCorePilotDirectionalAssets
} from "./roomV3UniversalCorePilotFurniture"
import { getRoomV3FootprintForRotation } from "./roomV3Contracts"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && request.endsWith(".png")) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  createRoomV3UniversalCoreRuntimeFurniture
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreRuntimeFurniture") as typeof import("./roomV3UniversalCoreRuntimeFurniture")
const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreArtifactRegistry") as typeof import("./roomV3UniversalCoreArtifactRegistry")

const assets: UniversalCorePilotDirectionalAssets = {
  front: { key: "console-front", source: 0 as never },
  back: { key: "console-back", source: 0 as never },
  left: { key: "console-left", source: 0 as never },
  right: { key: "console-right", source: 0 as never }
}

function createTrustedRegistry(): any {
  return {
    verifierId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    verifiedCandidateIds: [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS],
    verifiedAssetHashesByCandidateId: Object.fromEntries(
      ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((id) => [
        id,
        { ...ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[id] }
      ])
    )
  }
}

test("console table owns its tabletop and four-direction floor contract", () => {
  const consoleTable = createUniversalConsoleTableAPilot(assets)

  assert.equal(consoleTable.id, "universal_console_table_a")
  assert.equal(consoleTable.name, "Universal Console Table")
  assert.equal(consoleTable.category, "table")
  assert.equal(consoleTable.placementSurface, "floor")
  assert.equal(consoleTable.interactionType, "decor")
  assert.equal(consoleTable.blocksMovement, true)
  assert.deepEqual(
    { width: consoleTable.width, height: consoleTable.height },
    { width: 0.3, height: 0.26 }
  )
  assert.deepEqual(consoleTable.assetsByRotation, assets)
  assert.deepEqual(getRoomV3FootprintForRotation(consoleTable, "front"), {
    width: 0.22,
    height: 0.11
  })
  assert.deepEqual(getRoomV3FootprintForRotation(consoleTable, "back"), {
    width: 0.22,
    height: 0.11
  })
  assert.deepEqual(getRoomV3FootprintForRotation(consoleTable, "left"), {
    width: 0.11,
    height: 0.22
  })
  assert.deepEqual(getRoomV3FootprintForRotation(consoleTable, "right"), {
    width: 0.11,
    height: 0.22
  })
  assert.deepEqual(consoleTable.surfaceSupports?.[0], {
    surface: "tabletop",
    localBounds: { minX: 0.1, maxX: 0.9, minY: 0.14, maxY: 0.26 },
    localBoundsByRotation: {
      front: { minX: 0.1, maxX: 0.9, minY: 0.14, maxY: 0.26 },
      back: { minX: 0.1, maxX: 0.9, minY: 0.14, maxY: 0.26 },
      left: { minX: 0.16, maxX: 0.84, minY: 0.1, maxY: 0.3 },
      right: { minX: 0.16, maxX: 0.84, minY: 0.1, maxY: 0.3 }
    }
  })
})

test("large standing plant owns plant semantics and a four-direction floor footprint", () => {
  const plant = createUniversalLargeStandingPlantAPilot(assets)

  assert.equal(plant.id, "universal_large_standing_plant_a")
  assert.equal(plant.name, "Large Standing Plant")
  assert.equal(plant.category, "plant")
  assert.equal(plant.placementSurface, "floor")
  assert.equal(plant.interactionType, "decor")
  assert.equal(plant.blocksMovement, true)
  assert.deepEqual(
    { width: plant.width, height: plant.height },
    { width: 0.085, height: 0.32 }
  )
  assert.deepEqual(plant.assetsByRotation, assets)
  assert.deepEqual(getRoomV3FootprintForRotation(plant, "front"), {
    width: 0.055,
    height: 0.045
  })
  assert.deepEqual(getRoomV3FootprintForRotation(plant, "back"), {
    width: 0.055,
    height: 0.045
  })
  assert.deepEqual(getRoomV3FootprintForRotation(plant, "left"), {
    width: 0.045,
    height: 0.055
  })
  assert.deepEqual(getRoomV3FootprintForRotation(plant, "right"), {
    width: 0.045,
    height: 0.055
  })
  assert.equal(plant.surfaceSupports, undefined)
})

test("runtime uses the dedicated console and plant contracts without inherited metadata", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const consoleTable = furniture.find((item) => item.id === "universal_console_table_a")
  const plant = furniture.find((item) => item.id === "universal_large_standing_plant_a")

  assert.ok(consoleTable)
  assert.equal(consoleTable.category, "table")
  assert.equal(consoleTable.surfaceSupports?.[0]?.surface, "tabletop")
  assert.deepEqual(getRoomV3FootprintForRotation(consoleTable, "right"), {
    width: 0.11,
    height: 0.22
  })

  assert.ok(plant)
  assert.equal(plant.category, "plant")
  assert.equal(plant.surfaceSupports, undefined)
  assert.deepEqual(getRoomV3FootprintForRotation(plant, "left"), {
    width: 0.045,
    height: 0.055
  })
})
