import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import {
  getMyRoomWalkActionTarget,
  getWideStageRendererTranslateY,
  MY_ROOM_AVATAR_SPAWN,
  MY_ROOM_MOVEMENT_NO_OP_DISTANCE,
  MY_ROOM_WALK_ACTION_TARGETS
} from "./myRoomInteractionModel"
import type { RoomWorldGeometry } from "./roomWorldGeometry"
import {
  createRoomWorldGeometryFromRoomV2Scene,
  createRoomWorldHotspotsFromRoomV2Scene
} from "./roomWorldRoomV2Projection"
import { resolveRoomV2Scene } from "../roomV2/roomV2Selectors"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]
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
const { ROOM_V2_FURNITURE_CATALOG, ROOM_V2_SHELL_CATALOG, MOCK_USER_ROOM_V2_DECOR } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../roomV2/roomV2.mock") as typeof import("../roomV2/roomV2.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { resolveRoomWorldSeatSelection } = require("./roomWorldRuntime") as typeof import("./roomWorldRuntime")

const openRoom: RoomWorldGeometry = {
  walkableAreas: [
    {
      id: "room",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]
    }
  ],
  blockers: []
}

test("my room walk action chooses a reachable non-no-op target", () => {
  const from = { x: 0.47, y: 0.84 }
  const target = getMyRoomWalkActionTarget({ geometry: openRoom, from })

  assert.ok(target)
  assert.ok(MY_ROOM_WALK_ACTION_TARGETS.some((candidate) =>
    candidate.x === target.x && candidate.y === target.y
  ))
  assert.ok(Math.hypot(target.x - from.x, target.y - from.y) > MY_ROOM_MOVEMENT_NO_OP_DISTANCE)
})

test("my room walk action skips targets blocked by authored room geometry", () => {
  const geometry: RoomWorldGeometry = {
    ...openRoom,
    blockers: [{ id: "block-right", x: 0.72, y: 0.86, width: 0.20, height: 0.18 }]
  }
  const target = getMyRoomWalkActionTarget({
    geometry,
    from: { x: 0.47, y: 0.84 }
  })

  assert.ok(target)
  assert.notDeepEqual(target, { x: 0.72, y: 0.86 })
})

test("wide stage camera keeps avatar feet inside the authored lower-third", () => {
  const translateY = getWideStageRendererTranslateY({
    stageWidth: 720,
    stageHeight: 420,
    shellCanvasWidth: 1024,
    shellCanvasHeight: 768,
    avatarWorldY: 0.84
  })

  assert.equal(translateY, -49)
})

test("default My Room chair exposes a reachable seat from the avatar spawn", () => {
  const scene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: MOCK_USER_ROOM_V2_DECOR,
    defaultRoomShellId: MOCK_USER_ROOM_V2_DECOR.roomShellId
  })
  const chair = scene.renderItems.find(
    (item) => item.kind === "furniture" && item.renderId === "room_v2_placed_chair_01"
  )
  assert.ok(chair)
  const selection = resolveRoomWorldSeatSelection({
    geometry: createRoomWorldGeometryFromRoomV2Scene(scene),
    from: MY_ROOM_AVATAR_SPAWN,
    hotspots: createRoomWorldHotspotsFromRoomV2Scene(scene),
    seatedFurnitureRenderId: chair.renderId,
    clearance: 0.012,
    timing: {
      minDurationMs: 240,
      maxDurationMs: 760,
      durationPerDistanceMs: 1_800
    }
  })

  assert.ok(selection, "the default chair must not be a dead seat affordance")
})
