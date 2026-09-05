import type {
  ResolvedRoomV2Scene,
  RoomBounds,
  RoomV2FurnitureRenderItem
} from "../roomV2/roomV2.types"
import type {
  RoomWorldGeometry,
  RoomWorldHotspot,
  RoomWorldPoint,
  RoomWorldWalkableArea
} from "./roomWorldGeometry"
import { ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON } from "./roomWorldGeometry"

export function createRoomWorldGeometryFromRoomV2Scene(
  scene: ResolvedRoomV2Scene
): RoomWorldGeometry {
  return {
    walkableAreas: scene.shell?.placeableArea
      ? [createWalkableAreaFromRoomShell(scene.shell)]
      : [],
    blockers: scene.renderItems
      .filter(isBlockingFurnitureRenderItem)
      .map((item) => {
        const footprint = item.footprint ?? {
          width: item.width,
          height: item.height
        }
        return {
          id: item.renderId,
          x: item.x,
          y: item.y,
          width: footprint.width,
          height: footprint.height,
          anchor: item.anchor,
          ...(item.collisionPolygon
            ? { polygon: item.collisionPolygon.map((point) => ({ ...point })) }
            : {}),
          blocksMovement: true
        }
      })
  }
}

export function createRoomWorldHotspotsFromRoomV2Scene(
  scene: ResolvedRoomV2Scene
): RoomWorldHotspot[] {
  return scene.renderItems
    .filter(isSeatFurnitureRenderItem)
    .flatMap((item) => {
      if (item.seatSpec) {
        return (item.seatWorldPoints ?? []).map((seatPoint) => ({
          id: `${item.renderId}:${seatPoint.id}`,
          seatId: seatPoint.id,
          kind: "seat" as const,
          x: seatPoint.seat.x,
          y: seatPoint.seat.y,
          facing: seatPoint.facing,
          seatHeight: seatPoint.seatHeight,
          renderDepth: item.depth + ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON,
          approachPoint: { ...seatPoint.approach },
          exitPoint: { ...seatPoint.exit },
          sourceRenderId: item.renderId
        }))
      }

      const seatPoints = item.seatPoints?.length
        ? item.seatPoints
        : [createDefaultSeatPoint(item)]

      return seatPoints.map((seatPoint) => ({
        id: `${item.renderId}:${seatPoint.id}`,
        seatId: seatPoint.id,
        kind: "seat" as const,
        x: item.x + seatPoint.x * item.width,
        y: item.y + seatPoint.y * item.height,
        facing: seatPoint.facing ?? item.rotation,
        renderDepth: item.depth + ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON,
        sourceRenderId: item.renderId
      }))
    })
}

export function createWalkableAreaFromRoomBounds(
  id: string,
  bounds: RoomBounds
): RoomWorldWalkableArea {
  return {
    id,
    points: [
      point(bounds.minX, bounds.minY),
      point(bounds.maxX, bounds.minY),
      point(bounds.maxX, bounds.maxY),
      point(bounds.minX, bounds.maxY)
    ]
  }
}

function createWalkableAreaFromRoomShell(
  shell: NonNullable<ResolvedRoomV2Scene["shell"]>
): RoomWorldWalkableArea {
  if (shell.walkablePolygon?.length) {
    return {
      id: "room_v2_walkable_floor_polygon",
      points: shell.walkablePolygon.map((point) => ({
        x: point.x,
        y: point.y
      }))
    }
  }

  if (!shell.placeableArea) {
    return {
      id: "room_v2_empty_walkable_area",
      points: []
    }
  }

  return createWalkableAreaFromRoomBounds(
    "room_v2_placeable_area",
    shell.placeableArea
  )
}

function isBlockingFurnitureRenderItem(
  item: ResolvedRoomV2Scene["renderItems"][number]
): item is RoomV2FurnitureRenderItem {
  return item.kind === "furniture" &&
    (item.placementSurface ?? "floor") === "floor" &&
    item.blocksMovement
}

function isSeatFurnitureRenderItem(
  item: ResolvedRoomV2Scene["renderItems"][number]
): item is RoomV2FurnitureRenderItem {
  return item.kind === "furniture" && item.interactionType === "seat"
}

function createDefaultSeatPoint(item: RoomV2FurnitureRenderItem): {
  id: string
  x: number
  y: number
  facing: RoomV2FurnitureRenderItem["rotation"]
} {
  return {
    id: "seat",
    x: 0,
    y: -0.35,
    facing: item.rotation
  }
}

function point(x: number, y: number): RoomWorldPoint {
  return { x, y }
}
