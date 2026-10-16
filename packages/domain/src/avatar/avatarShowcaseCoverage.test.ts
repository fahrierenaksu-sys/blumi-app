import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_STILL_MANIFEST, type AvatarStillRigId } from "./avatarStills";

/**
 * Ratchet: every item with baked rig art needs a front (showcase) layer, so the figure outside the room is never the
 * 3/4 fallback (ITEM_SYNC_RULES). Items listed here are known debt: they were ported before the showcase view existed.
 * The list may only shrink. When an item gets its front layer, this test fails until its entry is removed. A new item
 * must ship with its front layer; adding an entry needs a reason in the same commit.
 *
 * 2026-10-13: the girl starter (factory o_g1fix8) and the boy's 26 pieces have front layers, so their entries are
 * gone. The owner approved those front looks on 2026-10-13 21:22 (OWNER_DECISIONS), so both bodies are baked with
 * `ownerApproved: true`; preview and production builds refuse a body that is not (mobile-release-assets.cjs).
 *
 * Reason for the girl wardrobe entries (2026-10-13, release/2.5d-beta-3): the ribbon waves and white sneakers ship
 * their QA'd room art; their factory front layers exist but are not owner-approved and allowlisted yet (same rule).
 * 2026-10-14 (wip/girl-hairs): the bob and pigtails hairs join for the same reason; their front layers (factory
 * girl_bob_2130 and girl_pigtails_2130 sc/final_r2) passed QA and wait for the owner's yes on the front look.
 * 2026-10-14 15:23 (OWNER_DECISIONS): the owner approved the bob and pigtails front looks, so they are allowlisted and
 * baked and their entries are gone. Ribbon waves and white sneakers still wait for that yes.
 *
 * Reason for the girl's crop tops and black trousers (2026-10-13, branch wip/body-replacement-2): their room art is in
 * (owner-approved bare belly), but their front art is still NEEDS-FIX in the factory (crop waist stubs, trousers shape)
 * and has no owner approval, so the showcase allowlist cannot list them. Remove them as fronts land.
 * 2026-10-14 (wip/girl-jacket): the sage ribbon knit jacket joins for the same reason; its front layer (factory
 * girl_jacket_2130 sc/o_sage_j2) waits for the owner's yes on the front look.
 * 2026-10-15 (release/2.5d-beta-5): the powder blue ribbon corset top joins for the same reason; its front layer
 * (factory girl_corset_2130 showcase/o_corset7) waits for the owner's yes on the front look.
 * 2026-10-15 10:38 (OWNER_DECISIONS): the owner approved the fronts of the waves, white sneakers, both crops, black
 * trousers, jacket and corset, conditional on the audit fixes. Six are allowlisted and baked, so their entries are gone.
 * The black trousers stay: with the polo, jacket or corset, fragments of the coral pants baked under those tops' hems
 * show at the hips (audit F2), and that fix is still open (Workbench integration/beta5_fix_1030/REPORT.md).
 * 2026-10-15 19:37 (OWNER_DECISIONS): the hip fix landed (trousers front v2 + erase v2, Workbench integration/gpt3_1745)
 * and the owner approved polo front v7, so the black trousers are allowlisted and baked and their entry is gone.
 * new collection: jacket_girl_light_denim_crop landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: jacket_girl_black_crop_blazer landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: clip_girl_pearl_bar_pair landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: hair_girl_bun_wine_bow landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: hair_girl_chestnut_butterfly landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: hair_girl_ink_french_bob landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: top_girl_camel_vest_tee landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: top_girl_white_poplin_shirt landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: top_girl_rose_pearl_cardigan landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: top_girl_breton_stripe landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: top_girl_sage_knit_polo landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_wine_gingham_tie landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: necklace_girl_pearl_drop landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: bag_girl_camel_mini landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: bottom_girl_wine_midi_skirt landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: bottom_girl_wide_jeans landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: bottom_girl_ecru_trousers landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: shoes_girl_camel_ankle_boots landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_black_corset_slit_maxi landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_terracotta_patchwork_halter_bias_maxi landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_denim_milkmaid_button_midi landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_cream_one_shoulder_tie_midi landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_denim_pinafore_mini landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_sage_shirred_tiered_mini landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_black_corset_flare_mini landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: glasses_boy_black_soft_rect landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: glasses_boy_gunmetal_round landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_butter_square_puff_mini landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: dress_girl_cream_one_shoulder_mini landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: glasses_girl_gold_round landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: glasses_girl_rose_soft_cateye landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: hair_girl_caramel_braid_crown landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: hair_girl_copper_soft_waves landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 * new collection: hair_girl_ink_twin_braids landed without an owner-approved front look; it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.
 */
const SHOWCASE_PENDING: Readonly<Record<AvatarStillRigId, readonly string[]>> = {
  female: ["jacket_girl_light_denim_crop", "jacket_girl_black_crop_blazer", "clip_girl_pearl_bar_pair", "hair_girl_bun_wine_bow", "hair_girl_chestnut_butterfly", "hair_girl_ink_french_bob", "top_girl_camel_vest_tee", "top_girl_white_poplin_shirt", "top_girl_rose_pearl_cardigan", "top_girl_breton_stripe", "top_girl_sage_knit_polo", "dress_girl_wine_gingham_tie", "necklace_girl_pearl_drop", "bag_girl_camel_mini", "bottom_girl_wine_midi_skirt", "bottom_girl_wide_jeans", "bottom_girl_ecru_trousers", "shoes_girl_camel_ankle_boots", "dress_girl_black_corset_slit_maxi", "dress_girl_terracotta_patchwork_halter_bias_maxi", "dress_girl_denim_milkmaid_button_midi", "dress_girl_cream_one_shoulder_tie_midi", "dress_girl_denim_pinafore_mini", "dress_girl_sage_shirred_tiered_mini", "dress_girl_black_corset_flare_mini", "dress_girl_butter_square_puff_mini", "dress_girl_cream_one_shoulder_mini", "glasses_girl_gold_round", "glasses_girl_rose_soft_cateye", "hair_girl_caramel_braid_crown", "hair_girl_copper_soft_waves", "hair_girl_ink_twin_braids"],
  male: ["glasses_boy_black_soft_rect", "glasses_boy_gunmetal_round"],
};

const rigs = Object.keys(AVATAR_STILL_MANIFEST.bodies) as AvatarStillRigId[];

test("every item with rig art has a front layer or is listed as showcase pending", () => {
  for (const rig of rigs) {
    const missing = Object.entries(AVATAR_STILL_MANIFEST.bodies[rig].items)
      .filter(([, item]) => !item.showcase)
      .map(([itemId]) => itemId)
      .filter((itemId) => !SHOWCASE_PENDING[rig].includes(itemId));
    assert.deepEqual(missing, [], `${rig}: items without a front layer must ship one (or be listed with a reason)`);
  }
});

test("the showcase pending list only holds items that still lack a front layer, so it can only shrink", () => {
  for (const rig of rigs) {
    const items = AVATAR_STILL_MANIFEST.bodies[rig].items;
    const stale = SHOWCASE_PENDING[rig].filter((itemId) => !items[itemId] || items[itemId].showcase);
    assert.deepEqual(stale, [], `${rig}: remove these entries, they have a front layer now or no rig art`);
    assert.equal(new Set(SHOWCASE_PENDING[rig]).size, SHOWCASE_PENDING[rig].length, `${rig}: duplicate entries`);
  }
});

test("a body whose items have front layers has a front base to draw them on", () => {
  for (const rig of rigs) {
    const body = AVATAR_STILL_MANIFEST.bodies[rig];
    const hasFrontItems = Object.values(body.items).some((item) => item.showcase);
    assert.ok(!hasFrontItems || body.showcaseBase, `${rig}: front layers without a showcase base`);
  }
});
