import assert from "node:assert/strict";
import test from "node:test";
import {
  BLUMI_QA_AVATAR_ITEM_IDS,
  createAvatarQaInventory,
  getAvatarAutomationSlug,
  isAvatarQaUnlockEnabled,
  applyDisposableAvatarEquip,
  getAvatarQaPersistencePolicy,
} from "./avatarQaInventory";
import { MALE_PREMIUM_CAPSULE_RUNTIME } from "../malePremiumCapsulePilotDefinitions";

test("QA unlock requires both development mode and the explicit env flag", () => {
  assert.equal(isAvatarQaUnlockEnabled(false, "1"), false);
  assert.equal(isAvatarQaUnlockEnabled(true, undefined), false);
  assert.equal(isAvatarQaUnlockEnabled(true, "0"), false);
  assert.equal(isAvatarQaUnlockEnabled(true, "1"), true);
});

test("clean mode preserves the real inventory without mutation", () => {
  const ownedItemIds = ["avatar_v2_top_default"];
  const inventory = createAvatarQaInventory(ownedItemIds, false);

  assert.deepEqual(inventory.ownedItemIds, ownedItemIds);
  assert.notEqual(inventory.ownedItemIds, ownedItemIds);
});

test("QA persistence policy disables both local and remote writes", () => {
  assert.deepEqual(getAvatarQaPersistencePolicy(true), {
    allowLocalPersistence: false,
    allowRemotePersistence: false,
  });
  assert.deepEqual(getAvatarQaPersistencePolicy(false), {
    allowLocalPersistence: true,
    allowRemotePersistence: true,
  });
});

test("rapid disposable equips compose against current state without losing another slot", () => {
  const top = {
    id: "qa-top",
    type: "top",
    name: "QA Top",
    sortOrder: 1,
    layerOrder: 1,
    assets: {},
  } as const;
  const bottom = {
    id: "qa-bottom",
    type: "bottom",
    name: "QA Bottom",
    sortOrder: 2,
    layerOrder: 2,
    assets: {},
  } as const;
  const initial = {
    bodyId: "avatar_v2_body_female_warm",
    faceId: "face",
    eyesId: "eyes",
    noseId: "nose",
    mouthId: "mouth",
    hairId: "hair",
    topId: "old-top",
    bottomId: "old-bottom",
    shoesId: "shoes",
    accessoryIds: [] as string[],
  };
  const equip = (avatar: typeof initial, item: { type: string; id: string }) =>
    item.type === "top"
      ? { ...avatar, topId: item.id }
      : { ...avatar, bottomId: item.id };

  const afterTop = applyDisposableAvatarEquip(initial, top, equip);
  const afterBottom = applyDisposableAvatarEquip(afterTop, bottom, equip);

  assert.equal(afterBottom.topId, top.id);
  assert.equal(afterBottom.bottomId, bottom.id);
  assert.equal(initial.topId, "old-top");
  assert.equal(initial.bottomId, "old-bottom");
});

test("QA mode adds the regression matrix items without changing the source", () => {
  const ownedItemIds = ["avatar_v2_top_default"];
  const inventory = createAvatarQaInventory(ownedItemIds, true);

  assert.deepEqual(ownedItemIds, ["avatar_v2_top_default"]);
  assert.equal(
    new Set(inventory.ownedItemIds).size,
    inventory.ownedItemIds.length,
  );
  for (const itemId of BLUMI_QA_AVATAR_ITEM_IDS) {
    assert.equal(inventory.ownedItemIds.includes(itemId), true, itemId);
  }
});

test("QA mode includes every premium male capsule item for disposable room-motion review", () => {
  const inventory = createAvatarQaInventory([], true);
  const premiumAvatarIds = MALE_PREMIUM_CAPSULE_RUNTIME.map(
    (item) =>
      `avatar_v2_${item.type === "hairFront" ? "hair" : item.type}_male_${item.slug}`,
  );

  assert.ok(premiumAvatarIds.length > 0);
  assert.equal(new Set(premiumAvatarIds).size, premiumAvatarIds.length);
  for (const itemId of premiumAvatarIds) {
    assert.equal(BLUMI_QA_AVATAR_ITEM_IDS.includes(itemId), true, itemId);
    assert.equal(inventory.ownedItemIds.includes(itemId), true, itemId);
  }
});

test("automation slugs are stable across avatar item categories", () => {
  assert.equal(
    getAvatarAutomationSlug("avatar_v2_top_lilac_offshoulder_bow_blouse"),
    "lilac_offshoulder_bow_blouse",
  );
  assert.equal(
    getAvatarAutomationSlug("avatar_v2_bottom_floral_embroidered_skort_shorts"),
    "floral_embroidered_skort_shorts",
  );
});
