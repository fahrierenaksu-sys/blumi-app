import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomV2AvatarAccessibilityValue,
  getRoomV2ItemAccessibility,
  getRoomV2StageAccessibilityLabel,
  shouldRoomV2ItemReceiveTap
} from "./roomV2Accessibility"

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

test("ROOM-01: the avatar takes taps in an interactive room (wave chain), never in the editor", () => {
  assert.equal(shouldRoomV2ItemReceiveTap({ kind: "avatar", mode: "interact" }), true)
  assert.equal(shouldRoomV2ItemReceiveTap({ kind: "avatar", mode: "edit" }), false)
  assert.equal(shouldRoomV2ItemReceiveTap({ kind: "furniture", mode: "interact", interactionType: "seat" }), true)
  assert.equal(shouldRoomV2ItemReceiveTap({ kind: "furniture", mode: "edit" }), true)
})

test("a lived-in room's table or plant never swallows a tap on the floor around it", () => {
  assert.equal(shouldRoomV2ItemReceiveTap({ kind: "furniture", mode: "interact", interactionType: "none" }), false)
  assert.equal(shouldRoomV2ItemReceiveTap({ kind: "furniture", mode: "interact" }), false)
  assert.equal(shouldRoomV2ItemReceiveTap({ kind: "furniture", mode: "edit", interactionType: "none" }), true)
})

test("ROOM-14: room VoiceOver text follows the app language", () => {
  assert.equal(
    getRoomV2AvatarAccessibilityValue({ state: "sitting", direction: "back", seatedFurnitureName: "Bulut Koltuk" }, "tr"),
    "Bulut Koltuk üzerinde oturuyor, arka görünüm"
  )
  assert.equal(getRoomV2AvatarAccessibilityValue({ state: "waving", direction: "left" }, "tr"), "El sallıyor, sol görünüm")
  assert.deepEqual(
    getRoomV2ItemAccessibility({ kind: "furniture", name: "Bulut Koltuk", interactionType: "seat", mode: "interact", locale: "tr" }),
    { label: "Bulut Koltuk üzerine otur", hint: undefined }
  )
  assert.deepEqual(
    getRoomV2ItemAccessibility({ kind: "furniture", name: "Lamp", interactionType: "decor", mode: "interact", locale: "en" }),
    { label: "Interact with Lamp", hint: undefined }
  )
  assert.deepEqual(
    getRoomV2ItemAccessibility({ kind: "furniture", name: "Lamp", mode: "edit", locale: "tr" }),
    { label: "Lamp: taşımak, döndürmek veya kaldırmak için seç", hint: undefined }
  )
  assert.deepEqual(
    getRoomV2ItemAccessibility({ kind: "avatar", name: undefined, mode: "interact", locale: "tr", tappable: true }),
    { label: "Odadaki avatarın", hint: "El sallaması için dokun" }
  )
  assert.deepEqual(
    getRoomV2ItemAccessibility({ kind: "avatar", name: "Ada", mode: "interact", locale: "en", tappable: false }),
    { label: "Ada", hint: undefined }
  )
  assert.equal(getRoomV2StageAccessibilityLabel("tr"), "Odada yürü")
  assert.equal(getRoomV2StageAccessibilityLabel("en"), "Walk in room")
})
