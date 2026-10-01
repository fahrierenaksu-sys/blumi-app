import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { resolveLiveParticipantIdentity } from "./liveParticipantIdentityModel"

const avatar = (revision: number) => ({ presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId, revision,
  loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds] } })

test("open profile, room and match projections use a later name and saved outfit", () => {
  const current = resolveLiveParticipantIdentity({ userId: "partner", displayName: "Eren", avatar: avatar(1) },
    { userId: "partner", displayName: "Irmak", avatar: avatar(2), profileUpdatedAt: "2026-10-01T12:00:00Z" })
  assert.equal(current.displayName, "Irmak")
  assert.equal(current.avatar?.revision, 2)
  assert.equal(current.profileUpdatedAt, "2026-10-01T12:00:00Z")
})

test("a newer route snapshot keeps its name and outfit against stale cached metadata", () => {
  const current = resolveLiveParticipantIdentity({ userId: "partner", displayName: "Irmak", avatar: avatar(3), profileUpdatedAt: "2026-10-01T12:00:00Z" },
    { userId: "partner", displayName: "Eren", avatar: avatar(2), profileUpdatedAt: "2026-10-01T11:00:00Z" })
  assert.equal(current.displayName, "Irmak")
  assert.equal(current.avatar?.revision, 3)
})

test("missing metadata and another user's event cannot replace the target", () => {
  const fallback = { userId: "partner", displayName: "Irmak", avatar: avatar(3) }
  assert.equal(resolveLiveParticipantIdentity(fallback), fallback)
  assert.equal(resolveLiveParticipantIdentity(fallback, { userId: "other", displayName: "Other" }), fallback)
  const renamed = resolveLiveParticipantIdentity(fallback, { userId: "partner", displayName: "Irmakkk" })
  assert.equal(renamed.displayName, "Irmakkk")
  assert.equal(renamed.avatar?.revision, 3)
})
