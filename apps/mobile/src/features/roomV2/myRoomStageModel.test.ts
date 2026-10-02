import assert from "node:assert/strict"
import test from "node:test"
import {
  getMyRoomStageAccessibilityValue,
  getMyRoomStageRevealMotion,
  getMyRoomStageVeilFrame,
  isMyRoomStageCovered
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

test("stage reveal is a short crossfade, kept under Reduce Motion because it does not move", () => {
  assert.ok(getMyRoomStageRevealMotion(false).durationMs > 0)
  assert.ok(getMyRoomStageRevealMotion(false).durationMs <= 250)
  assert.deepEqual(getMyRoomStageRevealMotion(true), getMyRoomStageRevealMotion(false))
})

test("stage veil covers instantly and crossfades out once uncovered", () => {
  for (const reduceMotion of [false, true]) {
    assert.deepEqual(getMyRoomStageVeilFrame({ covered: true, reduceMotion }), { opacity: 1, durationMs: 0 })
    const fadeOut = getMyRoomStageVeilFrame({ covered: false, reduceMotion })
    assert.equal(fadeOut.opacity, 0)
    assert.ok(fadeOut.durationMs > 0)
  }
})

test("the veil lifts only after the room's first paint, or after the fallback if no paint is reported", () => {
  assert.equal(isMyRoomStageCovered({ isLoading: true, shellPainted: true, paintFallbackElapsed: true }), true)
  assert.equal(isMyRoomStageCovered({ isLoading: false, shellPainted: false, paintFallbackElapsed: false }), true)
  assert.equal(isMyRoomStageCovered({ isLoading: false, shellPainted: true, paintFallbackElapsed: false }), false)
  assert.equal(isMyRoomStageCovered({ isLoading: false, shellPainted: false, paintFallbackElapsed: true }), false)
})
