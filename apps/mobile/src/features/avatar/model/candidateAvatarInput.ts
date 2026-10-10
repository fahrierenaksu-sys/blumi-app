import type { AvatarLoadoutCoercionHints } from "@blumi/domain"
import type { CandidateAvatarSnapshot } from "../../avatarV2/candidateAvatarSnapshot"

/**
 * What the 2.5D avatar components get for another person on Discover and in the match moment: the loadout exactly
 * as the server sent it, plus the hints the domain reads an old loadout with (plan 2.4). The components coerce it
 * themselves (total, draw-only), so nothing here validates or rewrites it.
 */
export interface CandidateAvatarInput {
  readonly loadout: unknown
  readonly hints: AvatarLoadoutCoercionHints
}

/**
 * A person without a stored selection (a demo or preview candidate) gets the body their preset names, in that
 * body's starter outfit: the old seeded preview outfits no longer exist.
 */
export function candidateAvatarInput(snapshot: CandidateAvatarSnapshot): CandidateAvatarInput {
  const selection = snapshot.avatarSelection
  return {
    loadout: selection?.loadout,
    hints: {
      presetId: selection?.presetId,
      gender: snapshot.bodyPreset === "male" ? "man" : undefined
    }
  }
}
