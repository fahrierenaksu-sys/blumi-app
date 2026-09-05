import assert from "node:assert/strict"
import test from "node:test"
import { getRoomV2AvatarAccessibilityValue } from "./roomV2Accessibility"

test("room avatar accessibility reports the exact seated product and direction", () => {
  assert.equal(
    getRoomV2AvatarAccessibilityValue({
      state: "sitting",
      direction: "back",
      seatedFurnitureName: "Cloud Loveseat"
    }),
    "Sitting on Cloud Loveseat, back view"
  )
})

test("room avatar accessibility reports non-seated motion without inventing furniture", () => {
  assert.equal(
    getRoomV2AvatarAccessibilityValue({
      state: "idle",
      direction: "front"
    }),
    "Standing, front view"
  )
  assert.equal(
    getRoomV2AvatarAccessibilityValue({
      state: "walking",
      direction: "left"
    }),
    "Walking, left view"
  )
})
