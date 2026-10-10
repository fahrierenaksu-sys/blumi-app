import type { AvatarSelection } from "@blumi/contracts"
import type { AvatarLoadoutCoercionHints } from "@blumi/domain"

/**
 * What the 2.5D avatar components (`AvatarHero`, `AvatarStill`) are given for a person on a profile, Discover or match screen: the
 * loadout exactly as stored or received, plus the hints the domain reads a legacy loadout with (plan §2.4). The
 * components coerce it themselves (total, draw-only), so nothing here validates or rewrites a stored loadout.
 */
export interface AvatarInput {
  readonly loadout: unknown
  readonly hints: AvatarLoadoutCoercionHints
}

const NO_HINTS: AvatarLoadoutCoercionHints = Object.freeze({})

/** A person's stored selection (a profile, a Discover candidate, a match): its loadout, and its preset as the body hint. */
export function avatarInputFromSelection(
  selection: AvatarSelection | null | undefined,
  gender?: unknown
): AvatarInput {
  if (!selection) return { loadout: undefined, hints: gender === undefined ? NO_HINTS : { gender } }
  return { loadout: selection.loadout, hints: { presetId: selection.presetId, gender } }
}

/** A draft being built (the sign-in preview, ProfileSetup): partial, so the domain fills it with the body's starter. */
export function avatarInputFromDraft(
  draft: object | null | undefined,
  gender?: unknown
): AvatarInput {
  return { loadout: draft ?? undefined, hints: gender === undefined ? NO_HINTS : { gender } }
}
