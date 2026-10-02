import assert from "node:assert/strict"
import test from "node:test"
import {
  getMyRoomStageAccessibilityValue,
  getMyRoomStageRevealMotion,
  getMyRoomStageVeilFrame
} from "./myRoomStageModel"

test("stage accessibility value counts saved items in English", () => {
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: 0, locale: "en" }), "No items yet")
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: 1, locale: "en" }), "1 item")
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: 3, locale: "en" }), "3 items")
})

test("stage accessibility value counts saved items in Turkish", () => {
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: 0, locale: "tr" }), "Henüz eşya yok")
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: 1, locale: "tr" }), "1 eşya")
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: 3, locale: "tr" }), "3 eşya")
})

test("stage accessibility value never exposes debug identifiers", () => {
  for (const locale of ["en", "tr"] as const) {
    const value = getMyRoomStageAccessibilityValue({ savedItemCount: 12, locale })
    assert.doesNotMatch(value, /shellId|savedItemCount|renderedFurnitureCount|room_v3_shell/)
  }
})

test("stage accessibility value treats invalid counts as an empty room", () => {
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: -2, locale: "en" }), "No items yet")
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: Number.NaN, locale: "tr" }), "Henüz eşya yok")
  assert.equal(getMyRoomStageAccessibilityValue({ savedItemCount: 2.7, locale: "en" }), "2 items")
})

test("stage reveal crossfades normally and is instant under Reduce Motion", () => {
  assert.ok(getMyRoomStageRevealMotion(false).durationMs > 0)
  assert.deepEqual(getMyRoomStageRevealMotion(true), { durationMs: 0 })
})

test("stage veil covers instantly while loading and fades out once the room is ready", () => {
  assert.deepEqual(getMyRoomStageVeilFrame({ isLoading: true, reduceMotion: false }), { opacity: 1, durationMs: 0 })
  assert.deepEqual(getMyRoomStageVeilFrame({ isLoading: true, reduceMotion: true }), { opacity: 1, durationMs: 0 })
  const fadeOut = getMyRoomStageVeilFrame({ isLoading: false, reduceMotion: false })
  assert.equal(fadeOut.opacity, 0)
  assert.ok(fadeOut.durationMs > 0)
  assert.deepEqual(getMyRoomStageVeilFrame({ isLoading: false, reduceMotion: true }), { opacity: 0, durationMs: 0 })
})
