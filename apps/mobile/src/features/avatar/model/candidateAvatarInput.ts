import type { CandidateAvatarSnapshot } from "../../avatarV2/candidateAvatarSnapshot"
import { avatarInputFromSelection, type AvatarInput } from "./avatarInput"

/**
 * What the 2.5D avatar components get for another person on Discover and in the match moment. A person without a
 * stored selection (a demo or preview candidate) gets the body their preset names, in that body's starter outfit:
 * the old seeded preview outfits no longer exist.
 */
export function candidateAvatarInput(snapshot: CandidateAvatarSnapshot): AvatarInput {
  return avatarInputFromSelection(snapshot.avatarSelection, snapshot.bodyPreset === "male" ? "man" : undefined)
}
