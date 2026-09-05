import assert from "node:assert/strict"
import test from "node:test"
import {
  loadRoomStudioQaDecor,
  saveRoomStudioQaDecor,
  type RoomStudioStorage
} from "./roomStudioPersistence"
import type { UserRoomDecor } from "../roomV2/roomV2.types"

const DECOR: UserRoomDecor = {
  schemaVersion: 3,
  geometryVersion: "home-studio-scene-modules-v1",
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: [{
    instanceId: "studio-sleep",
    itemId: "room_studio_sleep_module_v1",
    x: 0.39,
    y: 0.67,
    rotation: "front",
    placementSurface: "floor",
    geometryVersion: "home-studio-scene-modules-v1"
  }]
}

function memoryStorage(): RoomStudioStorage & { value: string | null } {
  return {
    value: null,
    async getItem() { return this.value },
    async setItem(_key, value) { this.value = value }
  }
}

test("QA persistence uses a namespaced key and round-trips exact decor", async () => {
  const storage = memoryStorage()
  await saveRoomStudioQaDecor(storage, "qa-user", DECOR)
  assert.match(storage.value ?? "", /room_studio_sleep_module_v1/)
  assert.deepEqual(await loadRoomStudioQaDecor(storage, "qa-user"), DECOR)
})

test("invalid or missing QA data returns no decor and never throws", async () => {
  const storage = memoryStorage()
  assert.equal(await loadRoomStudioQaDecor(storage, "missing"), undefined)
  storage.value = "not-json"
  assert.equal(await loadRoomStudioQaDecor(storage, "qa-user"), undefined)
})
