import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  STARTER_ROOM_BED_DEFAULT_POINT,
  STARTER_ROOM_BED_ITEM_ID,
  createStarterRoomDecor,
  hasPlacedStarterBed,
  placeStarterBed,
  rotateStarterBed
} from "./roomStarterModel"

test("onboarding starts with one standard empty room", () => {
  const decor = createStarterRoomDecor("room-shell")

  assert.equal(decor.roomShellId, "room-shell")
  assert.deepEqual(decor.placedItems, [])
})

test("the user can place the granted bed at the chosen point", () => {
  const empty = createStarterRoomDecor("room-shell")
  const decor = placeStarterBed(empty, { x: 0.62, y: 0.72 })

  assert.deepEqual(decor.placedItems, [{
    instanceId: "starter-room-bed",
    itemId: STARTER_ROOM_BED_ITEM_ID,
    x: 0.62,
    y: 0.72,
    rotation: "front"
  }])
  assert.equal(hasPlacedStarterBed(decor), true)
  assert.deepEqual(empty.placedItems, [])
})

test("the starter bed has a deterministic tap-to-place point", () => {
  assert.deepEqual(STARTER_ROOM_BED_DEFAULT_POINT, { x: 0.52, y: 0.7 })
})

test("starter room decor returns fresh immutable placement objects", () => {
  const first = createStarterRoomDecor("room-shell")
  const second = createStarterRoomDecor("room-shell")

  assert.notEqual(first, second)
  assert.notEqual(first.placedItems, second.placedItems)
  assert.deepEqual(first.placedItems, [])
  assert.deepEqual(second.placedItems, [])
})

test("the starter bed rotates clockwise through every authored direction", () => {
  const placed = placeStarterBed(
    createStarterRoomDecor("room-shell"),
    STARTER_ROOM_BED_DEFAULT_POINT
  )

  const right = rotateStarterBed(placed)
  const back = rotateStarterBed(right)
  const left = rotateStarterBed(back)
  const front = rotateStarterBed(left)

  assert.equal(right.placedItems[0]?.rotation, "right")
  assert.equal(back.placedItems[0]?.rotation, "back")
  assert.equal(left.placedItems[0]?.rotation, "left")
  assert.equal(front.placedItems[0]?.rotation, "front")
  assert.equal(placed.placedItems[0]?.rotation, "front")
})

test("rotating the starter bed preserves unrelated room items", () => {
  const placed = placeStarterBed(
    createStarterRoomDecor("room-shell"),
    STARTER_ROOM_BED_DEFAULT_POINT
  )
  const table = {
    instanceId: "table-1",
    itemId: "room_v2_table",
    x: 0.4,
    y: 0.6,
    rotation: "front" as const
  }
  const rotated = rotateStarterBed({
    ...placed,
    placedItems: [table, ...placed.placedItems]
  })

  assert.deepEqual(rotated.placedItems[0], table)
  assert.equal(rotated.placedItems[1]?.rotation, "right")
  assert.notEqual(rotated.placedItems[0], table)
})

test("the starter bed has a dedicated runtime asset for every rotation", () => {
  const catalogSource = readFileSync(
    resolve(process.cwd(), "src/features/roomV2/roomV2.mock.ts"),
    "utf8"
  )
  assert.match(catalogSource, /rotationPolicy: "directional_assets_required"/)
  assert.match(catalogSource, /front: roomV2Assets\.furniture\.modeledPinkCloudBedFrontV29/)
  assert.match(catalogSource, /right: roomV2Assets\.furniture\.modeledPinkCloudBedRightV29/)
  assert.match(catalogSource, /back: roomV2Assets\.furniture\.modeledPinkCloudBedBackV29/)
  assert.match(catalogSource, /left: roomV2Assets\.furniture\.modeledPinkCloudBedLeftV29/)
  for (const rotation of ["front", "right", "back", "left"]) {
    assert.equal(
      existsSync(resolve(
        process.cwd(),
        `src/features/roomV2/assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_${rotation}_body_v29.png`
      )),
      true,
      `missing ${rotation} starter bed runtime asset`
    )
    assert.equal(
      existsSync(resolve(
        process.cwd(),
        `src/features/roomV2/assets/runtime/starter-modeled-pink-cloud-bed-v29/pink_cloud_bed_${rotation}_contact_shadow_v29.png`
      )),
      true,
      `missing ${rotation} starter bed contact shadow`
    )
  }
})

test("the modeled starter bed exposes body, contact shadow and thumbnail through one visual contract", () => {
  const catalogSource = readFileSync(
    resolve(process.cwd(), "src/features/roomV2/roomV2.mock.ts"),
    "utf8"
  )

  assert.match(catalogSource, /visualContract:\s*createModeledStarterBedVisualContract\(\)/)
  assert.match(catalogSource, /physicalSizeCm:\s*\{\s*width:\s*165,\s*depth:\s*210,\s*height:\s*105\s*\}/)
})

test("starter readiness requires exactly one placed bed", () => {
  const empty = createStarterRoomDecor("room-shell")
  const placed = placeStarterBed(empty, { x: 0.62, y: 0.72 })

  assert.equal(hasPlacedStarterBed(empty), false)
  assert.equal(hasPlacedStarterBed(placed), true)
  assert.equal(hasPlacedStarterBed({
    ...placed,
    placedItems: [...placed.placedItems, { ...placed.placedItems[0], instanceId: "duplicate" }]
  }), false)
})

test("room onboarding uses one pictured quest surface that places on tap and drags without floor guide rings", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/screens/RoomSetupScreen.tsx"),
    "utf8"
  )

  assert.match(source, /starterBed\.asset\.source/)
  assert.match(source, /PanResponder\.create/)
  assert.match(source, /placeBedAtPoint\(STARTER_ROOM_BED_DEFAULT_POINT\)/)
  assert.match(source, /starterItemLiquidFrame/)
  assert.match(source, /headerTitle="İlk odan"/)
  assert.match(source, /Yatak yerleştirildi/)
  assert.match(source, /immersiveBottomSheet/)
  assert.match(source, /taskCardTone="sheet"/)
  assert.match(source, /Basılı tutup sürükle/)
  assert.match(source, /onItemLongPressMove=\{handlePlacedBedLongPressMove\}/)
  assert.match(source, /bedToolbarHighlight/)
  assert.match(source, /width: 84/)
  assert.match(source, /height: 36/)
  assert.match(source, /name="move" size=\{16\}/)
  assert.match(source, /name="refresh" size=\{16\}/)
  assert.match(source, /Pembe Bulut Yatağı çevir/)
  assert.match(source, /rotateStarterBed/)
  assert.match(source, /getRoomSetupTaskCardMinHeight/)
  assert.match(source, /roomFirstSummary/)
  assert.match(source, /roomFirstStatus/)
  assert.match(source, /placementCompleteCard:\s*\{[^}]*justifyContent: "center"/)
  assert.match(source, /placementCompleteCard:\s*\{[^}]*flexDirection: "row"/)
  assert.match(source, /placementCompleteCard:\s*\{[^}]*minHeight: 62/)
  assert.match(source, /placementCompleteText:\s*\{[^}]*textAlign: "center"/)
  assert.doesNotMatch(source, /starterItemLiquidHighlight|showPlacementGuides|RoomSetupProgressRail/)
})

test("room renderer exposes continuous touch movement for edit-mode furniture", () => {
  const renderer = readFileSync(
    resolve(process.cwd(), "src/features/roomV2/components/RoomRenderer2D.tsx"),
    "utf8"
  )

  assert.match(renderer, /onItemLongPressMove\?:/)
  assert.match(renderer, /onLongPressMove\?:/)
  assert.match(renderer, /onResponderMove=\{\(event\) =>/)
  assert.match(renderer, /onLongPressMove\(\{[\s\S]*pageX:/)
})
