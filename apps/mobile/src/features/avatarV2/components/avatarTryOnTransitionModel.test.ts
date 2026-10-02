import assert from "node:assert/strict"
import test from "node:test"
import { getAvatarTryOnKey, resolveAvatarTryOnSwap } from "./avatarTryOnTransitionModel"

test("a new look crossfades and hops; Reduce Motion keeps only the crossfade", () => {
  assert.deepEqual(resolveAvatarTryOnSwap({ previousKey: "a", nextKey: "b", reduceMotion: false }), { crossfade: true, hop: true })
  assert.deepEqual(resolveAvatarTryOnSwap({ previousKey: "a", nextKey: "b", reduceMotion: true }), { crossfade: true, hop: false })
})

test("the first look and an unchanged look do not animate", () => {
  assert.deepEqual(resolveAvatarTryOnSwap({ previousKey: null, nextKey: "a", reduceMotion: false }), { crossfade: false, hop: false })
  assert.deepEqual(resolveAvatarTryOnSwap({ previousKey: "a", nextKey: "a", reduceMotion: false }), { crossfade: false, hop: false })
})

test("the look key ignores object identity and key order but sees every worn piece", () => {
  const look = { top: "tee", bottom: "skirt", accessories: [{ id: "glasses", slot: "face" }] }
  const sameLookNewObject = { accessories: [{ slot: "face", id: "glasses" }], bottom: "skirt", top: "tee" }
  assert.equal(getAvatarTryOnKey(look), getAvatarTryOnKey(sameLookNewObject))
  assert.notEqual(getAvatarTryOnKey(look), getAvatarTryOnKey({ ...look, top: "polo" }))
  assert.notEqual(getAvatarTryOnKey(look), getAvatarTryOnKey({ ...look, accessories: [] }))
  assert.notEqual(getAvatarTryOnKey([{ id: "a" }]), getAvatarTryOnKey([{ id: "b" }]))
})
