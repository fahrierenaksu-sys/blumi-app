import type { RoomV2FloorBox, RoomV2RenderItem } from "./roomV2.types"

/**
 * The room's painter's order for pieces standing on floor cells. One depth number per piece (its front corner)
 * cannot order pieces of different sizes: a nightstand beside a bed's head has the nearer box but the smaller
 * corner, so the bed was drawn over it. Two floor boxes that do not share floor are ordered by the box itself:
 * the one entirely behind the other on a floor axis, where they share the other axis, draws first. Rugs lying on
 * each other draw the larger first, so a small rug laid on a big one stays visible. Pieces with no such rule
 * between them keep the depth order they came in.
 */

/** Floor boxes closer than this (world units) touch rather than share floor. */
const TOUCH_EPSILON = 1e-6

type Before = "first" | "second" | "none"

function sharesRange(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax - TOUCH_EPSILON && bMin < aMax - TOUCH_EPSILON
}

function isBehind(a: RoomV2FloorBox, b: RoomV2FloorBox): boolean {
  const behindOnX = a.maxX <= b.minX + TOUCH_EPSILON
  const behindOnZ = a.maxZ <= b.minZ + TOUCH_EPSILON
  return (behindOnX && (behindOnZ || sharesRange(a.minZ, a.maxZ, b.minZ, b.maxZ))) ||
    (behindOnZ && sharesRange(a.minX, a.maxX, b.minX, b.maxX))
}

function area(box: RoomV2FloorBox): number {
  return (box.maxX - box.minX) * (box.maxZ - box.minZ)
}

function isFlat(item: RoomV2RenderItem): boolean {
  return item.kind === "furniture" && (item.layer === "floor" || item.sceneProjection === "floor_plane")
}

/** Which of two boxed pieces on one layer must be drawn first, if the floor decides it. */
function drawBefore(a: RoomV2RenderItem, aBox: RoomV2FloorBox, b: RoomV2RenderItem, bBox: RoomV2FloorBox): Before {
  const sharesFloor = sharesRange(aBox.minX, aBox.maxX, bBox.minX, bBox.maxX) &&
    sharesRange(aBox.minZ, aBox.maxZ, bBox.minZ, bBox.maxZ)
  if (sharesFloor) {
    if (!isFlat(a) || !isFlat(b)) return "none"
    const delta = area(aBox) - area(bBox)
    return delta > TOUCH_EPSILON ? "first" : delta < -TOUCH_EPSILON ? "second" : "none"
  }
  if (isBehind(aBox, bBox)) return "first"
  if (isBehind(bBox, aBox)) return "second"
  return "none"
}

function floorBoxOf(item: RoomV2RenderItem): RoomV2FloorBox | undefined {
  return item.kind === "furniture" ? item.floorBox : undefined
}

/**
 * Reorders the boxed pieces of each layer among the slots they already hold in `sorted` (a list in
 * `compareRoomV2RenderItems` order); avatars and unboxed pieces keep their places. Among pieces free to go next,
 * the one earliest in `sorted` goes first; a cycle (never expected for boxes that do not share floor) is broken
 * the same way.
 */
export function applyRoomV2FloorDrawOrder<T extends RoomV2RenderItem>(sorted: readonly T[]): T[] {
  const result = [...sorted]
  const slotsByLayer = new Map<string, number[]>()
  sorted.forEach((item, index) => {
    if (!floorBoxOf(item)) return
    slotsByLayer.set(item.layer, [...(slotsByLayer.get(item.layer) ?? []), index])
  })
  for (const slots of slotsByLayer.values()) {
    if (slots.length < 2) continue
    const order = orderBoxedPieces(slots.map((slot) => sorted[slot]!))
    order.forEach((pieceIndex, position) => {
      result[slots[position]!] = sorted[slots[pieceIndex]!]!
    })
  }
  return result
}

/** Indices into `pieces`, in draw order. */
function orderBoxedPieces(pieces: readonly RoomV2RenderItem[]): number[] {
  const count = pieces.length
  const boxes = pieces.map((piece) => floorBoxOf(piece)!)
  const after: number[][] = pieces.map(() => [])
  const waitingOn = new Array<number>(count).fill(0)
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const before = drawBefore(pieces[i]!, boxes[i]!, pieces[j]!, boxes[j]!)
      if (before === "none") continue
      const [first, second] = before === "first" ? [i, j] : [j, i]
      after[first]!.push(second)
      waitingOn[second]! += 1
    }
  }
  const placed = new Array<boolean>(count).fill(false)
  const order: number[] = []
  while (order.length < count) {
    let next = -1
    for (let index = 0; index < count; index += 1) {
      if (!placed[index] && waitingOn[index] === 0) {
        next = index
        break
      }
    }
    if (next < 0) next = placed.indexOf(false)
    placed[next] = true
    order.push(next)
    for (const later of after[next]!) waitingOn[later]! -= 1
  }
  return order
}
