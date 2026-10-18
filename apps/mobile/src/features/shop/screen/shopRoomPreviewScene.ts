import { getMyRoomEditorCopy } from "../../roomV2/myRoomCopy"
import { createValidDraftPlacement } from "../../roomV2/editor/roomEditorPlacementModel"
import type { resolveRoomV2Scene } from "../../roomV2/roomV2Selectors"
import { getRoomV2FurnitureMobileRenderScale, isRoomV2LayeredFloorPiece } from "../../roomV2/roomV2RenderSurface"
import type { FurnitureItem, RoomV2RenderItem, UserRoomDecor } from "../../roomV2/roomV2.types"
import { createRoomPreviewDecor, SHOP_PREVIEW_INSTANCE_ID } from "./shopScreenModel"

type ResolvedScene = ReturnType<typeof resolveRoomV2Scene>

export interface ShopRoomPreviewScene {
  scene: ResolvedScene
  /** Furniture drawn in front of the previewed piece and covering it; the preview fades them. */
  dimmedRenderIds: ReadonlySet<string>
}

/** Where a shopper's eye lands in the room: the open floor in front of the camera. */
const PREVIEW_FOCUS_POINT = { x: 0.5, y: 0.74 }
/** Share of the previewed piece's drawn box a piece in front must cover to be faded. */
const OCCLUSION_COVER_THRESHOLD = 0.12
const NO_DIMMED_IDS: ReadonlySet<string> = new Set()

/**
 * The Shop's room preview: the shopper's own room with the selected piece placed where it can be
 * seen. It takes the free spot nearest the front of the room (never inside other furniture), and
 * any piece still drawn over it is faded so the new piece is never hidden behind the room.
 */
export function resolveShopRoomPreviewScene(input: {
  item: FurnitureItem | undefined
  decor: UserRoomDecor
  furnitureCatalog: FurnitureItem[]
  roomShellCatalog: Parameters<typeof resolveRoomV2Scene>[0]["roomShellCatalog"]
  defaultRoomShellId: string
  /** The room's scene resolver (tests count its calls). */
  resolveScene: typeof resolveRoomV2Scene
}): ShopRoomPreviewScene {
  const baseDecor: UserRoomDecor = {
    roomShellId: input.decor.roomShellId || input.defaultRoomShellId,
    placedItems: input.decor.placedItems.filter((placed) => placed.instanceId !== SHOP_PREVIEW_INSTANCE_ID)
  }
  const resolve = (decor: UserRoomDecor) => input.resolveScene({
    roomShellCatalog: input.roomShellCatalog,
    furnitureCatalog: input.furnitureCatalog,
    decor,
    defaultRoomShellId: input.defaultRoomShellId
  })
  const baseScene = resolve(baseDecor)
  if (!input.item) return { scene: baseScene, dimmedRenderIds: NO_DIMMED_IDS }

  const freeSpot = createValidDraftPlacement({
    copy: getMyRoomEditorCopy("en"),
    item: input.item,
    itemId: input.item.id,
    scene: baseScene,
    orderCandidates: orderByPreviewVisibility
  })
  const previewDecor: UserRoomDecor = freeSpot
    ? { ...baseDecor, placedItems: [...baseDecor.placedItems, { ...freeSpot, instanceId: SHOP_PREVIEW_INSTANCE_ID }] }
    : createRoomPreviewDecor(input.item, baseDecor, input.defaultRoomShellId)
  const scene = resolve(previewDecor)
  return { scene, dimmedRenderIds: getShopPreviewOccluderIds(scene.renderItems, SHOP_PREVIEW_INSTANCE_ID) }
}

function orderByPreviewVisibility(candidates: { x: number; y: number }[]): { x: number; y: number }[] {
  const distance = (point: { x: number; y: number }) =>
    Math.hypot(point.x - PREVIEW_FOCUS_POINT.x, point.y - PREVIEW_FOCUS_POINT.y)
  return [...candidates].sort((left, right) => distance(left) - distance(right))
}

/** Upright pieces drawn after the preview piece whose drawing covers part of it. */
export function getShopPreviewOccluderIds(
  renderItems: readonly RoomV2RenderItem[],
  previewRenderId: string
): ReadonlySet<string> {
  const uprightItems = renderItems.filter((item) => !isRoomV2LayeredFloorPiece(item))
  const previewIndex = uprightItems.findIndex((item) => item.renderId === previewRenderId)
  if (previewIndex < 0) return NO_DIMMED_IDS
  const previewBox = getDrawnBox(uprightItems[previewIndex])
  const previewArea = getArea(previewBox)
  if (previewArea <= 0) return NO_DIMMED_IDS
  const occluderIds = uprightItems
    .slice(previewIndex + 1)
    .filter((item) => item.kind === "furniture" && item.sceneProjection !== "floor_plane")
    .filter((item) => getArea(intersect(previewBox, getDrawnBox(item))) / previewArea >= OCCLUSION_COVER_THRESHOLD)
    .map((item) => item.renderId)
  return occluderIds.length > 0 ? new Set(occluderIds) : NO_DIMMED_IDS
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** The item's drawn rectangle in stage fractions, as RoomRenderer2D places it. */
function getDrawnBox(item: RoomV2RenderItem): Box {
  const scale = getRoomV2FurnitureMobileRenderScale(item.kind === "furniture" ? "furniture" : "avatar")
  const offset = item.kind === "furniture" ? item.renderOffset : undefined
  const x = item.x + (offset?.x ?? 0)
  const y = item.y + (offset?.y ?? 0)
  const width = item.width * scale
  const height = item.height * scale
  const minX = x - width * item.anchor.x
  const minY = y - height * item.anchor.y
  return { minX, minY, maxX: minX + width, maxY: minY + height }
}

function intersect(a: Box, b: Box): Box {
  return {
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY)
  }
}

function getArea(box: Box): number {
  return Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY)
}
