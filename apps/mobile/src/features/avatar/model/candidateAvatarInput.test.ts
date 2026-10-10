import assert from "node:assert/strict"
import test from "node:test"
import { coerceAvatarLoadout, DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT, resolveAvatarStillLayers } from "@blumi/domain"
import type { AvatarSelection } from "@blumi/contracts"
import type { CandidateAvatarSnapshot } from "../../avatarV2/candidateAvatarSnapshot"
import { candidateAvatarInput } from "./candidateAvatarInput"

/** A snapshot as `createCandidateAvatarSnapshot` builds it (that module pulls in image assets, so not imported here). */
function createCandidateAvatarSnapshot(input: { bodyPreset?: "female" | "male"; avatarSelection?: AvatarSelection }): CandidateAvatarSnapshot {
  return {
    kind: "candidate_avatar_snapshot",
    userId: "u-1",
    displayName: "Defne",
    source: input.avatarSelection ? "remote_candidate_avatar" : "preview_fallback",
    previewSeed: "u-1",
    label: "Blumi avatar",
    bodyPreset: input.bodyPreset ?? "female",
    ...(input.avatarSelection ? { avatarSelection: input.avatarSelection } : {})
  }
}
const bodyOf = (input: ReturnType<typeof candidateAvatarInput>) => coerceAvatarLoadout(input.loadout, input.hints).bodyId

test("a candidate with no stored avatar draws the starter of the body its preset names", () => {
  assert.equal(bodyOf(candidateAvatarInput(createCandidateAvatarSnapshot({}))), DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId)
  assert.equal(
    bodyOf(candidateAvatarInput(createCandidateAvatarSnapshot({ bodyPreset: "male" }))),
    DEFAULT_MALE_AVATAR_LOADOUT.bodyId
  )
})

test("a stored loadout is passed through untouched, even with item IDs this build no longer knows", () => {
  const stored = { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: "avatar_v2_top_long_gone", hairId: "avatar_v2_hair_long_gone" }
  const snapshot = createCandidateAvatarSnapshot({
    bodyPreset: "male",
    avatarSelection: { presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId, loadout: stored as never, revision: 3 }
  })
  const input = candidateAvatarInput(snapshot)
  assert.deepEqual(input.loadout, snapshot.avatarSelection?.loadout)
  const still = resolveAvatarStillLayers(input.loadout, "full", { hints: input.hints })
  assert.equal(still.rig, "male")
  assert.ok(still.layers.length > 0, "unknown items fall back to the body's starter pieces instead of throwing")
})
