import type { AvatarLoadout, StreetChangeKind } from "@blumi/contracts"

/**
 * Pure diffs from a saved state to the one-word street label (spec §1).
 * The kind comes only from the saved loadout and room, never from the client.
 */
export type StreetLookKind = Extract<StreetChangeKind, "dress" | "outfit" | "hair" | "shoes" | "accessory">
export type StreetRoomKind = Extract<StreetChangeKind, "rug" | "bed" | "seat" | "wall" | "shelf" | "item" | "layout">

export interface StreetPlacement {
  readonly itemId: string
  readonly x: number
  readonly y: number
  readonly rotation: string
}

export function diffStreetLook(previous: AvatarLoadout | null, next: AvatarLoadout): StreetLookKind | null {
  if (!previous) return null
  if (dressOf(previous) !== dressOf(next) && dressOf(next) !== null) return "dress"
  if (
    previous.topId !== next.topId ||
    previous.bottomId !== next.bottomId ||
    outerwearOf(previous) !== outerwearOf(next) ||
    dressOf(previous) !== dressOf(next)
  ) return "outfit"
  if (previous.hairId !== next.hairId) return "hair"
  if (previous.shoesId !== next.shoesId) return "shoes"
  if (!sameMembers(previous.accessoryIds, next.accessoryIds)) return "accessory"
  return null
}

/** Most visible first: a new bed reads before a new rug, a rug before a frame. */
const ROOM_KIND_PRIORITY: readonly StreetRoomKind[] = ["bed", "rug", "seat", "shelf", "wall", "item"]

const ROOM_KIND_BY_TOKEN: Readonly<Record<string, StreetRoomKind>> = Object.freeze({
  bed: "bed",
  rug: "rug",
  sofa: "seat",
  armchair: "seat",
  pouf: "seat",
  chair: "seat",
  bookshelf: "shelf",
  clothesrack: "shelf",
  dresser: "shelf",
  nightstand: "shelf",
  tvunit: "shelf",
  frame: "wall",
  poster: "wall",
  clock: "wall"
})

/** `room_v3_<kind>_<line>_<name>`: the kind token names the category; anything else is a plain item. */
export function roomItemStreetKind(itemId: string): StreetRoomKind {
  const tokens = itemId.split("_")
  for (const token of tokens) {
    const kind = ROOM_KIND_BY_TOKEN[token]
    if (kind) return kind
  }
  return "item"
}

export function diffStreetRoom(
  previous: readonly StreetPlacement[] | null,
  next: readonly StreetPlacement[]
): StreetRoomKind | null {
  if (!previous) return null
  const before = new Set(previous.map((item) => item.itemId))
  const added = next.filter((item) => !before.has(item.itemId))
  if (added.length > 0) {
    const kinds = new Set(added.map((item) => roomItemStreetKind(item.itemId)))
    return ROOM_KIND_PRIORITY.find((kind) => kinds.has(kind)) ?? "item"
  }
  return placementKey(previous) === placementKey(next) ? null : "layout"
}

function placementKey(items: readonly StreetPlacement[]): string {
  return items
    .map((item) => `${item.itemId}:${item.x}:${item.y}:${item.rotation}`)
    .sort()
    .join("|")
}

function dressOf(loadout: AvatarLoadout): string | null {
  return loadout.schemaVersion === 2 ? loadout.dressId : null
}

function outerwearOf(loadout: AvatarLoadout): string | null {
  return loadout.schemaVersion === 2 ? loadout.outerwearId : null
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((id) => set.has(id))
}
