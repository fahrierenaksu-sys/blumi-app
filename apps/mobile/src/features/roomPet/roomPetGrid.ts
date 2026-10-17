import type { RoomPetCell, RoomPetFacing, RoomPetMap, RoomPetSpot } from "./roomPet.types"

/** 4-neighbour steps in a fixed order so every search is deterministic. */
const NEIGHBOUR_STEPS: readonly RoomPetCell[] = [
  { column: 1, row: 0 },
  { column: 0, row: 1 },
  { column: -1, row: 0 },
  { column: 0, row: -1 }
]

export function roomPetCellKey(cell: RoomPetCell): string {
  return `${cell.column},${cell.row}`
}

export function isSameRoomPetCell(a: RoomPetCell, b: RoomPetCell): boolean {
  return a.column === b.column && a.row === b.row
}

export function isRoomPetCellWalkable(map: RoomPetMap, cell: RoomPetCell): boolean {
  return map.walkableKeys.has(roomPetCellKey(cell))
}

function compareCells(a: RoomPetCell, b: RoomPetCell): number {
  return a.row - b.row || a.column - b.column
}

/**
 * Builds the pet's map. Cells are deduplicated and sorted; spots whose cell is
 * not walkable are dropped (the pet must never leave the walkable area).
 */
export function createRoomPetMap(cells: readonly RoomPetCell[], spots: readonly RoomPetSpot[]): RoomPetMap {
  const byKey = new Map<string, RoomPetCell>()
  for (const cell of cells) {
    if (!Number.isInteger(cell.column) || !Number.isInteger(cell.row)) {
      throw new Error("Room pet cells must have integer column and row")
    }
    byKey.set(roomPetCellKey(cell), { column: cell.column, row: cell.row })
  }
  const sortedCells = [...byKey.values()].sort(compareCells)
  const walkableKeys = new Set(byKey.keys())
  const usableSpots = spots
    .filter((spot) => walkableKeys.has(roomPetCellKey(spot.cell)))
    .map((spot) => ({ ...spot, cell: { column: spot.cell.column, row: spot.cell.row } }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { cells: sortedCells, walkableKeys, spots: usableSpots }
}

export function getRoomPetNeighbours(map: RoomPetMap, cell: RoomPetCell): RoomPetCell[] {
  return NEIGHBOUR_STEPS
    .map((step) => ({ column: cell.column + step.column, row: cell.row + step.row }))
    .filter((next) => isRoomPetCellWalkable(map, next))
}

/**
 * Breadth-first distances from `from` over walkable cells that are not
 * blocked. The start cell itself is always included (distance 0).
 */
export function getRoomPetDistances(
  map: RoomPetMap,
  from: RoomPetCell,
  blockedKeys: ReadonlySet<string>
): Map<string, number> {
  const distances = new Map<string, number>([[roomPetCellKey(from), 0]])
  const queue: RoomPetCell[] = [from]
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    const distance = distances.get(roomPetCellKey(current)) ?? 0
    for (const next of getRoomPetNeighbours(map, current)) {
      const key = roomPetCellKey(next)
      if (distances.has(key) || blockedKeys.has(key)) continue
      distances.set(key, distance + 1)
      queue.push(next)
    }
  }
  return distances
}

/** Shortest path (excluding `from`) to `to` around blocked cells, or null when unreachable. */
export function findRoomPetPath(
  map: RoomPetMap,
  from: RoomPetCell,
  to: RoomPetCell,
  blockedKeys: ReadonlySet<string>
): RoomPetCell[] | null {
  if (isSameRoomPetCell(from, to)) return []
  const targetKey = roomPetCellKey(to)
  if (!map.walkableKeys.has(targetKey) || blockedKeys.has(targetKey)) return null
  const previous = new Map<string, RoomPetCell | null>([[roomPetCellKey(from), null]])
  const queue: RoomPetCell[] = [from]
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (roomPetCellKey(current) === targetKey) break
    for (const next of getRoomPetNeighbours(map, current)) {
      const key = roomPetCellKey(next)
      if (previous.has(key) || blockedKeys.has(key)) continue
      previous.set(key, current)
      queue.push(next)
    }
  }
  if (!previous.has(targetKey)) return null
  const path: RoomPetCell[] = []
  let cursor: RoomPetCell | null = to
  while (cursor && !isSameRoomPetCell(cursor, from)) {
    path.unshift(cursor)
    cursor = previous.get(roomPetCellKey(cursor)) ?? null
  }
  return path
}

/**
 * The nearest walkable, unblocked cell to `around` (by lattice distance, then
 * row/column order). Used to step aside when an avatar lands on the pet.
 */
export function findNearestFreeRoomPetCell(
  map: RoomPetMap,
  around: RoomPetCell,
  blockedKeys: ReadonlySet<string>
): RoomPetCell | null {
  let best: { cell: RoomPetCell; distance: number } | null = null
  for (const cell of map.cells) {
    if (blockedKeys.has(roomPetCellKey(cell))) continue
    const distance = Math.abs(cell.column - around.column) + Math.abs(cell.row - around.row)
    if (!best || distance < best.distance) best = { cell, distance }
  }
  return best ? best.cell : null
}

/** The facing that best points from `from` toward `to`; `fallback` when they coincide. */
export function getRoomPetFacingToward(
  from: RoomPetCell,
  to: RoomPetCell,
  fallback: RoomPetFacing
): RoomPetFacing {
  const deltaColumn = to.column - from.column
  const deltaRow = to.row - from.row
  if (deltaColumn === 0 && deltaRow === 0) return fallback
  if (Math.abs(deltaColumn) >= Math.abs(deltaRow)) return deltaColumn > 0 ? "east" : "west"
  return deltaRow > 0 ? "south" : "north"
}
