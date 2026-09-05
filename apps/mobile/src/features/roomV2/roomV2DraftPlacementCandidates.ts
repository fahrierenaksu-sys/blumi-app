import type {
  FurnitureItem,
  ResolvedRoomV2Scene,
  RoomV2RenderItem
} from "./roomV2.types"
import { getRoomV2FurniturePlacementSurface } from "./roomV2PlacementSurface"

export function getRoomV2DraftPlacementCandidates(
  item: FurnitureItem,
  scene?: ResolvedRoomV2Scene
): { x: number; y: number }[] {
  const placementSurface = getRoomV2FurniturePlacementSurface(item)
  if (placementSurface === "wall" || placementSurface === "ceiling") {
    const fallbackRegion = placementSurface === "ceiling"
      ? { minX: 0.15, maxX: 0.85, minY: 0.04, maxY: 0.18 }
      : { minX: 0.2, maxX: 0.8, minY: 0.16, maxY: 0.5 }
    const region = scene?.shell?.surfacePlacementAreas?.[placementSurface] ??
      fallbackRegion
    const width = region.maxX - region.minX
    const height = region.maxY - region.minY
    const exclusions = scene?.shell?.surfacePlacementExclusions?.[placementSurface] ?? []
    if (placementSurface === "wall" && item.surfacePlacementPolicy === "opening" && exclusions.length > 0) {
      return exclusions.flatMap((exclusion) => [
        {
          x: roundPlacementCoordinate((exclusion.minX + exclusion.maxX) / 2),
          y: fitVerticalAnchorToRegion({
            preferred: (exclusion.minY + exclusion.maxY) / 2,
            region,
            item
          })
        }
      ])
    }
    const sidePadding = width * (placementSurface === "ceiling" ? 0.24 : 0.2)
    const surfaceY = fitVerticalAnchorToRegion({
      preferred: region.minY + height * 0.5,
      region,
      item
    })
    const firstOpening = exclusions[0]
    const safeOpeningCandidates = firstOpening
      ? getSafeOpeningCandidates({ region, exclusion: firstOpening, item })
      : []
    const sideCandidates = placementSurface === "ceiling"
      ? [
          { x: roundPlacementCoordinate(region.maxX - sidePadding), y: surfaceY },
          { x: roundPlacementCoordinate(region.minX + sidePadding), y: surfaceY }
        ]
      : [
          { x: roundPlacementCoordinate(region.minX + sidePadding), y: surfaceY },
          { x: roundPlacementCoordinate(region.maxX - sidePadding), y: surfaceY }
        ]
    return [
      ...safeOpeningCandidates.map((x) => ({ x, y: surfaceY })),
      ...sideCandidates,
      { x: roundPlacementCoordinate((region.minX + region.maxX) / 2), y: surfaceY },
      {
        x: roundPlacementCoordinate(region.minX + sidePadding * 0.5),
        y: roundPlacementCoordinate(region.minY + height * 0.65)
      },
      {
        x: roundPlacementCoordinate(region.maxX - sidePadding * 0.5),
        y: roundPlacementCoordinate(region.minY + height * 0.65)
      }
    ]
  }

  if (placementSurface === "tabletop") {
    const tabletopCandidates = (scene?.renderItems ?? [])
      .filter((renderItem): renderItem is Extract<RoomV2RenderItem, { kind: "furniture" }> =>
        renderItem.kind === "furniture" &&
        (renderItem.placementSurface ?? "floor") === "floor"
      )
      .flatMap((support) =>
        (support.surfaceSupports ?? [])
          .filter((surface) => surface.surface === "tabletop")
          .map((surface) => {
            const topLeftX = support.x - support.width * support.anchor.x
            const topLeftY = support.y - support.height * support.anchor.y
            const bounds =
              surface.localBoundsByRotation?.[support.rotation] ?? surface.localBounds
            return {
              x: topLeftX + ((bounds.minX + bounds.maxX) / 2) * support.width,
              // Surface props use a bottom anchor, so align their contact line
              // to the support's front edge instead of the surface midpoint.
              y: topLeftY + bounds.maxY * support.height
            }
          })
      )
    if (tabletopCandidates.length > 0) return tabletopCandidates
  }

  return [
    // Start with side bays so a large first item does not seal the avatar
    // spawn lane. The central anchors remain as fallbacks below.
    { x: 0.32, y: 0.56 },
    { x: 0.68, y: 0.56 },
    { x: 0.32, y: 0.66 },
    { x: 0.68, y: 0.66 },
    { x: 0.32, y: 0.76 },
    { x: 0.68, y: 0.76 },
    { x: 0.42, y: 0.56 },
    { x: 0.58, y: 0.56 },
    { x: 0.42, y: 0.76 },
    { x: 0.58, y: 0.76 },
    { x: 0.5, y: 0.72 },
    { x: 0.38, y: 0.72 },
    { x: 0.62, y: 0.72 },
    { x: 0.5, y: 0.82 },
    { x: 0.34, y: 0.82 },
    { x: 0.66, y: 0.82 },
    { x: 0.5, y: 0.6 },
    { x: 0.28, y: 0.64 },
    { x: 0.72, y: 0.64 },
    // Keep the canonical avatar spawn lane available when a caller needs a
    // multi-item layout rather than the default single-item preview.
    { x: 0.22, y: 0.7 },
    { x: 0.78, y: 0.7 },
    { x: 0.22, y: 0.82 },
    { x: 0.78, y: 0.82 }
  ]
}

function fitVerticalAnchorToRegion(input: {
  preferred: number
  region: { minY: number; maxY: number }
  item: Pick<FurnitureItem, "height" | "anchor">
}): number {
  const height = Math.max(input.item.height ?? 0, 0)
  const anchorY = input.item.anchor?.y ?? 0.5
  const margin = 0.005
  const minY = input.region.minY + height * anchorY + margin
  const maxY = input.region.maxY - height * (1 - anchorY) - margin
  const fitted = minY <= maxY
    ? Math.max(minY, Math.min(maxY, input.preferred))
    : (minY + maxY) / 2
  return roundPlacementCoordinate(fitted)
}

function getSafeOpeningCandidates(input: {
  region: { minX: number; maxX: number }
  exclusion: { minX: number; maxX: number }
  item: Pick<FurnitureItem, "width" | "anchor">
}): number[] {
  const width = Math.max(input.item.width ?? 0, 0)
  const anchorX = input.item.anchor?.x ?? 0.5
  const margin = 0.01
  const candidates = [
    input.exclusion.minX - margin - width * (1 - anchorX),
    input.exclusion.maxX + margin + width * anchorX
  ]
  return candidates
    .filter((x) => (
      x - width * anchorX >= input.region.minX &&
      x + width * (1 - anchorX) <= input.region.maxX
    ))
    .map(roundPlacementCoordinate)
}

function roundPlacementCoordinate(value: number): number {
  return Math.round(value * 100) / 100
}
