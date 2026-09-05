import assert from "node:assert/strict"
import test from "node:test"
import { ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS } from "./roomV3UniversalCoreCandidateIds"
import {
  CANONICAL_ROOM_AVATAR_HEIGHT_METERS,
  ROOM_V3_FOCUS_12_PHYSICAL_SCALE_BY_CANDIDATE_ID,
  ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID,
  getRoomV3NormalizedPhysicalFootprint,
  getRoomV3ProjectedRenderSize,
  getRoomV3ScenePhysicalFootprint,
  getRoomV3SceneRenderSize
} from "./roomV3PhysicalScaleContract"

test("physical scale contract exhaustively profiles all 45 Universal Core SKUs", () => {
  assert.equal(CANONICAL_ROOM_AVATAR_HEIGHT_METERS, 1.7)
  assert.deepEqual(
    Object.keys(ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID).sort(),
    [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS].sort()
  )

  for (const candidateId of ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS) {
    const profile = ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID[candidateId]
    assert.ok(profile.widthMeters > 0)
    assert.ok(profile.depthMeters > 0)
    assert.ok(profile.heightMeters > 0)
  }
})

test("the three QA Home additions also have explicit physical profiles", () => {
  assert.deepEqual(
    Object.keys(ROOM_V3_FOCUS_12_PHYSICAL_SCALE_BY_CANDIDATE_ID).sort(),
    [
      "universal_cloud_sectional_sofa_a",
      "universal_cozy_tv_media_unit_a",
      "universal_home_arcade_a"
    ]
  )
})

test("seating and bed families keep realistic relative dimensions", () => {
  const sofa = ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID.universal_long_sofa_a
  const loveseat =
    ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID.universal_cloud_loveseat_a
  const chair =
    ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID.universal_cloud_accent_chair_b
  const bed = ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID.universal_cloud_bed_b
  const petBed = ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID.universal_pet_bed_a

  assert.equal(sofa.family, "sofa")
  assert.equal(loveseat.family, "loveseat")
  assert.equal(chair.family, "armchair")
  assert.ok(sofa.widthMeters > loveseat.widthMeters)
  assert.ok(loveseat.widthMeters > chair.widthMeters)
  assert.equal(bed.family, "bed")
  assert.ok(bed.widthMeters > petBed.widthMeters)
  assert.ok(bed.depthMeters > petBed.depthMeters)
})

test("front/back and left/right rotations deterministically swap the footprint axes", () => {
  const front = getRoomV3NormalizedPhysicalFootprint(
    "universal_cloud_bed_b",
    "front"
  )
  const back = getRoomV3NormalizedPhysicalFootprint(
    "universal_cloud_bed_b",
    "back"
  )
  const left = getRoomV3NormalizedPhysicalFootprint(
    "universal_cloud_bed_b",
    "left"
  )
  const right = getRoomV3NormalizedPhysicalFootprint(
    "universal_cloud_bed_b",
    "right"
  )

  assert.deepEqual(front, back)
  assert.deepEqual(left, right)
  assert.equal(left.width, front.depth)
  assert.equal(left.depth, front.width)
})

test("projected render sizes preserve vertical height and rotate floor depth", () => {
  const front = getRoomV3ProjectedRenderSize(
    "universal_tidy_work_desk_a",
    "front"
  )
  const left = getRoomV3ProjectedRenderSize(
    "universal_tidy_work_desk_a",
    "left"
  )

  assert.equal(front.heightInAvatarHeights, left.heightInAvatarHeights)
  assert.notEqual(front.widthInAvatarHeights, left.widthInAvatarHeights)
  assert.notEqual(
    getRoomV3SceneRenderSize("universal_tidy_work_desk_a", "front").height,
    getRoomV3SceneRenderSize("universal_tidy_work_desk_a", "left").height
  )
  assert.deepEqual(
    front,
    getRoomV3ProjectedRenderSize("universal_tidy_work_desk_a", "front")
  )
})

test("scene projection makes the real sofa wider than the bed and single chair", () => {
  const sofa = getRoomV3SceneRenderSize("universal_long_sofa_a", "front")
  const bed = getRoomV3SceneRenderSize("universal_cloud_bed_b", "front")
  const chair = getRoomV3SceneRenderSize(
    "universal_lounge_armchair_a",
    "front"
  )

  assert.ok(sofa.width > bed.width)
  assert.ok(sofa.width >= chair.width * 2.4)
  assert.ok(bed.height > sofa.height)

  const bedFootprint = getRoomV3ScenePhysicalFootprint(
    "universal_cloud_bed_b",
    "front"
  )
  assert.ok(bedFootprint.height > bedFootprint.width / 2)
})

test("seat heights remain plausible for the canonical 1.70m avatar", () => {
  const seatedProfiles = Object.values(
    ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID
  ).filter((profile) => profile.seatHeightMeters !== undefined)

  assert.ok(seatedProfiles.length >= 9)
  for (const profile of seatedProfiles) {
    assert.ok((profile.seatHeightMeters ?? 0) >= 0.35)
    assert.ok((profile.seatHeightMeters ?? 0) <= 0.55)
    assert.ok((profile.seatHeightMeters ?? 0) < profile.heightMeters)
  }
})

test("the exported contract and helper results are immutable", () => {
  assert.ok(Object.isFrozen(ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID))
  assert.ok(
    Object.values(ROOM_V3_PHYSICAL_SCALE_BY_CANDIDATE_ID).every(Object.isFrozen)
  )
  assert.ok(
    Object.isFrozen(
      getRoomV3NormalizedPhysicalFootprint(
        "universal_cloud_loveseat_a",
        "front"
      )
    )
  )
  assert.ok(
    Object.isFrozen(
      getRoomV3ProjectedRenderSize(
        "universal_cloud_loveseat_a",
        "front"
      )
    )
  )
})
