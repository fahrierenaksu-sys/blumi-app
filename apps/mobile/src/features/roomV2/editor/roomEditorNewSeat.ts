import type { FurnitureItem, PlacedRoomItem } from "../roomV2.types"

/**
 * "Her avatar tries the new seat" ("Odayı düzenle" Phase D, 2.5D room): after the editor saves a room
 * with a newly placed seat, My Room walks her to that seat and sits her on it, once.
 *
 * It happens after Save, not while editing: the editor has no live avatar or walk, the draft can still be undone
 * or discarded, and touches there belong to dragging. After Save the seat is the server-confirmed room and My Room
 * already owns the walk and the seat path, so she sits on exactly what was saved. The hand-over is client-only and
 * one-shot: nothing here reaches the draft, Save or the server.
 */

/**
 * The seat to try after a save: the last seat in `after` that `before` (the room the editor opened with) did not
 * have. Moving or turning a seat that was already there does not count.
 */
export function findRoomEditorNewSeat(input: {
  before: readonly Pick<PlacedRoomItem, "instanceId">[]
  after: readonly Pick<PlacedRoomItem, "instanceId" | "itemId">[]
  furnitureCatalog: readonly Pick<FurnitureItem, "id" | "interactionType">[]
}): string | undefined {
  const existing = new Set(input.before.map((item) => item.instanceId))
  const seatIds = new Set(input.furnitureCatalog.filter((item) => item.interactionType === "seat").map((item) => item.id))
  const fresh = input.after.filter((item) => !existing.has(item.instanceId) && seatIds.has(item.itemId))
  return fresh[fresh.length - 1]?.instanceId
}

let pendingNewSeat: string | undefined

/** The editor saved a room with this new seat (or none): My Room picks it up when it shows the room. */
export function offerRoomEditorNewSeat(instanceId: string | undefined): void {
  pendingNewSeat = instanceId
}

/** The seat waiting to be tried, without taking it (My Room waits until that seat is in its room). */
export function peekRoomEditorNewSeat(): string | undefined {
  return pendingNewSeat
}

/** Takes the waiting seat: it is tried at most once. */
export function takeRoomEditorNewSeat(): string | undefined {
  const instanceId = pendingNewSeat
  pendingNewSeat = undefined
  return instanceId
}
