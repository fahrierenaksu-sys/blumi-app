import assert from "node:assert/strict"
import test from "node:test"
import {
  createUniversalCloudLoveseatAPilot,
  createUniversalArcCoffeeTableBPilot,
  createUniversalCloudAccentChairBPilot,
  createUniversalDeskChairAPilot,
  createUniversalBenchAPilot,
  createUniversalDiningChairAPilot,
  createUniversalDresserAPilot,
  createUniversalNightstandAPilot,
  createUniversalLaundryBasketAPilot,
  createUniversalVanityTableAPilot,
  createUniversalShoeCabinetAPilot,
  createUniversalCloudBedBPilot,
  createUniversalRoundedWardrobeAPilot,
  createUniversalSoftMediaConsoleAPilot,
  createUniversalSoftCoatStandAPilot,
  createUniversalSoftPoufBPilot,
  createUniversalLongSofaAPilot,
  createUniversalLoungeArmchairAPilot,
  createUniversalOrbitFloorLampAPilot,
  createUniversalPetalSideTableAPilot,
  createUniversalPetBedAPilot,
  createUniversalRoundDiningTableAPilot,
  createUniversalSoftFloorCushionAPilot,
  createUniversalStorageCabinetAPilot,
  createUniversalTidyWorkDeskAPilot,
  type UniversalCorePilotDirectionalAssets
} from "./roomV3UniversalCorePilotFurniture"
import { getRoomV3FootprintForRotation, getRoomV3SeatPoints } from "./roomV3Contracts"

const assets: UniversalCorePilotDirectionalAssets = {
  front: { key: "front", source: 0 as never },
  back: { key: "back", source: 0 as never },
  left: { key: "left", source: 0 as never },
  right: { key: "right", source: 0 as never }
}

test("Universal Core loveseat has two separately addressable seats and direction-aware collision", () => {
  const loveseat = createUniversalCloudLoveseatAPilot(assets)

  assert.equal(loveseat.collectionId, "universal_core")
  assert.equal(loveseat.rotationPolicy, "directional_assets_required")
  assert.equal(loveseat.seatSpec?.capacity, 2)
  assert.deepEqual(loveseat.frontOcclusionByRotation?.front, {
    left: 0.02,
    top: 0.58,
    width: 0.96,
    height: 0.39
  })
  assert.deepEqual(loveseat.frontOcclusionByRotation?.back, {
    left: 0.02,
    top: 0.68,
    width: 0.96,
    height: 0.29
  })
  assert.deepEqual(loveseat.frontOcclusionByRotation?.left, {
    left: 0.02,
    top: 0.68,
    width: 0.96,
    height: 0.29
  })
  assert.deepEqual(loveseat.frontOcclusionByRotation?.right, {
    left: 0.02,
    top: 0.68,
    width: 0.96,
    height: 0.29
  })
  assert.deepEqual({ width: loveseat.width, height: loveseat.height }, {
    width: 0.34,
    height: 0.23
  })
  assert.deepEqual(getRoomV3FootprintForRotation(loveseat, "front"), {
    width: 0.205,
    height: 0.105
  })
  assert.deepEqual(getRoomV3FootprintForRotation(loveseat, "left"), {
    width: 0.105,
    height: 0.205
  })
  assert.deepEqual(
    getRoomV3SeatPoints({
      seatSpec: loveseat.seatSpec,
      x: 0.5,
      y: 0.79,
      width: loveseat.width,
      height: loveseat.height,
      rotation: "front"
    }),
    [
      {
        id: "left",
        facing: "front",
        seatHeight: 0.085,
        seat: { x: 0.4592, y: 0.7854 },
        approach: { x: 0.4592, y: 0.8544 },
        exit: { x: 0.4592, y: 0.8682 }
      },
      {
        id: "right",
        facing: "front",
        seatHeight: 0.085,
        seat: { x: 0.5408, y: 0.7854 },
        approach: { x: 0.5408, y: 0.8544 },
        exit: { x: 0.5408, y: 0.8682 }
      }
    ]
  )

})

test("Universal Core round dining table keeps a rotation-invariant contact base", () => {
  const diningTable = createUniversalRoundDiningTableAPilot(assets)

  assert.deepEqual(getRoomV3FootprintForRotation(diningTable, "front"), {
    width: 0.15,
    height: 0.11
  })
  assert.deepEqual(
    getRoomV3FootprintForRotation(diningTable, "left"),
    getRoomV3FootprintForRotation(diningTable, "front")
  )
  assert.deepEqual(
    getRoomV3FootprintForRotation(diningTable, "right"),
    getRoomV3FootprintForRotation(diningTable, "front")
  )
})

test("Universal Core accent chair has one four-direction seat calibration draft", () => {
  const accentChair = createUniversalCloudAccentChairBPilot(assets)

  assert.equal(accentChair.seatSpec?.capacity, 1)
  assert.deepEqual(getRoomV3FootprintForRotation(accentChair, "front"), {
    width: 0.13,
    height: 0.09
  })
  assert.deepEqual(getRoomV3FootprintForRotation(accentChair, "right"), {
    width: 0.09,
    height: 0.13
  })
  assert.deepEqual(
    getRoomV3SeatPoints({
      seatSpec: accentChair.seatSpec,
      x: 0.5,
      y: 0.8,
      width: accentChair.width,
      height: accentChair.height,
      rotation: "front"
    }),
    [
      {
        id: "primary",
        facing: "front",
        seatHeight: 0.092,
        seat: { x: 0.5, y: 0.7616 },
        approach: { x: 0.5, y: 0.8672 },
        exit: { x: 0.5, y: 0.8792 }
      }
    ]
  )
})

test("Universal Core dining and desk chairs expose one honest seat each", () => {
  const diningChair = createUniversalDiningChairAPilot(assets)
  const deskChair = createUniversalDeskChairAPilot(assets)

  for (const item of [diningChair, deskChair]) {
    assert.equal(item.placementSurface, "floor")
    assert.equal(item.interactionType, "seat")
    assert.equal(item.seatSpec?.capacity, 1)
    assert.deepEqual(item.assetsByRotation, assets)
    assert.deepEqual(getRoomV3FootprintForRotation(item, "left"), {
      width: 0.08,
      height: 0.11
    })
    assert.equal(item.seatSpec?.seatPoints[0]?.approachPoint?.y, 0.28)
    assert.equal(item.seatSpec?.seatPoints[0]?.exitPoint?.y, 0.34)
  }
})

test("Universal Core long sofa exposes two non-overlapping seats and directional footprint", () => {
  const sofa = createUniversalLongSofaAPilot(assets)

  assert.equal(sofa.placementSurface, "floor")
  assert.equal(sofa.interactionType, "seat")
  assert.equal(sofa.seatSpec?.capacity, 2)
  assert.deepEqual(getRoomV3FootprintForRotation(sofa, "front"), {
    width: 0.32,
    height: 0.14
  })
  assert.deepEqual(getRoomV3FootprintForRotation(sofa, "right"), {
    width: 0.14,
    height: 0.32
  })

  const seats = getRoomV3SeatPoints({
    seatSpec: sofa.seatSpec,
    x: 0.5,
    y: 0.8,
    width: sofa.width,
    height: sofa.height,
    rotation: "front"
  })
  assert.equal(seats.length, 2)
  assert.notEqual(seats[0]?.seat.x, seats[1]?.seat.x)
  assert.notEqual(seats[0]?.approach.x, seats[1]?.approach.x)
})

test("Universal Core lounge armchair exposes one seat and an honest side footprint", () => {
  const armchair = createUniversalLoungeArmchairAPilot(assets)

  assert.equal(armchair.interactionType, "seat")
  assert.equal(armchair.seatSpec?.capacity, 1)
  assert.deepEqual(getRoomV3FootprintForRotation(armchair, "front"), {
    width: 0.15,
    height: 0.1
  })
  assert.deepEqual(getRoomV3FootprintForRotation(armchair, "left"), {
    width: 0.1,
    height: 0.15
  })
})

test("Universal Core decor pilots remain four-directional, blocking floor objects", () => {
  const sideTable = createUniversalPetalSideTableAPilot(assets)
  const floorLamp = createUniversalOrbitFloorLampAPilot(assets)
  const workDesk = createUniversalTidyWorkDeskAPilot(assets)
  const coffeeTable = createUniversalArcCoffeeTableBPilot(assets)

  for (const item of [sideTable, floorLamp, workDesk, coffeeTable]) {
    assert.equal(item.collectionId, "universal_core")
    assert.equal(item.homeTheme, "universal_core")
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(item.assetsByRotation, assets)
    assert.equal(item.blocksMovement, true)
    assert.equal(item.interactionType, "decor")
    assert.equal(item.sourceStatus, "candidate")
    assert.equal(item.qaStatus, "pending")
  }

  assert.deepEqual(getRoomV3FootprintForRotation(sideTable, "right"), {
    width: 0.08,
    height: 0.11
  })
  assert.deepEqual(getRoomV3FootprintForRotation(floorLamp, "left"), {
    width: 0.045,
    height: 0.055
  })
  assert.deepEqual(getRoomV3FootprintForRotation(workDesk, "left"), {
    width: 0.1,
    height: 0.19
  })
  assert.deepEqual(getRoomV3FootprintForRotation(coffeeTable, "right"), {
    width: 0.1,
    height: 0.16
  })
})

test("Universal Core storage pieces are floor furniture with explicit tabletop providers", () => {
  const storageCabinet = createUniversalStorageCabinetAPilot(assets)
  const dresser = createUniversalDresserAPilot(assets)

  for (const item of [storageCabinet, dresser]) {
    assert.equal(item.placementSurface, "floor")
    assert.equal(item.surfaceSupports?.length, 1)
    assert.deepEqual(item.surfaceSupports?.[0]?.localBounds, {
      minX: 0.1,
      maxX: 0.9,
      minY: 0.14,
      maxY: 0.26
    })
    assert.deepEqual(item.surfaceSupports?.[0]?.localBoundsByRotation?.left, {
      minX: 0.16,
      maxX: 0.84,
      minY: 0.1,
      maxY: 0.3
    })
    assert.equal(item.category, "misc")
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(item.assetsByRotation, assets)
    assert.deepEqual(getRoomV3FootprintForRotation(item, "front"), item.footprint)
  }

  assert.deepEqual(getRoomV3FootprintForRotation(storageCabinet, "left"), {
    width: 0.11,
    height: 0.22
  })
  assert.deepEqual(getRoomV3FootprintForRotation(dresser, "right"), {
    width: 0.11,
    height: 0.25
  })
})

test("Universal Core foundation wave keeps bed, storage, coat, and pouf semantics explicit", () => {
  const bed = createUniversalCloudBedBPilot(assets)
  const wardrobe = createUniversalRoundedWardrobeAPilot(assets)
  const mediaConsole = createUniversalSoftMediaConsoleAPilot(assets)
  const coatStand = createUniversalSoftCoatStandAPilot(assets)
  const pouf = createUniversalSoftPoufBPilot(assets)

  assert.equal(bed.interactionType, "seat")
  assert.equal(bed.seatSpec?.capacity, 2)
  assert.equal(wardrobe.blocksMovement, true)
  assert.equal(mediaConsole.surfaceSupports?.length, 1)
  assert.equal(coatStand.interactionType, "decor")
  assert.equal(pouf.seatSpec?.capacity, 1)
  for (const item of [bed, wardrobe, mediaConsole, coatStand, pouf]) {
    assert.equal(item.placementSurface, "floor")
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(item.assetsByRotation, assets)
    assert.equal(item.sourceStatus, "candidate")
  }
})

test("Universal Core seating wave keeps bench capacity and soft floor props explicit", () => {
  const bench = createUniversalBenchAPilot(assets)
  const cushion = createUniversalSoftFloorCushionAPilot(assets)
  const petBed = createUniversalPetBedAPilot(assets)

  assert.equal(bench.seatSpec?.capacity, 2)
  assert.equal(bench.interactionType, "seat")
  assert.equal(cushion.seatSpec, undefined)
  assert.equal(cushion.interactionType, "decor")
  assert.equal(petBed.interactionType, "decor")
  assert.equal(petBed.blocksMovement, true)
  for (const item of [bench, cushion, petBed]) {
    assert.equal(item.placementSurface, "floor")
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(item.assetsByRotation, assets)
  }
})

test("Universal Core utility wave keeps nightstand tabletop and laundry floor semantics", () => {
  const nightstand = createUniversalNightstandAPilot(assets)
  const laundryBasket = createUniversalLaundryBasketAPilot(assets)

  assert.equal(nightstand.placementSurface, "floor")
  assert.equal(nightstand.surfaceSupports?.[0]?.surface, "tabletop")
  assert.equal(laundryBasket.placementSurface, "floor")
  assert.equal(laundryBasket.blocksMovement, true)
  for (const item of [nightstand, laundryBasket]) {
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(item.assetsByRotation, assets)
  }
})

test("Universal Core storage extension keeps vanity and shoe cabinet tops usable", () => {
  const vanity = createUniversalVanityTableAPilot(assets)
  const shoeCabinet = createUniversalShoeCabinetAPilot(assets)

  for (const item of [vanity, shoeCabinet]) {
    assert.equal(item.placementSurface, "floor")
    assert.equal(item.surfaceSupports?.[0]?.surface, "tabletop")
    assert.equal(item.blocksMovement, true)
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(item.assetsByRotation, assets)
  }
  assert.equal(vanity.category, "table")
  assert.equal(shoeCabinet.category, "misc")
})
