import assert from "node:assert/strict"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import { TEST_AVATAR_ITEM as FX, TEST_AVATAR_ITEM_RULES as FX_RULES, toAvatarLoadoutV2 } from "@blumi/domain"
import { projectOwnAvatarSelectionForRead } from "./avatarReadProjection"

// Review slots_1330 LOW-2: when V2 write is off after a one-piece dress was stored, a build that reads V2 but saves V1
// (beta-3 and earlier project the read with their own domain, which throws on an unknown dress) must still save. Its
// own avatar is read with the separates stored under the dress; the stored dress itself is kept by the server's V1
// write rule while the separates are untouched (avatarSelectionPersistence).
const STORED: CompleteAvatarSelection = {
  presetId: FX_RULES.starters.female.bodyId,
  revision: 4,
  loadout: { ...toAvatarLoadoutV2(FX_RULES.starters.female, FX_RULES), dressId: FX.onePieceDress }
}

test("without V2 write a client reads its own stored one-piece dress as the separates under it", () => {
  const read = projectOwnAvatarSelectionForRead(STORED, { avatar_loadout_v2_read: true, avatar_loadout_v2_write: false }, FX_RULES)
  assert.equal(read.loadout.schemaVersion, 2)
  assert.equal(read.loadout.schemaVersion === 2 ? read.loadout.dressId : "v1", null)
  assert.equal(read.loadout.topId, STORED.loadout.topId)
  assert.equal(read.loadout.bottomId, STORED.loadout.bottomId)
  assert.equal(STORED.loadout.schemaVersion === 2 ? STORED.loadout.dressId : null, FX.onePieceDress, "storage is never changed")
})

test("with V2 write the stored one-piece dress is read as is, and a V1 reader sees the separates", () => {
  const withWrite = projectOwnAvatarSelectionForRead(STORED, { avatar_loadout_v2_read: true, avatar_loadout_v2_write: true }, FX_RULES)
  assert.deepEqual(withWrite, STORED)
  const v1 = projectOwnAvatarSelectionForRead(STORED, { avatar_loadout_v2_read: false, avatar_loadout_v2_write: false }, FX_RULES)
  assert.equal(v1.loadout.schemaVersion, 1)
  assert.equal(v1.loadout.topId, STORED.loadout.topId)
})

test("a legacy paired dress is not a one-piece dress and stays in a V2 read without write", () => {
  const pair = { ...STORED, loadout: { ...STORED.loadout, dressId: FX.dressTop } }
  const read = projectOwnAvatarSelectionForRead(pair, { avatar_loadout_v2_read: true, avatar_loadout_v2_write: false }, FX_RULES)
  assert.equal(read.loadout.schemaVersion === 2 ? read.loadout.dressId : null, FX.dressTop)
})
