import type {
  FurnitureCategory,
  FurnitureItem,
  RoomLayer,
  RoomSeatPoint
} from "../roomV2.types"
import { ROOM_CALIBRATION } from "../calibration/roomCalibration"
import { LAYERED_FURNITURE_SPECS, LAYERED_ROTATION_INDEX, type LayeredFurnitureAssets } from "./layeredFurniture"
import { getLayeredWallPieceShape, LAYERED_WALL_SPECS, type LayeredWallAssets } from "./layeredWallFurniture"

/**
 * The layered 2.5D pieces of the room catalog. Each id is canonical (its `item.json` id) and never renamed or
 * reused. Who owns a piece, and whether it may be bought or placed at all, is the server's decision (the domain
 * economy catalog and the release holds); this list only says how a piece is drawn.
 *
 * The room calibration draws them from their layers (`layeredFurniture.ts`, `layeredWallFurniture.ts`) and gives
 * them their diamond footprints and `item.json` seats; the catalog size is the "front" rotation's layer (a wall
 * piece: its right-wall drawing).
 */
export const ROOM_AVATAR_25D_SOFA_ID = "room_v3_sofa_japon_cream"

interface LayeredCatalogEntry {
  id: string
  name: string
  category: FurnitureCategory
  /** A flat rug: on the floor layer, walkable, never blocks. */
  flat?: boolean
}

/** The floor pieces, in the order the inventory lists them. */
export const ROOM_AVATAR_25D_LAYERED_FLOOR_ENTRIES: readonly LayeredCatalogEntry[] = Object.freeze([
  { id: ROOM_AVATAR_25D_SOFA_ID, name: "Japon Cream Sofa", category: "seating" },
  { id: "room_v3_armchair_japon_cream", name: "Japon Cream Armchair", category: "seating" },
  { id: "room_v3_bed_japon_sakura", name: "Japon Sakura Bed", category: "seating" },
  { id: "room_v3_coffeetable_japon_round", name: "Japon Round Coffee Table", category: "table" },
  { id: "room_v3_nightstand_japon_cedar", name: "Japon Cedar Nightstand", category: "storage" },
  { id: "room_v3_bookshelf_japon_rattan", name: "Japon Rattan Bookshelf", category: "storage" },
  { id: "room_v3_clothesrack_japon_bamboo", name: "Japon Bamboo Clothes Rack", category: "storage" },
  { id: "room_v3_rug_japon_botanic", name: "Japon Botanic Rug", category: "rug", flat: true },
  { id: "room_v3_rug_japon_tea", name: "Japon Tea Rug", category: "rug", flat: true },
  // the zaisu's seats are `sit_low` (pose-pending): the piece has none yet and stands as a table
  { id: "room_v3_teaset_japon_zaisu", name: "Japon Zaisu Tea Set", category: "table" },
  { id: "room_v3_tvunit_japon_rattan", name: "Japon Rattan TV Unit", category: "misc" },
  // the Oyun Odası collection
  { id: "room_v3_bed_oyun_gingham", name: "Oyun Gingham Bed", category: "seating" },
  { id: "room_v3_bookshelf_oyun_cream", name: "Oyun Cream Bookshelf", category: "storage" },
  { id: "room_v3_dresser_oyun_honey", name: "Oyun Honey Dresser", category: "storage" },
  { id: "room_v3_nightstand_oyun_honey", name: "Oyun Honey Nightstand", category: "storage" },
  { id: "room_v3_snacktable_oyun_round", name: "Oyun Round Snack Table", category: "table" },
  { id: "room_v3_teaset_oyun_flower", name: "Oyun Flower Tea Set", category: "seating" },
  { id: "room_v3_tvunit_oyun_game", name: "Oyun Game TV Unit", category: "misc" },
  // the pouf's `sit_low` seat is pose-pending: it is a cushion to look at until that pose is drawn
  { id: "room_v3_pouf_oyun_bunnypink", name: "Oyun Bunny Pouf", category: "seating" },
  { id: "room_v3_pouf_oyun_bearpurple", name: "Oyun Bear Pouf", category: "seating" },
  { id: "room_v3_rug_oyun_checker", name: "Oyun Checker Rug", category: "rug", flat: true },
  { id: "room_v3_rug_oyun_cloud", name: "Oyun Cloud Rug", category: "rug", flat: true },
  { id: "room_v3_rug_oyun_tea", name: "Oyun Tea Rug", category: "rug", flat: true }
])

/** The wall pieces (one drawing per back wall). */
export const ROOM_AVATAR_25D_LAYERED_WALL_ENTRIES: readonly LayeredCatalogEntry[] = Object.freeze([
  { id: "room_v3_frame_japon_sakura", name: "Japon Sakura Frame", category: "wallDecor" },
  { id: "room_v3_clock_japon_flower", name: "Japon Flower Clock", category: "wallDecor" },
  { id: "room_v3_poster_oyun_bunny", name: "Oyun Bunny Poster", category: "wallDecor" },
  { id: "room_v3_poster_oyun_controller", name: "Oyun Controller Poster", category: "wallDecor" }
])

/** Seat hip offsets across a multi-seat piece (stage fractions), before the calibration places them. */
const SEAT_SPREAD = 0.15

function seatPoint(id: string, x: number): RoomSeatPoint {
  return {
    id,
    x,
    y: -0.2,
    facing: "front",
    approachPoint: { x: 0, y: 0.22 },
    exitPoint: { x: 0, y: 0.28 },
    seatHeight: 0.096
  }
}

function floorItem(entry: LayeredCatalogEntry, assets: LayeredFurnitureAssets): FurnitureItem | undefined {
  const spec = LAYERED_FURNITURE_SPECS[entry.id]
  const art = assets[entry.id]
  if (!spec || !art) return undefined
  const front = spec.rotations[LAYERED_ROTATION_INDEX.front]
  const width = front.size[0] / spec.scale / ROOM_CALIBRATION.canvas.width
  const height = front.size[1] / spec.scale / ROOM_CALIBRATION.canvas.height
  // the seats the piece's drawing really has (a pose-pending seat is filtered out by the spec loader), spread across
  // it; the calibration places each one on its `item.json` hip point
  const seatPoints = front.seats.map((seat, index, seats) =>
    seatPoint(seat.id, seats.length === 1 ? 0 : -SEAT_SPREAD + (2 * SEAT_SPREAD * index) / (seats.length - 1)))
  const layer: RoomLayer = entry.flat ? "floor" : "furniture"
  return {
    id: entry.id,
    name: entry.name,
    asset: art[LAYERED_ROTATION_INDEX.front].back,
    category: entry.category,
    layer,
    width,
    height,
    footprint: { width: width * 0.8, height: width * 0.4 },
    blocksMovement: !entry.flat,
    interactionType: seatPoints.length > 0 ? "seat" : "decor",
    ...(seatPoints.length > 0
      ? { seatPoints, seatSpec: { capacity: seatPoints.length, seatPoints: seatPoints.map((point) => ({ ...point })) } }
      : {}),
    locked: true
  }
}

function wallItem(entry: LayeredCatalogEntry, assets: LayeredWallAssets): FurnitureItem | undefined {
  const spec = LAYERED_WALL_SPECS[entry.id]
  const art = assets[entry.id]
  if (!spec || !art) return undefined
  const shape = getLayeredWallPieceShape(spec, "right", ROOM_CALIBRATION)
  return {
    id: entry.id,
    name: entry.name,
    asset: art.right.back,
    category: entry.category,
    layer: "wall",
    placementSurface: "wall",
    width: shape.width,
    height: shape.height,
    anchor: shape.anchor,
    blocksMovement: false,
    interactionType: "decor",
    locked: true
  }
}

/** The layered pieces whose art is bundled (the seam install passes the bundled layered assets). */
export function createRoomAvatar25dFurnitureCatalog(
  assets: LayeredFurnitureAssets,
  wallAssets: LayeredWallAssets = {}
): readonly FurnitureItem[] {
  return Object.freeze([
    ...ROOM_AVATAR_25D_LAYERED_FLOOR_ENTRIES.map((entry) => floorItem(entry, assets)),
    ...ROOM_AVATAR_25D_LAYERED_WALL_ENTRIES.map((entry) => wallItem(entry, wallAssets))
  ].filter((item): item is FurnitureItem => item !== undefined))
}
