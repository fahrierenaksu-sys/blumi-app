import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_STILL_MANIFEST, type AvatarStillRigId } from "./avatarStills";
import { BOY_WARDROBE_PREVIEW_ALL_IDS } from "./boyWardrobePreview";

/**
 * Ratchet: every item with baked rig art needs a front (showcase) layer, so the figure outside the room is never the
 * 3/4 fallback (ITEM_SYNC_RULES). Items listed here are known debt: they were ported before the showcase view existed.
 * The list may only shrink. When an item gets its front layer, this test fails until its entry is removed. A new item
 * must ship with its front layer; adding an entry needs a reason in the same commit.
 *
 * Reason for the girl starter entries (2026-10-12): fresh QA failed her front still (skin blotches on shoes and
 * ankles, white slivers in hair, ragged cuffs, shoulder notches) and the owner has not approved the look, so it was
 * taken out of the bake (tools/avatar25d/showcase-allowlist.json). Remove these four when a QA-passed, owner-approved
 * still is baked.
 *
 * Reason for the boy entries (2026-10-13, branch wip/boy-wardrobe-preview): his 26-piece wardrobe preview has room
 * stills but no owner-approved front layer yet (bake-showcase.mjs needs `ownerApproved`). Remove them as fronts land.
 */
const SHOWCASE_PENDING: Readonly<Record<AvatarStillRigId, readonly string[]>> = {
  female: [
    "avatar_v2_shoes_mint_ribbon_court_sneakers",
    "avatar_v2_bottom_coral_wave_pants",
    "avatar_v2_top_coral_wave_polo",
    "avatar_v2_hair_ink_pageboy_star",
  ],
  male: [...BOY_WARDROBE_PREVIEW_ALL_IDS],
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
