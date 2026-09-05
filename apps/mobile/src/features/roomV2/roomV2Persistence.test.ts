import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomV2StorageKey,
  readStoredRoomV2Decor
} from "./roomV2Persistence"

test("room decor persistence is isolated by account", () => {
  assert.equal(getRoomV2StorageKey(undefined), null)
  assert.equal(
    getRoomV2StorageKey("user/a"),
    "@blumi/room_v2/user_room_decor:v2:user%2Fa"
  )
  assert.notEqual(getRoomV2StorageKey("user-a"), getRoomV2StorageKey("user-b"))
})

test("room V2 QA storage is isolated from the production namespace", () => {
  const productionKey = getRoomV2StorageKey("user-a", "production")
  const qaKey = getRoomV2StorageKey("user-a", "qa")
  assert.ok(productionKey)
  assert.ok(qaKey)
  assert.notEqual(productionKey, qaKey)
  assert.match(qaKey!, /:qa$/)
})

test("room storage distinguishes missing data from malformed user data", () => {
  assert.deepEqual(readStoredRoomV2Decor(null), { status: "missing" })
  assert.deepEqual(readStoredRoomV2Decor("not-json"), { status: "invalid" })
  assert.deepEqual(readStoredRoomV2Decor('{"roomShellId":4}'), { status: "invalid" })
  assert.deepEqual(
    readStoredRoomV2Decor('{"roomShellId":"cozy","placedItems":[]}'),
    { status: "ready", decor: { roomShellId: "cozy", placedItems: [] } }
  )
  assert.deepEqual(
    readStoredRoomV2Decor(
      '{"schemaVersion":3,"geometryVersion":"blumi_room_v3_2026","migration":{"fromSchemaVersion":2,"sourceShellId":"legacy"},"roomShellId":"cozy","placedItems":[]}'
    ),
    {
      status: "ready",
      decor: {
        schemaVersion: 3,
        geometryVersion: "blumi_room_v3_2026",
        migration: {
          fromSchemaVersion: 2,
          sourceShellId: "legacy"
        },
        roomShellId: "cozy",
        placedItems: []
      }
    }
  )
  assert.deepEqual(
    readStoredRoomV2Decor('{"schemaVersion":"3","roomShellId":"cozy","placedItems":[]}'),
    { status: "invalid" }
  )
  assert.deepEqual(
    readStoredRoomV2Decor('{"geometryVersion":3,"roomShellId":"cozy","placedItems":[]}'),
    { status: "invalid" }
  )
})

test("room storage rejects a persisted placement with an unknown rotation", () => {
  assert.deepEqual(
    readStoredRoomV2Decor(
      '{"roomShellId":"cozy","placedItems":[{"instanceId":"lamp-1","itemId":"lamp","x":0.5,"y":0.72,"rotation":"diagonal"}]}'
    ),
    { status: "invalid" }
  )
})

test("room storage preserves geometry, surface, and parent-local placement metadata", () => {
  const result = readStoredRoomV2Decor(
    '{"roomShellId":"cozy","placedItems":[{"instanceId":"plant-1","itemId":"plant","x":0.5,"y":0.36,"rotation":"right","geometryVersion":"room-furniture-vnext-7","placementSurface":"tabletop","supportInstanceId":"table-1","supportParentRotation":"front","supportLocalPosition":{"x":0.42,"y":0.18}}]}'
  )
  assert.deepEqual(result, {
    status: "ready",
    decor: {
      roomShellId: "cozy",
      placedItems: [{
        instanceId: "plant-1",
        itemId: "plant",
        x: 0.5,
        y: 0.36,
        rotation: "right",
        geometryVersion: "room-furniture-vnext-7",
        placementSurface: "tabletop",
        supportInstanceId: "table-1",
        supportParentRotation: "front",
        supportLocalPosition: { x: 0.42, y: 0.18 }
      }]
    }
  })
})

test("room storage normalizes known legacy QA candidate IDs on reopen", () => {
  const result = readStoredRoomV2Decor(
    '{"roomShellId":"cozy","placedItems":[{"instanceId":"bed-1","itemId":"room_v2_cozy_bed","x":0.5,"y":0.72,"rotation":"front","geometryVersion":"room-furniture-vnext-25","placementSurface":"floor"},{"instanceId":"chair-1","itemId":"room_vnext_lounge_chair","x":0.61,"y":0.74,"rotation":"left","geometryVersion":"room-furniture-vnext-17","placementSurface":"floor"},{"instanceId":"lamp-1","itemId":"room_vnext_lamp","x":0.72,"y":0.68,"rotation":"right","geometryVersion":"room-furniture-vnext-17","placementSurface":"floor"}]}'
  )

  assert.deepEqual(result, {
    status: "ready",
    decor: {
      roomShellId: "cozy",
      placedItems: [{
        instanceId: "bed-1",
        itemId: "universal_cloud_bed_b",
        x: 0.5,
        y: 0.72,
        rotation: "front",
        geometryVersion: "room-furniture-vnext-25",
        placementSurface: "floor"
      }, {
        instanceId: "chair-1",
        itemId: "universal_lounge_armchair_a",
        x: 0.61,
        y: 0.74,
        rotation: "left",
        geometryVersion: "room-furniture-vnext-17",
        placementSurface: "floor"
      }, {
        instanceId: "lamp-1",
        itemId: "universal_orbit_floor_lamp_a",
        x: 0.72,
        y: 0.68,
        rotation: "right",
        geometryVersion: "room-furniture-vnext-17",
        placementSurface: "floor"
      }]
    }
  })
})

test("room storage fails closed for malformed parent-local placement metadata", () => {
  assert.deepEqual(readStoredRoomV2Decor(
    '{"roomShellId":"cozy","placedItems":[{"instanceId":"plant-1","itemId":"plant","x":0.5,"y":0.36,"rotation":"front","placementSurface":"floor","supportLocalPosition":{"x":"0.42","y":0.18}}]}'
  ), { status: "invalid" })
})

test("room storage rejects a blank persisted shell selection", () => {
  assert.deepEqual(
    readStoredRoomV2Decor('{"roomShellId":"  ","placedItems":[]}'),
    { status: "invalid" }
  )
})
