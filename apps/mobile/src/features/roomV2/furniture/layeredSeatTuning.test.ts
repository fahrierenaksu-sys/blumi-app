import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { LAYERED_FURNITURE_SPECS, parseLayeredFurnitureSpec, type LayeredRotationIndex } from "./layeredFurniture"
import { LAYERED_SEAT_TUNING } from "./layeredSeatTuning"

const ROTATIONS: readonly LayeredRotationIndex[] = [0, 1, 2, 3]
const raw = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, id, "item.json"), "utf8")) as Record<string, unknown>
/** The same item.json read under another id, so no tuning applies. */
const untuned = (id: string) => parseLayeredFurnitureSpec({ ...raw(id), id: `${id}__untuned` })

/** Distance of a seat's hip along its edge (her left as she sits, lab facing (sin, cos)). */
function along(seat: { hipWorld: readonly number[]; facingYawDeg: number }): number {
  const yaw = (seat.facingYawDeg * Math.PI) / 180
  return seat.hipWorld[0]! * Math.cos(yaw) - seat.hipWorld[2]! * Math.sin(yaw)
}

test("a tuned piece keeps every seat, its id, pose and facing; only where she sits moves", () => {
  const ids = Object.keys(LAYERED_SEAT_TUNING)
  assert.ok(ids.length > 0)
  for (const id of ids) {
    for (const r of ROTATIONS) {
      const tuned = LAYERED_FURNITURE_SPECS[id]!.rotations[r].seats
      const plain = untuned(id).rotations[r].seats
      assert.deepEqual(
        tuned.map((seat) => [seat.id, seat.avatarView, seat.facingYawDeg, seat.cardSplit]),
        plain.map((seat) => [seat.id, seat.avatarView, seat.facingYawDeg, seat.cardSplit]),
        `${id} r${r}`
      )
      assert.ok(tuned.some((seat, index) => seat.hipWorld.some((value, axis) => value !== plain[index]!.hipWorld[axis])),
        `${id} r${r}: tuning has no effect`)
    }
  }
})

test("she walks up to the cell in front of where she now sits on a tuned edge", () => {
  for (const [id, seats] of Object.entries(LAYERED_SEAT_TUNING)) {
    const spec = LAYERED_FURNITURE_SPECS[id]!
    for (const r of ROTATIONS) {
      const { seats: placed, footprintCells } = spec.rotations[r]
      for (const seat of placed.filter((candidate) => seats[candidate.id]?.along !== undefined)) {
        const yaw = (seat.facingYawDeg * Math.PI) / 180
        const axis = Math.abs(Math.cos(yaw)) > Math.abs(Math.sin(yaw)) ? 0 : 1
        const coordinate = axis === 0 ? seat.hipWorld[0] : seat.hipWorld[2]
        const under = Math.floor((coordinate + (footprintCells[axis] * spec.cell) / 2) / spec.cell)
        assert.equal(seat.approachCell[axis], under, `${id} r${r} ${seat.id} approach`)
        assert.equal(seat.exitCell[axis], under, `${id} r${r} ${seat.id} exit`)
      }
    }
  }
})

test("on the starter bed she sits clear of the foot posts, two sitters still side by side (owner 2026-10-18)", () => {
  const id = "room_v3_bed_blumi_starter"
  const length = 2.273
  for (const r of ROTATIONS) {
    const seats = LAYERED_FURNITURE_SPECS[id]!.rotations[r].seats
    const positions = seats.map(along)
    for (const [index, position] of positions.entries()) {
      // a seated body is about 0.45 units wide; a post stands at each corner
      assert.ok(Math.abs(position) <= length / 2 - 0.5, `${id} r${r} ${seats[index]!.id}: in a post (${position})`)
    }
    assert.ok(Math.abs(positions[0]! - positions[1]!) >= 0.55, `${id} r${r}: sitters overlap`)
  }
})

test("on the blush armchair she sits down into the cushion, against the backrest", () => {
  const id = "room_v2_chair_blush"
  for (const r of ROTATIONS) {
    const tuned = LAYERED_FURNITURE_SPECS[id]!.rotations[r].seats[0]!
    const plain = untuned(id).rotations[r].seats[0]!
    assert.ok(tuned.hipWorld[1] < plain.hipWorld[1], `r${r}: not lower`)
    const yaw = (tuned.facingYawDeg * Math.PI) / 180
    const forward = (seat: typeof tuned) => seat.hipWorld[0] * Math.sin(yaw) + seat.hipWorld[2] * Math.cos(yaw)
    assert.ok(forward(tuned) < forward(plain), `r${r}: not nearer the backrest`)
    assert.deepEqual(tuned.frontEdgePx, plain.frontEdgePx, `r${r}: the cushion's front edge is the chair's own`)
  }
})
