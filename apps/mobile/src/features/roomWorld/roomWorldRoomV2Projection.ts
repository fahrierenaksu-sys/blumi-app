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
import {
  createRoomWorldFloorGeometry,
  ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON
} from "./roomWorldGeometry"
import { roomAvatar25d } from "../../features/avatar/roomAvatarSeam"
import { resolveSeatApproach } from "./seatApproach"

/** 2.5D room calibration; null in every other bundle (the walk floor stays as shipped). */
const roomCalibration = roomAvatar25d.roomCalibration

export function createRoomWorldGeometryFromRoomV2Scene(
  scene: ResolvedRoomV2Scene
): RoomWorldGeometry {
  // A shell with a measured floor walks the drawn floor itself (the outline,
  // its lattice and canvas proportions), the same floor the editor places on.
  const floor = scene.shell?.floorGrid
    ? createRoomWorldFloorGeometry(scene.shell.floorGrid, scene.shell.canvasSize)
    : undefined
  const geometry: RoomWorldGeometry = {
    ...(floor ?? {
      walkableAreas: scene.shell?.placeableArea
        ? [createWalkableAreaFromRoomShell(scene.shell)]
        : []
    }),
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
  return roomCalibration ? roomCalibration.calibrateWalkGeometry(geometry, scene.shell) : geometry
}

/** The depth step between the sitters of one piece (a small share of the seated epsilon, so all stay right in front of it). */
const SEATED_DRAW_RANK_DEPTH_STEP = ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON / 16

export function createRoomWorldHotspotsFromRoomV2Scene(
  scene: ResolvedRoomV2Scene
): RoomWorldHotspot[] {
  return scene.renderItems
    .filter(isSeatFurnitureRenderItem)
    .flatMap((item) => {
      if (item.seatSpec) {
        return (item.seatWorldPoints ?? []).map((seatPoint) => {
          const { approach, exit } = resolveSeatApproach(seatPoint, item.renderId, scene)
          return {
            id: `${item.renderId}:${seatPoint.id}`,
            seatId: seatPoint.id,
            kind: "seat" as const,
            x: seatPoint.seat.x,
            y: seatPoint.seat.y,
            facing: seatPoint.facing,
            seatHeight: seatPoint.seatHeight,
            // sitters on one piece draw far to near (layered pieces carry `drawRank`)
            renderDepth: item.depth + ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON +
              (seatPoint.drawRank ?? 0) * SEATED_DRAW_RANK_DEPTH_STEP,
            approachPoint: approach,
            exitPoint: exit,
            sourceRenderId: item.renderId
          }
        })
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
