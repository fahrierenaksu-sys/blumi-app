import type {
  RoomHotspot,
  RoomScene
} from "../miniRoom/scene/miniRoomSceneTypes"
import type {
  RoomWorldGeometry,
  RoomWorldHotspot
} from "./roomWorldGeometry"

export function createRoomWorldGeometryFromMiniRoomScene(
  scene: RoomScene
): RoomWorldGeometry {
  return {
    walkableAreas: scene.map.walkableAreas,
    blockers: scene.furniture
      .filter((item) => item.blocksMovement)
      .map((item) => ({
        id: item.id,
        x: item.x,
        y: item.depthY,
        width: item.width,
        height: item.height,
        blocksMovement: item.blocksMovement
      }))
  }
}

export function createRoomWorldHotspotsFromMiniRoomScene(
  scene: RoomScene
): RoomWorldHotspot[] {
  return scene.hotspots.map((hotspot) => ({
    id: hotspot.id,
    kind: toRoomWorldHotspotKind(hotspot),
    x: hotspot.approachPoint?.x ?? hotspot.x,
    y: hotspot.approachPoint?.y ?? hotspot.y,
    facing: hotspot.facingOnArrival,
    sourceRenderId: hotspot.id
  }))
}

function toRoomWorldHotspotKind(
  hotspot: RoomHotspot
): RoomWorldHotspot["kind"] {
  if (hotspot.kind === "seat") return "seat"
  if (hotspot.kind === "stand") return "stand"
  return "activity"
}
