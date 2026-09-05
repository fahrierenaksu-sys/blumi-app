import assert from "node:assert/strict"
import test from "node:test"
import {
  createUniversalBooksMagazineStackAPilot,
  createUniversalCeilingLightAPilot,
  createUniversalCeramicVaseSetAPilot,
  createUniversalCurtainSetAPilot,
  createUniversalDecorativeObjectSetAPilot,
  createUniversalArchWallMirrorAPilot,
  createUniversalCushionSetAPilot,
  createUniversalFullLengthMirrorAPilot,
  createUniversalOpenDisplayShelfAPilot,
  createUniversalRoomDividerAPilot,
  createUniversalRugAPilot,
  createUniversalSmallTabletopPlantAPilot,
  createUniversalSmallSpeakerAPilot,
  createUniversalTableLampAPilot,
  createUniversalTeaCoffeeTrayAPilot,
  createUniversalWallArtworkAPilot,
  createUniversalWallClockAPilot
} from "./roomV3UniversalCoreSurfacePilotFurniture"

const ASSET = { key: "candidate", source: 1 }

test("surface pilots declare the correct custom placement contract", () => {
  const tabletopItems = [
    createUniversalTableLampAPilot(ASSET),
    createUniversalSmallTabletopPlantAPilot(ASSET),
    createUniversalCeramicVaseSetAPilot(ASSET),
    createUniversalBooksMagazineStackAPilot(ASSET),
    createUniversalTeaCoffeeTrayAPilot(ASSET)
  ]
  assert.ok(tabletopItems.every((item) => item.placementSurface === "tabletop"))
  assert.ok(tabletopItems.every((item) => item.blocksMovement === false))
  assert.ok(tabletopItems.every((item) => item.interactionType === "decor"))

  const clock = createUniversalWallClockAPilot(ASSET)
  const artwork = createUniversalWallArtworkAPilot(ASSET)
  const ceiling = createUniversalCeilingLightAPilot(ASSET)
  const curtain = createUniversalCurtainSetAPilot(ASSET)
  const decorativeSet = createUniversalDecorativeObjectSetAPilot(ASSET)
  assert.equal(clock.placementSurface, "wall")
  assert.equal(clock.surfacePlacementPolicy, "avoid_openings")
  assert.equal(clock.layer, "wall")
  assert.equal(clock.anchor?.y, 0.5)
  assert.equal(clock.blocksMovement, false)
  assert.equal(artwork.placementSurface, "wall")
  assert.equal(artwork.surfacePlacementPolicy, "avoid_openings")
  assert.equal(artwork.layer, "wall")
  assert.equal(ceiling.placementSurface, "ceiling")
  assert.equal(ceiling.layer, "wall")
  assert.equal(curtain.placementSurface, "wall")
  assert.equal(curtain.surfacePlacementPolicy, "opening")
  assert.equal(curtain.layer, "wall")
  assert.equal(decorativeSet.placementSurface, "tabletop")
  assert.equal(decorativeSet.layer, "furniture")

  assert.equal(createUniversalTableLampAPilot(ASSET).placementSurface, "tabletop")
  assert.equal(createUniversalSmallTabletopPlantAPilot(ASSET).placementSurface, "tabletop")
  assert.equal(createUniversalCeramicVaseSetAPilot(ASSET).placementSurface, "tabletop")
  assert.equal(createUniversalBooksMagazineStackAPilot(ASSET).placementSurface, "tabletop")
  assert.equal(createUniversalTeaCoffeeTrayAPilot(ASSET).placementSurface, "tabletop")
})

test("wall mirror remains a wall-only prop with no floor collider", () => {
  const mirror = createUniversalArchWallMirrorAPilot(ASSET)

  assert.equal(mirror.placementSurface, "wall")
  assert.equal(mirror.surfacePlacementPolicy, "avoid_openings")
  assert.equal(mirror.layer, "wall")
  assert.equal(mirror.blocksMovement, false)
  assert.equal(mirror.anchor?.x, 0.5)
  assert.equal(mirror.anchor?.y, 0.5)
})

test("new universal surface wave keeps floor and tabletop contracts explicit", () => {
  const speaker = createUniversalSmallSpeakerAPilot(ASSET)
  const rug = createUniversalRugAPilot(ASSET)
  const cushionSet = createUniversalCushionSetAPilot(ASSET)
  const fullLengthMirror = createUniversalFullLengthMirrorAPilot(ASSET)
  const shelf = createUniversalOpenDisplayShelfAPilot(ASSET)
  const divider = createUniversalRoomDividerAPilot(ASSET)

  assert.equal(speaker.placementSurface, "floor")
  assert.equal(speaker.layer, "furniture")
  assert.equal(speaker.blocksMovement, true)
  assert.deepEqual(speaker.footprint, { width: 0.1, height: 0.08 })
  assert.deepEqual(speaker.footprintByRotation?.right, {
    width: 0.08,
    height: 0.1
  })
  assert.equal(rug.placementSurface, "floor")
  assert.equal(rug.category, "rug")
  assert.equal(rug.blocksMovement, false)
  assert.equal(cushionSet.placementSurface, "floor")
  assert.equal(cushionSet.layer, "furniture")
  assert.equal(cushionSet.blocksMovement, false)
  assert.equal(fullLengthMirror.placementSurface, "floor")
  assert.equal(fullLengthMirror.blocksMovement, true)
  assert.deepEqual(fullLengthMirror.footprint, { width: 0.11, height: 0.08 })
  assert.deepEqual(fullLengthMirror.footprintByRotation?.left, { width: 0.08, height: 0.11 })
  assert.equal(shelf.placementSurface, "floor")
  assert.deepEqual(shelf.footprint, { width: 0.22, height: 0.11 })
  assert.deepEqual(shelf.footprintByRotation?.right, { width: 0.11, height: 0.22 })
  assert.equal(shelf.surfaceSupports?.[0]?.surface, "tabletop")
  assert.equal(divider.placementSurface, "floor")
  assert.equal(divider.blocksMovement, true)
  assert.deepEqual(divider.footprint, { width: 0.27, height: 0.11 })
  assert.deepEqual(divider.footprintByRotation?.left, { width: 0.11, height: 0.27 })
})
