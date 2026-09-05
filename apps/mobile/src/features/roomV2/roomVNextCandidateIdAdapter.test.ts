import assert from "node:assert/strict"
import test from "node:test"
import { normalizeRoomVNextCandidateItemId } from "./roomVNextCandidateIdAdapter"

test("legacy Room VNext QA item IDs normalize only through explicit aliases", () => {
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_v2_cozy_bed"),
    "universal_cloud_bed_b"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_lounge_chair"),
    "universal_lounge_armchair_a"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_round_table"),
    "universal_round_dining_table_a"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_side_table"),
    "universal_petal_side_table_a"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_lamp"),
    "universal_orbit_floor_lamp_a"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_bookshelf"),
    "universal_open_bookshelf_a"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_rug"),
    "universal_rug_a"
  )
})

test("unknown or already-canonical room IDs are left untouched", () => {
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_unknown_candidate"),
    "room_vnext_unknown_candidate"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("universal_cloud_bed_b"),
    "universal_cloud_bed_b"
  )
  assert.equal(
    normalizeRoomVNextCandidateItemId("room_vnext_tabletop_plant"),
    "room_vnext_tabletop_plant"
  )
})
