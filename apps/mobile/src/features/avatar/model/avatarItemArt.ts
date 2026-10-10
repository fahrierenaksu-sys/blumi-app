import { DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { AvatarRigId } from "./avatarRoomContract"

/** The worn slots the rigs draw, in painter's slot order (shoes under bottom under top under hair). */
export const AVATAR_ART_SLOTS = ["shoes", "bottom", "top", "hair"] as const
export type AvatarArtSlot = (typeof AVATAR_ART_SLOTS)[number]

/** The stored body the boy rig draws; every other body is drawn by the girl rig. */
export const AVATAR_BOY_BODY_ID = DEFAULT_MALE_AVATAR_LOADOUT.bodyId

/** Which rig draws this body (read only; the stored profile is never changed). */
export function avatarRigForBody(bodyId: string): AvatarRigId {
  return bodyId === AVATAR_BOY_BODY_ID ? "male" : "female"
}

/**
 * Canonical item ID → the rig item that draws it, per body. IDs never change (AGENTS.md). An item enters here in
 * the same commit as its rig art and its stills (plan §5.5). The boy has no items yet: he shows his drawn base.
 */
export const AVATAR_ITEM_ART: Readonly<Record<AvatarRigId, Readonly<Record<string, string>>>> = {
  female: {
    avatar_v2_hair_ink_pageboy_star: "hair_ink_pageboy_star",
    avatar_v2_top_coral_wave_polo: "top_coral_wave_polo",
    avatar_v2_bottom_coral_wave_pants: "bottom_coral_wave_pants",
    avatar_v2_shoes_mint_ribbon_court_sneakers: "shoes_mint_ribbon_court_sneakers"
  },
  male: {}
}

/**
 * Draw-only fallback (plan §2.4, review R3): a worn slot whose item has no rig art for that body is drawn as this
 * body's RIG starter piece. It never changes the stored or validated loadout and never affects ownership.
 * The boy shows his base until his outfit-2 pieces and side-part hair land.
 */
export const AVATAR_RIG_STARTER: Readonly<Record<AvatarRigId, Readonly<Partial<Record<AvatarArtSlot, string>>>>> = {
  female: {
    hair: "avatar_v2_hair_ink_pageboy_star",
    top: "avatar_v2_top_coral_wave_polo",
    bottom: "avatar_v2_bottom_coral_wave_pants",
    shoes: "avatar_v2_shoes_mint_ribbon_court_sneakers"
  },
  male: {}
}

/** Every (body, canonical item) pair that has rig art: what the stills must cover (plan §10.2, review R4). */
export function listAvatarItemArt(): { rig: AvatarRigId; itemId: string; rigItemId: string }[] {
  return (Object.keys(AVATAR_ITEM_ART) as AvatarRigId[]).flatMap((rig) =>
    Object.entries(AVATAR_ITEM_ART[rig]).map(([itemId, rigItemId]) => ({ rig, itemId, rigItemId })))
}
