import assert from "node:assert/strict"
import test from "node:test"
import { getChatDeliveryTickVisual } from "./chatDeliveryTickModel"

test("my message shows a clock, one tick, two muted ticks, then two coloured ticks", () => {
  assert.deepEqual(getChatDeliveryTickVisual("sending"), { icon: "time-outline", colorToken: "textMuted" })
  assert.deepEqual(getChatDeliveryTickVisual("sent"), { icon: "checkmark", colorToken: "textMuted" })
  assert.deepEqual(getChatDeliveryTickVisual("delivered"), { icon: "checkmark-done", colorToken: "textMuted" })
  assert.deepEqual(getChatDeliveryTickVisual("read"), { icon: "checkmark-done", colorToken: "primaryDeep" })
})

test("a failed message shows its retry row instead of a tick", () => {
  assert.equal(getChatDeliveryTickVisual("failed"), null)
})
