import type {
  FurnitureItem,
  RoomBounds,
  RoomPlacementSurface,
  RoomV2FurnitureRenderItem,
  ResolvedRoomV2Scene
} from "./roomV2.types"

export type RoomV2FurnitureSurfaceIssueId =
  | "invalid_placement_surface"
  | "missing_support_surface"

export interface RoomV2FurnitureSurfacePlacementResult {
  isValid: boolean
  issueIds: RoomV2FurnitureSurfaceIssueId[]
  supportingRenderIds: string[]
}

export function getRoomV2FurniturePlacementSurface(
  item: Pick<FurnitureItem, "placementSurface">
): RoomPlacementSurface {
  return item.placementSurface ?? "floor"
}

export function validateRoomV2FurnitureSurfacePlacement(input: {
  scene: ResolvedRoomV2Scene
  candidate: RoomV2FurnitureRenderItem
}): RoomV2FurnitureSurfacePlacementResult {
  const surface = input.candidate.placementSurface ?? "floor"
  if (surface === "floor") {
    return {
      isValid: true,
      issueIds: [],
      supportingRenderIds: []
    }
  }

  if (surface === "wall" || surface === "ceiling") {
    const region = input.scene.shell?.surfacePlacementAreas?.[surface]
    const exclusions = input.scene.shell?.surfacePlacementExclusions?.[surface] ?? []
    const surfaceBounds = getFurnitureSurfaceBounds(input.candidate)
    const overlapsOpening = exclusions.some((exclusion) =>
      doesFurnitureBoundsOverlapRegion(surfaceBounds, exclusion)
    )
    const openingPolicy = input.candidate.surfacePlacementPolicy === "opening"
    if (
      !region ||
      !isFurnitureBoundsInsideRegion(surfaceBounds, region) ||
      (openingPolicy
        ? !(exclusions.length > 0 && overlapsOpening)
        : overlapsOpening)
    ) {
      return {
        isValid: false,
        issueIds: ["invalid_placement_surface"],
        supportingRenderIds: []
      }
    }

    return {
      isValid: true,
      issueIds: [],
      supportingRenderIds: []
    }
  }

  const supportingRenderIds = input.scene.renderItems
    .filter((item): item is RoomV2FurnitureRenderItem =>
      item.kind === "furniture" &&
      item.renderId !== input.candidate.renderId &&
      (item.placementSurface ?? "floor") === "floor" &&
      item.surfaceSupports?.some((support) => support.surface === surface) === true
    )
    .filter((item) => {
      const supports = item.surfaceSupports ?? []
      return supports
        .filter((support) => support.surface === surface)
        .some((support) =>
          isFurnitureContactInsideRegion(
            input.candidate,
            item,
            support.localBoundsByRotation?.[item.rotation] ?? support.localBounds
          )
        )
    })
    .map((item) => item.renderId)

  return {
    isValid: supportingRenderIds.length > 0,
    issueIds: supportingRenderIds.length > 0 ? [] : ["missing_support_surface"],
    supportingRenderIds
  }
}

function isFurnitureBoundsInsideRegion(
  bounds: RoomBounds,
  region: RoomBounds
): boolean {
  return (
    bounds.minX >= region.minX &&
    bounds.maxX <= region.maxX &&
    bounds.minY >= region.minY &&
    bounds.maxY <= region.maxY
  )
}

function doesFurnitureBoundsOverlapRegion(
  bounds: RoomBounds,
  region: RoomBounds
): boolean {
  return (
    bounds.minX < region.maxX &&
    bounds.maxX > region.minX &&
    bounds.minY < region.maxY &&
    bounds.maxY > region.minY
  )
}

function getFurnitureSurfaceBounds(item: RoomV2FurnitureRenderItem): RoomBounds {
  // Ceiling sprites are upright square canvases whose transparent padding can
  // be taller than the actual fixture. Their authored physical polygon is the
  // placement source of truth; using the canvas would create a false invalid
  // state even when the visible object fits the ceiling band.
  if (item.placementSurface === "ceiling" && item.placementPolygon?.length) {
    const xs = item.placementPolygon.map((point) => point.x)
    const ys = item.placementPolygon.map((point) => point.y)
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    }
  }
  return getFurnitureImageBounds(item)
}

function isFurnitureContactInsideRegion(
  candidate: RoomV2FurnitureRenderItem,
  support: RoomV2FurnitureRenderItem,
  localBounds: RoomBounds
): boolean {
  const topLeft = getFurnitureImageTopLeft(support)
  const supportBounds = {
    minX: topLeft.x + localBounds.minX * support.width,
    maxX: topLeft.x + localBounds.maxX * support.width,
    minY: topLeft.y + localBounds.minY * support.height,
    maxY: topLeft.y + localBounds.maxY * support.height
  }
  const candidateFootprint = candidate.footprint ?? {
    width: candidate.width * 0.7,
    height: Math.max(candidate.height * 0.12, 0.004)
  }
  const contactBounds = {
    minX: candidate.x - candidateFootprint.width / 2,
    maxX: candidate.x + candidateFootprint.width / 2,
    minY: candidate.y - candidateFootprint.height,
    maxY: candidate.y
  }

  return (
    contactBounds.minX >= supportBounds.minX &&
    contactBounds.maxX <= supportBounds.maxX &&
    contactBounds.minY >= supportBounds.minY &&
    contactBounds.maxY <= supportBounds.maxY
  )
}

function getFurnitureImageBounds(item: RoomV2FurnitureRenderItem): RoomBounds {
  const topLeft = getFurnitureImageTopLeft(item)
  return {
    minX: topLeft.x,
    maxX: topLeft.x + item.width,
    minY: topLeft.y,
    maxY: topLeft.y + item.height
  }
}

function getFurnitureImageTopLeft(item: RoomV2FurnitureRenderItem): {
  x: number
  y: number
} {
  return {
    x: item.x - item.width * item.anchor.x,
    y: item.y - item.height * item.anchor.y
  }
}
