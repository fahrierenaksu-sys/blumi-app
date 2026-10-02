import assert from "node:assert/strict"
import test from "node:test"
import { createMiniRoomKeyboardPreference, MINI_ROOM_KEYBOARD_PREFERENCE_KEY } from "./miniRoomKeyboardPreference"

test("MiniRoom suggestions default off and only restore an explicit true", async () => {
  for (const raw of [null, "false", "invalid", "1", "true"]) {
    const preference = createMiniRoomKeyboardPreference({
      async getItem(key) { assert.equal(key, MINI_ROOM_KEYBOARD_PREFERENCE_KEY); return raw },
      async setItem() {}
    })
    assert.equal(preference.getSnapshot(), false)
    await preference.hydrate()
    assert.equal(preference.getSnapshot(), raw === "true")
  }
})

test("a late restore cannot undo a choice made while storage is loading", async () => {
  let complete!: (value: string | null) => void
  const preference = createMiniRoomKeyboardPreference({
    getItem: () => new Promise((resolve) => { complete = resolve }),
    async setItem() {}
  })
  const restoring = preference.hydrate()
  await preference.setEnabled(true)
  complete("false")
  await restoring
  assert.equal(preference.getSnapshot(), true)
})

test("rapid changes persist in order and survive a new controller", async () => {
  let raw: string | null = null
  const writes: string[] = []
  const storage = {
    async getItem() { return raw },
    async setItem(key: string, value: string) {
      assert.equal(key, MINI_ROOM_KEYBOARD_PREFERENCE_KEY)
      await Promise.resolve()
      writes.push(value); raw = value
    }
  }
  const preference = createMiniRoomKeyboardPreference(storage)
  await preference.hydrate()
  let updates = 0
  const unsubscribe = preference.subscribe(() => { updates += 1 })
  const first = preference.setEnabled(true)
  const last = preference.setEnabled(false)
  await Promise.all([first, last])
  assert.deepEqual(writes, ["true", "false"])
  assert.equal(updates, 2)
  unsubscribe()
  const restored = createMiniRoomKeyboardPreference(storage)
  await restored.hydrate()
  assert.equal(restored.getSnapshot(), false)
})

test("a storage failure does not prevent later changes", async () => {
  let attempts = 0
  const preference = createMiniRoomKeyboardPreference({
    async getItem() { throw new Error("unavailable") },
    async setItem() { if (++attempts === 1) throw new Error("unavailable") }
  })
  await preference.hydrate()
  await preference.setEnabled(true)
  await preference.setEnabled(false)
  assert.equal(attempts, 2)
  assert.equal(preference.getSnapshot(), false)
})
