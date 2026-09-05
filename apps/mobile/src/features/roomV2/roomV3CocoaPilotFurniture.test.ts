import assert from "node:assert/strict"
import test from "node:test"
import {
  createCocoaDiningChairDPilot,
  createCocoaLoungeArmchairBPilot,
  createCocoaNavyDiningChairAPilot,
  createCocoaNavyDiningChairBPilot,
  createCocoaNavyDiningTableAPilot,
  createCocoaNavyDiningTableBPilot,
  createCocoaNavyLoungeArmchairAPilot,
  createCocoaNavyLoungeArmchairBPilot,
  type CocoaPilotDirectionalAssets
} from "./roomV3CocoaPilotFurniture"
import { getRoomV3FootprintForRotation, getRoomV3SeatPoints } from "./roomV3Contracts"

const assets: CocoaPilotDirectionalAssets = {
  front: { key: "front", source: 0 as never },
  back: { key: "back", source: 0 as never },
  left: { key: "left", source: 0 as never },
  right: { key: "right", source: 0 as never }
}

test("Cocoa dining chair D has a real four-direction, one-seat scale calibration draft", () => {
  const chair = createCocoaDiningChairDPilot(assets)

  assert.equal(chair.rotationPolicy, "directional_assets_required")
  assert.deepEqual(chair.assetsByRotation, assets)
  assert.equal(new Set(Object.values(chair.assetsByRotation).map((asset) => asset.key)).size, 4)
  assert.deepEqual(getRoomV3FootprintForRotation(chair, "front"), { width: 0.105, height: 0.075 })
  assert.deepEqual(getRoomV3FootprintForRotation(chair, "left"), { width: 0.075, height: 0.105 })

  assert.deepEqual(getRoomV3SeatPoints({
    seatSpec: chair.seatSpec,
    x: 0.5,
    y: 0.82,
    width: chair.width,
    height: chair.height,
    rotation: "front"
  }), [{
    id: "primary",
    facing: "front",
    seatHeight: 0.083,
    seat: { x: 0.5, y: 0.7364 },
    approach: { x: 0.5, y: 0.8794 },
    exit: { x: 0.5, y: 0.8904 }
  }])

  assert.deepEqual(getRoomV3SeatPoints({
    seatSpec: chair.seatSpec,
    x: 0.5,
    y: 0.82,
    width: chair.width,
    height: chair.height,
    rotation: "left"
  }), [{
    id: "primary",
    facing: "left",
    seatHeight: 0.083,
    seat: { x: 0.424, y: 0.82 },
    approach: { x: 0.554, y: 0.82 },
    exit: { x: 0.564, y: 0.82 }
  }])
})

test("Cocoa lounge armchair B keeps a separate one-seat footprint and safe exit", () => {
  const armchair = createCocoaLoungeArmchairBPilot(assets)

  assert.equal(armchair.seatSpec?.capacity, 1)
  assert.deepEqual(getRoomV3FootprintForRotation(armchair, "front"), { width: 0.15, height: 0.1 })
  assert.deepEqual(getRoomV3FootprintForRotation(armchair, "right"), { width: 0.1, height: 0.15 })

  const [seat] = getRoomV3SeatPoints({
    seatSpec: armchair.seatSpec,
    x: 0.5,
    y: 0.8,
    width: armchair.width,
    height: armchair.height,
    rotation: "front"
  })

  assert.deepEqual(seat, {
    id: "primary",
    facing: "front",
    seatHeight: 0.09,
    seat: { x: 0.5, y: 0.7184 },
    approach: { x: 0.5, y: 0.8696 },
    exit: { x: 0.5, y: 0.8816 }
  })
})

test("Cocoa Navy lounge armchair B binds the active candidate ID to the calibrated seat contract", () => {
  const armchair = createCocoaNavyLoungeArmchairBPilot(assets)

  assert.equal(armchair.id, "cocoa_navy_lounge_armchair_b")
  assert.equal(armchair.name, "Cocoa Navy Frame Lounge Armchair")
  assert.equal(armchair.qaStatus, "pending")
  assert.equal(armchair.sourceStatus, "candidate")
  assert.deepEqual(armchair.anchorByRotation, {
    front: { x: 0.5, y: 1 },
    back: { x: 0.5, y: 1 },
    left: { x: 0.5, y: 1 },
    right: { x: 0.5, y: 1 }
  })
  assert.equal(armchair.seatSpec?.seatPoints[0]?.seatHeight, 0.09)
})

test("Cocoa Navy lounge armchair A binds its distinct candidate ID to the same seat semantics", () => {
  const armchair = createCocoaNavyLoungeArmchairAPilot(assets)

  assert.equal(armchair.id, "cocoa_navy_lounge_armchair_a")
  assert.equal(armchair.name, "Cocoa Navy Frame Lounge Armchair A")
  assert.equal(armchair.placementSurface, "floor")
  assert.equal(armchair.seatSpec?.capacity, 1)
  assert.equal(armchair.seatSpec?.seatPoints[0]?.seatHeight, 0.09)
  assert.deepEqual(getRoomV3FootprintForRotation(armchair, "left"), {
    width: 0.1,
    height: 0.15
  })
})

test("Cocoa Navy dining table B declares a rotation-aware tabletop support contract", () => {
  const table = createCocoaNavyDiningTableBPilot(assets)

  assert.equal(table.id, "cocoa_navy_dining_table_b")
  assert.equal(table.placementSurface, "floor")
  assert.equal(table.blocksMovement, true)
  assert.equal(table.surfaceSupports?.[0]?.surface, "tabletop")
  assert.deepEqual(table.surfaceSupports?.[0]?.localBoundsByRotation?.left, {
    minX: 0.16,
    maxX: 0.84,
    minY: 0.18,
    maxY: 0.4
  })
  assert.equal(table.sourceStatus, "candidate")
  assert.equal(table.qaStatus, "pending")
})

test("Cocoa Navy dining chair variants bind independent candidate IDs to the seat contract", () => {
  const chairA = createCocoaNavyDiningChairAPilot(assets)
  const chairB = createCocoaNavyDiningChairBPilot(assets)

  assert.deepEqual([chairA.id, chairB.id], [
    "cocoa_navy_dining_chair_a",
    "cocoa_navy_dining_chair_b"
  ])
  assert.notEqual(chairA.name, chairB.name)
  assert.equal(chairA.seatSpec?.capacity, 1)
  assert.equal(chairB.seatSpec?.capacity, 1)
  assert.equal(chairA.rotationPolicy, "directional_assets_required")
  assert.equal(chairB.rotationPolicy, "directional_assets_required")
})

test("Cocoa Navy dining table A shares the explicit tabletop support contract", () => {
  const table = createCocoaNavyDiningTableAPilot(assets)

  assert.equal(table.id, "cocoa_navy_dining_table_a")
  assert.equal(table.interactionType, "none")
  assert.equal(table.surfaceSupports?.[0]?.surface, "tabletop")
  assert.equal(table.footprintByRotation?.right?.width, 0.18)
  assert.equal(table.footprintByRotation?.right?.height, 0.3)
})
