import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_STILL_MANIFEST, type AvatarStillRigId } from "./avatarStills";
import { GIRL_WARDROBE_PREVIEW_ALL_IDS } from "./girlWardrobePreview";

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
 * 2026-10-14 (wip/girl-jacket): the sage ribbon knit jacket joins for the same reason; its front layer (factory
 * girl_jacket_2130 sc/o_sage_j2) waits for the owner's yes on the front look.
 */
const SHOWCASE_PENDING: Readonly<Record<AvatarStillRigId, readonly string[]>> = {
  female: [...GIRL_WARDROBE_PREVIEW_ALL_IDS],
  male: [],
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
