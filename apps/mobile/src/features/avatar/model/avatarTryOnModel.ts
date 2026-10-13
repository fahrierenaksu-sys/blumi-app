import {
  AVATAR_STILL_MANIFEST,
  AVATAR_STILL_SLOT_KEYS,
  avatarStillDrawnItems,
  avatarStillRigForBody,
  coerceAvatarLoadout,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  type AvatarItemRules,
  type AvatarLoadoutCoercionHints,
  type AvatarStillManifest
} from "@blumi/domain"

const FACE_KEYS = ["faceId", "eyesId", "noseId", "mouthId"] as const

/**
 * Which drawing a try-on surface (Wardrobe stage, Shop preview, avatar setup) uses for a look:
 * - `showcase`: the 2.5D figure (`AvatarShowcase`: the front stack, or the whole 3/4 still while front art is missing);
 * - `legacy`: the look wears a piece the 2.5D art does not have yet (every old item until X15, and the boy until his
 *   pieces land), so the whole figure keeps its old drawing. The 2.5D resolvers would draw such a piece as the body's
 *   starter, which would show the person something other than what they are trying on (or buying).
 */
export type AvatarTryOnRenderer = "showcase" | "legacy"

/**
 * Pure and total: never throws and never changes the look. Drawing only; ownership and the saved loadout stay with
 * the server.
 */
export function avatarTryOnRenderer(
  look: unknown,
  options: {
    readonly hints?: AvatarLoadoutCoercionHints
    readonly manifest?: AvatarStillManifest
    /** Test seam: the item rules coercion reads. The default is the live catalog. */
    readonly rules?: AvatarItemRules
  } = {}
): AvatarTryOnRenderer {
  const manifest = options.manifest ?? AVATAR_STILL_MANIFEST
  const loadout = coerceAvatarLoadout(look, options.hints ?? {}, options.rules)
  // the 2.5D resolvers ignore a dress (its pair is drawn per slot), so a worn dress is not truthful there yet
  if ("dressId" in loadout && loadout.dressId) return "legacy"
  const rig = avatarStillRigForBody(loadout.bodyId)
  // each rig has one drawn face: another face, eyes, nose or mouth is only drawn by the old renderer
  const bodyFace = rig === "male" ? DEFAULT_MALE_AVATAR_LOADOUT : DEFAULT_FEMALE_AVATAR_LOADOUT
  if (FACE_KEYS.some((key) => loadout[key] !== bodyFace[key])) return "legacy"
  const body = manifest.bodies[rig]
  const drawn = avatarStillDrawnItems(body, loadout)
  for (const [slot, key] of AVATAR_STILL_SLOT_KEYS) {
    const worn = loadout[key]
    if (worn && drawn.get(slot) !== worn) return "legacy"
  }
  return "showcase"
}
