import assert from "node:assert/strict"
import test from "node:test"
import {
  beginAvatarEquipSave,
  createAvatarEquipLifecycle,
  invalidateAvatarEquipSaves,
  markAvatarEquipLifecycleUnmounted,
  markAvatarLocallyCustomized,
  mayCommitAvatarEquipSave
} from "./avatarEquipLifecycle"

test("an external avatar reset invalidates an older save completion", () => {
  const start = beginAvatarEquipSave(createAvatarEquipLifecycle())

  assert.equal(
    mayCommitAvatarEquipSave(start.lifecycle, start.requestGeneration),
    true
  )
  const resetLifecycle = invalidateAvatarEquipSaves(start.lifecycle)
  assert.equal(
    mayCommitAvatarEquipSave(resetLifecycle, start.requestGeneration),
    false
  )
})

test("an unmounted provider rejects every in-flight save completion", () => {
  const start = beginAvatarEquipSave(createAvatarEquipLifecycle())

  const unmountedLifecycle = markAvatarEquipLifecycleUnmounted(start.lifecycle)
  assert.equal(
    mayCommitAvatarEquipSave(unmountedLifecycle, start.requestGeneration),
    false
  )
})

test("a local equip marks the avatar as customized", () => {
  assert.equal(markAvatarLocallyCustomized(), true)
})
