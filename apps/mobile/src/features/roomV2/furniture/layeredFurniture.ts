import type {
  RoomFurnitureRotation,
  RoomPoint2D,
  RoomV2AssetRef,
  RoomV2FurnitureRenderItem,
  RoomV2LayeredSeatArt,
  RoomV2SeatWorldPoint
} from "../roomV2.types"
import { ROOM_WORLD_AVATAR_COLLISION_CLEARANCE } from "../../roomWorld/roomWorldRuntime"
import {
  fitFloorBoxToWalls,
  floorBoxCorners,
  floorToStageFraction,
  stageFractionToFloor,
  verticalPxPerUnit,
  worldToShell,
  type FloorBox,
  type FloorPoint,
  type RoomCalibration
} from "../calibration/roomCalibration"
import { getFloorBoxCellQuads } from "../calibration/roomCalibrationScene"
import { withCameraSideEdgeSeats, type LayeredItemCamera } from "./layeredEdgeSeats"
import { LAYERED_SEAT_TUNING, withTunedSeats } from "./layeredSeatTuning"
import rawBlushChair from "./room_v2_chair_blush/item.json"
import rawJaponArmchair from "./room_v3_armchair_japon_cream/item.json"
import rawJaponBed from "./room_v3_bed_japon_sakura/item.json"
import rawJaponBookshelf from "./room_v3_bookshelf_japon_rattan/item.json"
import rawJaponClothesRack from "./room_v3_clothesrack_japon_bamboo/item.json"
import rawJaponCoffeeTable from "./room_v3_coffeetable_japon_round/item.json"
import rawJaponNightstand from "./room_v3_nightstand_japon_cedar/item.json"
import rawJaponBotanicRug from "./room_v3_rug_japon_botanic/item.json"
import rawJaponTeaRug from "./room_v3_rug_japon_tea/item.json"
import rawJaponSofa from "./room_v3_sofa_japon_cream/item.json"
import rawTeasetJaponZaisu from "./room_v3_teaset_japon_zaisu/item.json"
import rawTvunitJaponRattan from "./room_v3_tvunit_japon_rattan/item.json"
import rawBedOyunGingham from "./room_v3_bed_oyun_gingham/item.json"
import rawBedBlumiStarter from "./room_v3_bed_blumi_starter/item.json"
import rawBookshelfOyunCream from "./room_v3_bookshelf_oyun_cream/item.json"
import rawDresserOyunHoney from "./room_v3_dresser_oyun_honey/item.json"
import rawNightstandOyunHoney from "./room_v3_nightstand_oyun_honey/item.json"
import rawSnacktableOyunRound from "./room_v3_snacktable_oyun_round/item.json"
import rawTeasetOyunFlower from "./room_v3_teaset_oyun_flower/item.json"
import rawTvunitOyunGame from "./room_v3_tvunit_oyun_game/item.json"
import rawPoufOyunBunnypink from "./room_v3_pouf_oyun_bunnypink/item.json"
import rawPoufOyunBearpurple from "./room_v3_pouf_oyun_bearpurple/item.json"
import rawPoufOyunBunnymint from "./room_v3_pouf_oyun_bunnymint/item.json"
import rawPoufOyunBunnyyellow from "./room_v3_pouf_oyun_bunnyyellow/item.json"
import rawRugOyunChecker from "./room_v3_rug_oyun_checker/item.json"
import rawRugOyunCloud from "./room_v3_rug_oyun_cloud/item.json"
import rawRugOyunTea from "./room_v3_rug_oyun_tea/item.json"

/**
 * Furniture drawn from layers rendered from the room's own camera (Workbench `avatar25-v2/furniture/out/<id>/`,
 * 2.5D experiment only). Each rotation has a back layer (the whole piece), a front layer (the parts
 * that cover a seated avatar) and a floor shadow, plus `item.json`: the sprite anchor, the footprint in floor
 * cells and the seats. The item id never changes; stored rooms are read as they are.
 */

export type LayeredRotationIndex = 0 | 1 | 2 | 3
export type LayeredAvatarView = "front" | "frontM" | "back" | "backM"

export interface LayeredFurnitureSeat {
  id: string
  /** Sprite px of the hip point (where the seated drawing's hip goes). */
  hipPx: [number, number]
  /** The hip point, world units, relative to the footprint centre on the floor. */
  hipWorld: [number, number, number]
  seatHeight: number
  /** The way she faces seated, lab convention: facing = (sin, cos) in (X, Z). */
  facingYawDeg: number
  avatarView: LayeredAvatarView
  /** Floor cells relative to the footprint's min-corner cell. */
  approachCell: [number, number]
  exitCell: [number, number]
  /** Sprite px of the cushion's front edge (front views). */
  frontEdgePx: [number, number]
  /** Front views: her shins and shoes draw above the front layer, below the front edge. */
  cardSplit: boolean
  /** Back views: nothing of her is drawn below this sprite row. */
  cardClipBelowPx?: number
}

export interface LayeredFurnitureRotation {
  size: [number, number]
  /** Sprite px where the footprint centre's floor point lands. */
  anchorPx: [number, number]
  /** [X cells, Z cells] at this rotation. */
  footprintCells: [number, number]
  seats: LayeredFurnitureSeat[]
}

export interface LayeredFurnitureSpec {
  id: string
  /** `item.json` `seat_access`: "any_side" for a seat reached from every side (a round pouf); else from its front only. */
  seatAccess?: "any_side"
  /** Sprite px per shell px (zoom 1), `item.json` `scale`: 1.03 for the D armchair, 2.0 for the D sofa. */
  scale: number
  cell: number
  rotations: Record<LayeredRotationIndex, LayeredFurnitureRotation>
}

export interface LayeredFurnitureArt {
  back: RoomV2AssetRef
  /** Only where a seated avatar is covered: a piece without seats, or an empty front layer, bundles none. */
  front?: RoomV2AssetRef
  /** A flat piece (rug) casts none. */
  shadow?: RoomV2AssetRef
}

/** Per item id: the four rotations' layers (bundled with the app). */
export type LayeredFurnitureAssets = Readonly<Record<string, Record<LayeredRotationIndex, LayeredFurnitureArt>>>

/**
 * The app's four rotations on the rendered ones. The camera looks along the floor diagonal, so every drawn
 * rotation faces a screen diagonal: r0 bottom-left, r1 bottom-right, r2 top-right, r3 top-left (lab yaw r × 90°).
 * "front" keeps the look the shop sells (r1, the app painting); each quarter turn of the editor goes one
 * diagonal on in the same turning sense (front → right → back → left).
 */
export const LAYERED_ROTATION_INDEX: Readonly<Record<RoomFurnitureRotation, LayeredRotationIndex>> = {
  front: 1,
  right: 0,
  back: 3,
  left: 2
}

/**
 * The seated poses the 2.5D girl has a drawing for. A seat in another pose (a bed's `lie`, a low cushion's
 * `sit_low`) is pose-pending: it is left out until its drawing exists, never shown with a wrong pose.
 */
export const LAYERED_DRAWN_SEAT_POSES: ReadonlySet<string> = new Set(["sit_chair"])

function isDrawnSeatPose(raw: unknown): boolean {
  const pose = typeof raw === "object" && raw !== null ? (raw as { pose?: unknown }).pose : undefined
  return pose === undefined || (typeof pose === "string" && LAYERED_DRAWN_SEAT_POSES.has(pose))
}

/** The collision footprint is this much (world units) inside its cells: pieces on neighbouring cells may touch. */
const FOOTPRINT_COLLISION_INSET = 0.01

export const LAYERED_FURNITURE_SPECS: Readonly<Record<string, LayeredFurnitureSpec>> = {
  room_v2_chair_blush: parseLayeredFurnitureSpec(rawBlushChair),
  // pilot two-seater (Workbench avatar25-v2/furniture/pilot_sofa)
  room_v3_sofa_japon_cream: parseLayeredFurnitureSpec(rawJaponSofa),
  // the Japon Sadeliği collection's floor pieces (Workbench avatar25-v2/furniture/batch_japon), not
  // owner-approved; the bed's lying poses are pending, so only its two edge seats exist
  room_v3_armchair_japon_cream: parseLayeredFurnitureSpec(rawJaponArmchair),
  room_v3_bed_japon_sakura: parseLayeredFurnitureSpec(rawJaponBed),
  room_v3_bookshelf_japon_rattan: parseLayeredFurnitureSpec(rawJaponBookshelf),
  room_v3_clothesrack_japon_bamboo: parseLayeredFurnitureSpec(rawJaponClothesRack),
  room_v3_coffeetable_japon_round: parseLayeredFurnitureSpec(rawJaponCoffeeTable),
  room_v3_nightstand_japon_cedar: parseLayeredFurnitureSpec(rawJaponNightstand),
  room_v3_rug_japon_botanic: parseLayeredFurnitureSpec(rawJaponBotanicRug),
  room_v3_rug_japon_tea: parseLayeredFurnitureSpec(rawJaponTeaRug),
  // the Japon tea set and TV unit, and the Oyun Odası collection (batch_oyun);
  // seats in a pose without a drawing (the zaisu's and the bunny pouf's `sit_low`) are dropped by the parser
  room_v3_teaset_japon_zaisu: parseLayeredFurnitureSpec(rawTeasetJaponZaisu),
  room_v3_tvunit_japon_rattan: parseLayeredFurnitureSpec(rawTvunitJaponRattan),
  room_v3_bed_oyun_gingham: parseLayeredFurnitureSpec(rawBedOyunGingham),
  // the free starter bed (plan F9), Workbench furniture/work/bed_starter_a; its lying poses are pending like the others
  room_v3_bed_blumi_starter: parseLayeredFurnitureSpec(rawBedBlumiStarter),
  room_v3_bookshelf_oyun_cream: parseLayeredFurnitureSpec(rawBookshelfOyunCream),
  room_v3_dresser_oyun_honey: parseLayeredFurnitureSpec(rawDresserOyunHoney),
  room_v3_nightstand_oyun_honey: parseLayeredFurnitureSpec(rawNightstandOyunHoney),
  room_v3_snacktable_oyun_round: parseLayeredFurnitureSpec(rawSnacktableOyunRound),
  room_v3_teaset_oyun_flower: parseLayeredFurnitureSpec(rawTeasetOyunFlower),
  room_v3_tvunit_oyun_game: parseLayeredFurnitureSpec(rawTvunitOyunGame),
  room_v3_pouf_oyun_bunnypink: parseLayeredFurnitureSpec(rawPoufOyunBunnypink),
  room_v3_pouf_oyun_bearpurple: parseLayeredFurnitureSpec(rawPoufOyunBearpurple),
  // the bunny pouf's colourways (owner, 2026-10-17)
  room_v3_pouf_oyun_bunnymint: parseLayeredFurnitureSpec(rawPoufOyunBunnymint),
  room_v3_pouf_oyun_bunnyyellow: parseLayeredFurnitureSpec(rawPoufOyunBunnyyellow),
  room_v3_rug_oyun_checker: parseLayeredFurnitureSpec(rawRugOyunChecker),
  room_v3_rug_oyun_cloud: parseLayeredFurnitureSpec(rawRugOyunCloud),
  room_v3_rug_oyun_tea: parseLayeredFurnitureSpec(rawRugOyunTea)
}

/** Reads and checks a Workbench `item.json`; throws on anything missing or not finite. */
export function parseLayeredFurnitureSpec(raw: unknown): LayeredFurnitureSpec {
  const root = record(raw, "item")
  const footprint = record(root.footprint, "footprint")
  const rotationsRaw = record(root.rotations, "rotations")
  const rotations = {} as Record<LayeredRotationIndex, LayeredFurnitureRotation>
  for (const r of [0, 1, 2, 3] as const) {
    const rot = record(rotationsRaw[String(r)], `rotations.${r}`)
    rotations[r] = {
      size: pair(rot.size, "size"),
      anchorPx: pair(rot.anchor_px, "anchor_px"),
      footprintCells: pair(rot.footprint_cells, "footprint_cells"),
      seats: list(rot.seats, "seats")
        .map((rawSeat, index) => ({ rawSeat, index }))
        .filter(({ rawSeat }) => isDrawnSeatPose(rawSeat))
        .map(({ rawSeat, index }) => parseSeat(rawSeat, `rotations.${r}.seats.${index}`))
    }
  }
  const id = root.id
  if (typeof id !== "string" || !id) throw new Error("item.id must be a string")
  const scale = finite(root.scale, "scale")
  if (scale <= 0) throw new Error("scale must be positive")
  for (const r of [0, 1, 2, 3] as const) {
    const ids = rotations[r].seats.map((seat) => seat.id)
    if (new Set(ids).size !== ids.length) throw new Error(`rotations.${r}.seats ids must be unique`)
  }
  if (root.seat_access !== undefined && root.seat_access !== "any_side") throw new Error("seat_access must be any_side")
  const cell = finite(footprint.cell, "footprint.cell")
  const tuning = LAYERED_SEAT_TUNING[id]
  return {
    id,
    scale,
    cell,
    rotations: cameraSideEdgeSeats(root, tuning ? withTunedSeats(rotations, tuning, itemCamera(root), cell) : rotations),
    ...(root.seat_access === "any_side" ? { seatAccess: "any_side" as const } : {})
  }
}

/** A bed (`sit_edge`) is sat on from whichever long edge faces the camera (layeredEdgeSeats), its tuned seats too. */
function cameraSideEdgeSeats(
  root: Record<string, unknown>,
  rotations: Record<LayeredRotationIndex, LayeredFurnitureRotation>
): Record<LayeredRotationIndex, LayeredFurnitureRotation> {
  const interactions = Array.isArray(root.interactions) ? root.interactions : []
  if (!interactions.includes("sit_edge")) return rotations
  return withCameraSideEdgeSeats(rotations, itemCamera(root))
}

function itemCamera(root: Record<string, unknown>): LayeredItemCamera {
  const camera = record(root.camera, "camera")
  return {
    yawDeg: finite(camera.yaw_deg, "camera.yaw_deg"),
    pitchDeg: finite(camera.pitch_deg, "camera.pitch_deg"),
    pxPerWorldUnit: finite(root.px_per_world_unit, "px_per_world_unit")
  }
}

function parseSeat(raw: unknown, path: string): LayeredFurnitureSeat {
  const seat = record(raw, path)
  const view = seat.avatar_view
  if (view !== "front" && view !== "frontM" && view !== "back" && view !== "backM") {
    throw new Error(`${path}.avatar_view must be front | frontM | back | backM`)
  }
  const hipWorld = list(seat.hip_world, `${path}.hip_world`).map((value) => finite(value, `${path}.hip_world`))
  if (hipWorld.length !== 3) throw new Error(`${path}.hip_world must have 3 numbers`)
  return {
    id: typeof seat.id === "string" ? seat.id : "s0",
    hipPx: pair(seat.hip_px, `${path}.hip_px`),
    hipWorld: [hipWorld[0]!, hipWorld[1]!, hipWorld[2]!],
    seatHeight: finite(seat.seat_height, `${path}.seat_height`),
    facingYawDeg: finite(seat.facing_yaw_deg, `${path}.facing_yaw_deg`),
    avatarView: view,
    approachCell: pair(seat.approach_cell, `${path}.approach_cell`),
    exitCell: pair(seat.exit_cell, `${path}.exit_cell`),
    frontEdgePx: pair(seat.front_edge_px, `${path}.front_edge_px`),
    cardSplit: seat.card_split === true,
    ...(seat.card_clip_below_px !== undefined
      ? { cardClipBelowPx: finite(seat.card_clip_below_px, `${path}.card_clip_below_px`) }
      : {})
  }
}

// ---- the seated draw order ----

export type SeatedLayer = "shadow" | "back" | "avatar" | "front"

export interface SeatedLayerPlan {
  /** Painter's order, first drawn first. */
  order: SeatedLayer[]
  /** The front layer draws only above this sprite row (front views). */
  frontVisibleBelowRow?: number
  /** Nothing of her draws below this sprite row (back views). */
  avatarClipBelowRow?: number
}

/**
 * How a seated avatar and the piece's layers stack: shadow, back, her, front. In a front view (`card_split`)
 * her shins and shoes hang in front of the piece: below the cushion's front edge she draws above the front
 * layer. The front layer's pixels are the back layer's own, so drawing the front layer only above that edge is
 * the same picture as splitting her drawing there. In a back view her soles are under the seat, so she is cut
 * below `card_clip_below_px` and nothing of her shows under the piece.
 */
export function getSeatedLayerPlan(seat: LayeredFurnitureSeat): SeatedLayerPlan {
  return {
    order: ["shadow", "back", "avatar", "front"],
    ...(seat.cardSplit ? { frontVisibleBelowRow: seat.frontEdgePx[1] } : {}),
    ...(!seat.cardSplit && seat.cardClipBelowPx !== undefined ? { avatarClipBelowRow: seat.cardClipBelowPx } : {})
  }
}

/**
 * Several sitters on one piece draw far to near (`item.json` `runtime_rules.multiple_sitters`): by the hip's
 * X + Z ascending, both of which grow toward the camera. The seats' indices, first drawn first.
 */
export function getLayeredSeatDrawOrder(seats: readonly LayeredFurnitureSeat[]): number[] {
  return seats
    .map((seat, index) => ({ index, nearness: seat.hipWorld[0] + seat.hipWorld[2] }))
    .sort((a, b) => a.nearness - b.nearness || a.index - b.index)
    .map((entry) => entry.index)
}

// ---- placing it in the room ----

/**
 * The piece's floor cells. Like every calibrated floor piece, its front corner is the cell corner just behind
 * the saved anchor (the editor snaps that anchor to a cell centre); its size is `item.json`'s cells for the
 * rotation; in the last row before a back wall it goes flush with the wall.
 */
export function getLayeredFurnitureFloorBox(
  spec: LayeredFurnitureSpec,
  item: Pick<RoomV2FurnitureRenderItem, "x" | "y" | "rotation">,
  c: RoomCalibration
): { cells: FloorBox; placed: FloorBox; rotation: LayeredFurnitureRotation } {
  const rotation = spec.rotations[LAYERED_ROTATION_INDEX[item.rotation]]
  const anchor = stageFractionToFloor(c, item)
  const maxX = Math.floor(anchor.x / c.cell + 1e-6) * c.cell
  const maxZ = Math.floor(anchor.z / c.cell + 1e-6) * c.cell
  const cells = {
    minX: maxX - rotation.footprintCells[0] * spec.cell,
    maxX,
    minZ: maxZ - rotation.footprintCells[1] * spec.cell,
    maxZ
  }
  return { cells, placed: fitFloorBoxToWalls(c, cells), rotation }
}

/**
 * A layered piece in the room (stage fractions): the back layer is its sprite, its anchor is the footprint
 * centre (drawn at `renderOffset` from the saved spot, which never changes), its collision and placement shape
 * are its floor cells, and its seats come from `item.json` in world units: the floor point under the hip point
 * with the hip's height, then the approach and exit cells. Idempotent: everything is derived from the saved `x`/`y` and rotation.
 */
export function calibrateLayeredFurnitureRenderItem(
  item: RoomV2FurnitureRenderItem,
  spec: LayeredFurnitureSpec,
  art: Record<LayeredRotationIndex, LayeredFurnitureArt>,
  c: RoomCalibration
): RoomV2FurnitureRenderItem {
  const r = LAYERED_ROTATION_INDEX[item.rotation]
  const { cells, placed, rotation } = getLayeredFurnitureFloorBox(spec, item, c)
  const layers = art[r]
  const centre: FloorPoint = { x: (placed.minX + placed.maxX) / 2, z: (placed.minZ + placed.maxZ) / 2 }
  const drawPoint = floorToStageFraction(c, centre)
  const wallShift = floorToStageFraction(c, { x: placed.minX, z: placed.minZ })
  const cellCorner = floorToStageFraction(c, { x: cells.minX, z: cells.minZ })
  const diamond = floorBoxCorners(insetBox(placed, FOOTPRINT_COLLISION_INSET))
    .map((corner) => roundStage(floorToStageFraction(c, corner)))
  const drawOrder = getLayeredSeatDrawOrder(rotation.seats)
  const { renderOffset: _previous, frontOcclusion: _occlusion, foregroundOcclusionAsset: _foreground, ...base } = item
  void _previous
  void _occlusion
  void _foreground
  return {
    ...base,
    asset: layers.back,
    usesMirroredRotation: false,
    width: rotation.size[0] / spec.scale / c.canvas.width,
    height: rotation.size[1] / spec.scale / c.canvas.height,
    anchor: { x: rotation.anchorPx[0] / rotation.size[0], y: rotation.anchorPx[1] / rotation.size[1] },
    depth: item.y + (wallShift.y - cellCorner.y),
    collisionPolygon: diamond,
    placementPolygon: diamond.map((point) => ({ ...point })),
    footprintCells: getFloorBoxCellQuads(placed, c),
    floorBox: placed,
    renderOffset: { x: drawPoint.x - item.x, y: drawPoint.y - item.y },
    seatWorldPoints: rotation.seats.map((s, index) => ({
      ...layeredSeatWorldPoint(s, placed, centre, diamond, c, spec.scale, spec.seatAccess === "any_side"),
      drawRank: drawOrder.indexOf(index)
    })),
    layered25d: {
      ...(layers.front ? { frontAsset: layers.front } : {}),
      ...(layers.shadow ? { shadowAsset: layers.shadow } : {}),
      seats: rotation.seats.map((s) => layeredSeatArt(s, rotation, spec, c))
    }
  }
}

function layeredSeatWorldPoint(
  seat: LayeredFurnitureSeat,
  placed: FloorBox,
  centre: FloorPoint,
  footprint: RoomPoint2D[],
  c: RoomCalibration,
  spriteScale: number,
  anySide: boolean
): RoomV2SeatWorldPoint {
  // the seat point is the floor point under the hip (walking and the seat hotspot live on the floor); the hip is
  // `seatHeight` (a stage share) straight above it on screen
  const underHip = floorToStageFraction(c, { x: centre.x + seat.hipWorld[0], z: centre.z + seat.hipWorld[2] })
  const yaw = (seat.facingYawDeg * Math.PI) / 180
  const facing = { x: Math.sin(yaw), z: Math.cos(yaw) }
  const seatHeight = (seat.hipWorld[1] * verticalPxPerUnit(c)) / c.canvas.height
  const cellCentre = (cell: [number, number]) => roundStage(floorToStageFraction(c, clearOfFootprint({
    x: placed.minX + (cell[0] + 0.5) * c.cell,
    z: placed.minZ + (cell[1] + 0.5) * c.cell
  }, facing, footprint, c, placed)))
  return {
    id: seat.id,
    facing: seat.avatarView === "frontM" ? "right" : seat.avatarView.startsWith("back") ? "back" : "front",
    // the hip's height above the floor as a stage share (the shared sitting offset; the 2.5D body lifts her hip
    // exactly this far above the seat point)
    seatHeight,
    seat: roundStage(underHip),
    // midway from the hip point to the cushion's front edge, both on the cushion top (sprite px -> stage share)
    cushion: roundStage({
      x: underHip.x + (seat.frontEdgePx[0] - seat.hipPx[0]) / 2 / spriteScale / c.canvas.width,
      y: underHip.y - seatHeight + (seat.frontEdgePx[1] - seat.hipPx[1]) / 2 / spriteScale / c.canvas.height
    }),
    approach: cellCentre(seat.approachCell),
    exit: cellCentre(seat.exitCell),
    ...(anySide ? { alternativeApproaches: sideApproaches(facing, placed, footprint, c) } : {})
  }
}

/**
 * Spots beside a seat reached from every side: left, right, then behind her facing, each just off the piece's
 * footprint and stepped out along that side until she may stand there.
 */
function sideApproaches(facing: FloorPoint, placed: FloorBox, footprint: RoomPoint2D[], c: RoomCalibration): RoomPoint2D[] {
  const centre: FloorPoint = { x: (placed.minX + placed.maxX) / 2, z: (placed.minZ + placed.maxZ) / 2 }
  const half = { x: (placed.maxX - placed.minX) / 2, z: (placed.maxZ - placed.minZ) / 2 }
  const sides: FloorPoint[] = [{ x: -facing.z, z: facing.x }, { x: facing.z, z: -facing.x }, { x: -facing.x, z: -facing.z }]
  return sides.map((side) => {
    const reach = Math.abs(side.x) * half.x + Math.abs(side.z) * half.z + c.cell / 2
    const start = { x: centre.x + side.x * reach, z: centre.z + side.z * reach }
    return roundStage(floorToStageFraction(c, clearOfFootprint(start, side, footprint, c, placed)))
  })
}

function layeredSeatArt(
  seat: LayeredFurnitureSeat,
  rotation: LayeredFurnitureRotation,
  spec: LayeredFurnitureSpec,
  c: RoomCalibration
): RoomV2LayeredSeatArt {
  const plan = getSeatedLayerPlan(seat)
  return {
    id: seat.id,
    view: seat.avatarView.startsWith("back") ? "back" : "front",
    mirror: seat.avatarView.endsWith("M"),
    soleDropBelowHip: getSeatedSoleDropPx(seat, c) / c.canvas.height,
    ...(plan.frontVisibleBelowRow !== undefined ? { frontVisibleHeight: plan.frontVisibleBelowRow / rotation.size[1] } : {}),
    ...(plan.avatarClipBelowRow !== undefined
      ? { avatarClipBelowHip: (plan.avatarClipBelowRow - seat.hipPx[1]) / spec.scale / c.canvas.height }
      : {})
  }
}

/**
 * World units in front of the hip where her seated soles stand: just past the cushion's front edge. It is the
 * furniture standard the seats were built to (Workbench ergonomics.json `feet_forward_of_hip` 0.1744 × N 2.105), so
 * it belongs to the furniture, not to her height: a shorter body still puts its feet there.
 */
export const SEATED_SOLES_FORWARD_OF_HIP = 0.367

/**
 * Shell px from the seat's hip point down to the floor where her soles stand facing the camera (the seat's own
 * facing in a front view; in a back view her feet are hidden under the seat, and she keeps the legs the same seat
 * gives her facing the camera, so the point toward the camera is taken either way).
 */
export function getSeatedSoleDropPx(seat: Pick<LayeredFurnitureSeat, "hipWorld" | "facingYawDeg">, c: RoomCalibration): number {
  const yaw = (seat.facingYawDeg * Math.PI) / 180
  const ahead = (sign: number) => worldToShell(c, {
    x: sign * Math.sin(yaw) * SEATED_SOLES_FORWARD_OF_HIP,
    y: 0,
    z: sign * Math.cos(yaw) * SEATED_SOLES_FORWARD_OF_HIP
  }).y
  const hip = worldToShell(c, { x: 0, y: seat.hipWorld[1], z: 0 }).y
  return Math.max(ahead(1), ahead(-1)) - hip
}

/** How far the approach spot may move out along her facing to clear the piece (world units, per step / at most). */
const APPROACH_STEP = 0.05
const APPROACH_MAX_STEPS = 12

/**
 * The approach and exit cells sit right beside the piece (0.25 units off its face), but the room's walk keeps
 * her `ROOM_WORLD_AVATAR_COLLISION_CLEARANCE` (stage metric) from every footprint, a little more than that on
 * some faces. The spot then moves straight out along her facing until she may stand there, so she still walks
 * up to the seat head-on. A seat at the end of a long set entered from its side (the Oyun tea set's flower
 * chairs) faces along the face the spot is beside, so facing never clears it; the spot then steps straight off
 * that face instead.
 */
function clearOfFootprint(
  point: FloorPoint,
  facing: FloorPoint,
  footprint: RoomPoint2D[],
  c: RoomCalibration,
  placed: FloorBox
): FloorPoint {
  const metricY = c.canvas.height / c.canvas.width
  const needed = ROOM_WORLD_AVATAR_COLLISION_CLEARANCE * 1.05
  const firstClear = (direction: FloorPoint): FloorPoint | undefined => {
    for (let step = 0; step <= APPROACH_MAX_STEPS; step += 1) {
      const candidate = { x: point.x + direction.x * APPROACH_STEP * step, z: point.z + direction.z * APPROACH_STEP * step }
      const stage = floorToStageFraction(c, candidate)
      if (metricDistanceToPolygon(stage, footprint, metricY) >= needed) return candidate
    }
    return undefined
  }
  const ahead = firstClear(facing)
  if (ahead) return ahead
  const off = {
    x: point.x < placed.minX ? -1 : point.x > placed.maxX ? 1 : 0,
    z: point.z < placed.minZ ? -1 : point.z > placed.maxZ ? 1 : 0
  }
  const length = Math.hypot(off.x, off.z)
  return (length > 0 ? firstClear({ x: off.x / length, z: off.z / length }) : undefined) ?? point
}

function metricDistanceToPolygon(point: RoomPoint2D, polygon: RoomPoint2D[], metricY: number): number {
  let best = Infinity
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!
    const b = polygon[(index + 1) % polygon.length]!
    const ax = a.x
    const ay = a.y * metricY
    const dx = b.x - ax
    const dy = b.y * metricY - ay
    const px = point.x - ax
    const py = point.y * metricY - ay
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy))
  }
  return best
}

function insetBox(box: FloorBox, by: number): FloorBox {
  return { minX: box.minX + by, maxX: box.maxX - by, minZ: box.minZ + by, maxZ: box.maxZ - by }
}

/** Stage coordinates keep 6 decimals (sub-pixel on any canvas), as persisted points do. */
function roundStage(point: RoomPoint2D): RoomPoint2D {
  return { x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6 }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as Record<string, unknown>
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`)
  return value
}

function pair(value: unknown, path: string): [number, number] {
  const values = list(value, path)
  if (values.length !== 2) throw new Error(`${path} must have 2 numbers`)
  return [finite(values[0], path), finite(values[1], path)]
}
