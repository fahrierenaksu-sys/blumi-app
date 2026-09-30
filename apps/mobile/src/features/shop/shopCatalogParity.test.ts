import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

require.extensions[".png"] = (module, filename) => {
  module.exports = filename;
};
require.extensions[".webp"] = require.extensions[".png"];

const { AVATAR_V2_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/avatarV2Catalog") as typeof import("../avatarV2/avatarV2Catalog");
const { resolveInitialAvatarV2 } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/avatarV2Persistence") as typeof import("../avatarV2/avatarV2Persistence");
const { buildShopCatalogItems } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./shopCatalog") as typeof import("./shopCatalog");
const {
  AVATAR_LOADOUT_CATALOG,
  ECONOMY_CATALOG,
  resolvePublishedReleaseCatalogItemIds,
  resolveR1PublishedEconomyCatalog,
} =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("@blumi/domain") as typeof import("@blumi/domain");
const workspaceRoot = process.cwd();
const economyCatalogSource = readFileSync(
  join(workspaceRoot, "../../packages/domain/src/economy/economyCatalog.ts"),
  "utf8",
);
const mobileShopSource = readFileSync(
  join(workspaceRoot, "src/features/shop/shopCatalog.ts"),
  "utf8",
);
const maleCapsulePreviewSource = readFileSync(
  join(workspaceRoot, "src/features/avatarV2/maleCapsulePreviewSources.ts"),
  "utf8",
);
const { ROOM_V2_FURNITURE_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../roomV2/roomV2Catalog") as typeof import("../roomV2/roomV2Catalog");
const visibleAvatarTypes = new Set([
  "face",
  "eyes",
  "nose",
  "mouth",
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory",
]);

test("every mobile shop item is represented by the shared economy catalog", () => {
  const visibleAvatarItems = AVATAR_V2_CATALOG.filter(
    (item) => visibleAvatarTypes.has(item.type) && item.hiddenFromShop !== true,
  );

  for (const item of visibleAvatarItems) {
    assert.match(
      economyCatalogSource,
      new RegExp(`avatarItem\\(\\s*"${item.id}"`),
      item.id,
    );
  }
  const roomItemIds = ROOM_V2_FURNITURE_CATALOG.map((item) => item.id);
  assert.equal(roomItemIds.length, 7);
  for (const itemId of roomItemIds) {
    assert.match(
      economyCatalogSource,
      new RegExp(`roomItem\\(\\s*"${itemId}"`),
      itemId,
    );
  }
});

test("room shop accepts an explicitly gated QA catalog and treats its QA-owned pieces as placeable", () => {
  const qaOnlyItem = {
    ...ROOM_V2_FURNITURE_CATALOG[0]!,
    id: "universal_shop_qa_probe",
    name: "Universal Shop QA Probe",
    ownedByDefault: false,
  };
  const products = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2("avatar_v2_body_default"),
    inventory: {
      coins: 1_250,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [],
      unlockedFeatureIds: [],
      updatedAt: "2026-07-21T00:00:00.000Z",
    },
    roomDecor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: [],
    },
    roomFurnitureCatalog: [qaOnlyItem],
    qaOwnedRoomItemIds: [qaOnlyItem.id],
  });

  const roomProducts = products.filter((product) => product.sectionId === "room");
  assert.equal(roomProducts.length, 1);
  assert.equal(roomProducts[0]?.sourceItemId, qaOnlyItem.id);
  assert.equal(roomProducts[0]?.owned, true);
  assert.equal(roomProducts[0]?.actionType, "roomPlace");
  assert.equal(roomProducts[0]?.priceCoins, null);
});

test("demo Shop lists Room products even when none are owned", () => {
  const products = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2("avatar_v2_body_default"),
    inventory: {
      coins: 0,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [],
      unlockedFeatureIds: [],
      updatedAt: "2026-09-27T00:00:00.000Z"
    },
    roomDecor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] }
  })
  const roomProducts = products.filter((product) => product.sectionId === "room")
  assert.equal(roomProducts.length, ROOM_V2_FURNITURE_CATALOG.length)
  assert.ok(roomProducts.some((product) => !product.owned))
  assert.ok(roomProducts.every((product) => product.roomItem))
})

test("R1 Shop lists starter and receipted paid items and hides held ones", () => {
  const r1Catalog = resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG);
  const publishedItemIds = new Set(r1Catalog.map((item) => item.itemId));
  const products = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2("avatar_v2_body_default"),
    inventory: {
      coins: 1_250,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [],
      unlockedFeatureIds: [],
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
    roomDecor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: [],
    },
    economyCatalog: r1Catalog,
    publishedItemIds: [...publishedItemIds],
  });

  const receiptedItemIds = new Set(resolvePublishedReleaseCatalogItemIds());
  assert.ok(r1Catalog.every((item) => item.ownedByDefault || receiptedItemIds.has(item.itemId)));
  assert.ok(products.length > 0);
  assert.ok(products.every((product) => publishedItemIds.has(product.sourceItemId)));
  const receiptedTop = products.find(
    (product) => product.sourceItemId === "avatar_v2_top_sage_ribbon_knit_jacket",
  );
  assert.ok(receiptedTop, "a receipted paid top is listed");
  assert.ok((receiptedTop.priceCoins ?? 0) > 0);
  assert.equal(
    products.some((product) => product.sourceItemId === "avatar_v2_top_cherry_heart_milkmaid_blouse"),
    false,
  );
});

test("an owned room item already placed in the room is shown as placed, not offered for a duplicate placement", () => {
  const item = ROOM_V2_FURNITURE_CATALOG[0]!;
  const products = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2("avatar_v2_body_default"),
    inventory: {
      coins: 1_250,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [item.id],
      unlockedFeatureIds: [],
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
    roomDecor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: [{
        instanceId: "already-placed-item",
        itemId: item.id,
        x: 0.5,
        y: 0.75,
        rotation: "front",
      }],
    },
  });

  const roomProduct = products.find((product) => product.sourceItemId === item.id);
  assert.ok(roomProduct);
  assert.equal(roomProduct.actionType, "disabled");
  assert.equal(roomProduct.stateLabel, "1 placed");
  assert.equal(roomProduct.actionLabel, "Placed");
});

test("mobile pricing delegates to the shared server catalog", () => {
  assert.match(
    mobileShopSource,
    /import \{\s*findEconomyCatalogItem,\s*type EconomyCatalogItem\s*\} from "@blumi\/domain"/,
  );
  assert.doesNotMatch(mobileShopSource, /AVATAR_SHOP_PRICES/);
  assert.doesNotMatch(mobileShopSource, /ROOM_SHOP_PRICES/);
  assert.match(
    mobileShopSource,
    /findEconomyCatalogItem\(item\.id, "avatar", economyCatalog\)\?\.priceCoins/,
  );
  assert.match(
    mobileShopSource,
    /findEconomyCatalogItem\(item\.id, "room", economyCatalog\)\?\.priceCoins/,
  );
});

test("the shared catalog contains the 109 premium avatar items, including Coral Wave", () => {
  const premiumAvatarEntries = Array.from(
    economyCatalogSource.matchAll(
      /avatarItem\(\s*"([^"]+)"\s*,\s*"[^"]+"\s*,\s*(\d+)/g,
    ),
  ).filter((match) => Number(match[2]) > 0);

  // This is a release catalog contract, not a derived expectation. Change it
  // only together with an approved merch expansion and its runtime assets.
  assert.equal(premiumAvatarEntries.length, 109);
  assert.equal(
    new Set(premiumAvatarEntries.map((match) => match[1])).size,
    premiumAvatarEntries.length,
  );
});

test("every dress grants one real hidden paired bottom", () => {
  const dressTops = AVATAR_V2_CATALOG.filter(
    (item) => item.type === "top" && typeof item.pairedItemId === "string",
  );

  assert.equal(dressTops.length, 8);
  for (const dressTop of dressTops) {
    const pairedBottom = AVATAR_V2_CATALOG.find(
      (item) => item.id === dressTop.pairedItemId,
    );
    assert.ok(pairedBottom, dressTop.id);
    assert.equal(pairedBottom.type, "bottom", dressTop.id);
    assert.equal(pairedBottom.hiddenFromShop, true, dressTop.id);
    assert.equal(pairedBottom.outfitKey, dressTop.outfitKey, dressTop.id);

    const economyItem = ECONOMY_CATALOG.find(
      (item) => item.type === "avatar" && item.itemId === dressTop.id,
    );
    assert.ok(economyItem, dressTop.id);
    assert.deepEqual(
      economyItem.grantedItemIds,
      [pairedBottom.id],
      dressTop.id,
    );
    for (const grantedItemId of economyItem.grantedItemIds ?? []) {
      assert.ok(
        AVATAR_V2_CATALOG.some((item) => item.id === grantedItemId),
        grantedItemId,
      );
    }
  }
});

test("server loadout metadata exactly follows the runtime mobile avatar catalog", () => {
  assert.equal(
    new Set(AVATAR_V2_CATALOG.map((item) => item.id)).size,
    AVATAR_V2_CATALOG.length,
    "mobile avatar IDs must be unique",
  );
  assert.equal(
    new Set(AVATAR_LOADOUT_CATALOG.map((item) => item.itemId)).size,
    AVATAR_LOADOUT_CATALOG.length,
    "server avatar IDs must be unique",
  );

  for (const mobileItem of AVATAR_V2_CATALOG) {
    const serverItem = AVATAR_LOADOUT_CATALOG.find(
      (item) => item.itemId === mobileItem.id,
    );
    assert.ok(serverItem, mobileItem.id);
    assert.equal(serverItem.slot, mobileItem.type, `${mobileItem.id}: slot`);
    assert.equal(
      serverItem.accessoryGroup,
      mobileItem.accessoryGroup,
      `${mobileItem.id}: accessory group`,
    );
    assert.equal(
      serverItem.outfitKey,
      mobileItem.outfitKey,
      `${mobileItem.id}: outfit key`,
    );

    const expectedPairId =
      mobileItem.pairedItemId ??
      (mobileItem.type === "bottom" && mobileItem.outfitKey
        ? AVATAR_V2_CATALOG.find(
            (item) =>
              item.type === "top" && item.outfitKey === mobileItem.outfitKey,
          )?.id
        : undefined);
    assert.equal(
      serverItem.pairedItemId,
      expectedPairId,
      `${mobileItem.id}: paired item`,
    );
  }
});

test("male starter basics are browsable, owned, and have real shop previews", () => {
  const visibleMaleBasics = [
    "avatar_v2_hair_male_cocoa_textured_quiff",
    "avatar_v2_top_male_cream_basic_tee",
    "avatar_v2_shoes_male_milk_tea_court",
  ];

  for (const itemId of visibleMaleBasics) {
    const avatarItem = AVATAR_V2_CATALOG.find((item) => item.id === itemId);
    assert.ok(avatarItem, itemId);
    assert.equal(avatarItem.hiddenFromShop, undefined, itemId);
    assert.equal(avatarItem.ownedByDefault, true, itemId);
    assert.deepEqual(
      avatarItem.compatibleBodyIds,
      ["avatar_v2_body_male_light"],
      itemId,
    );

    const economyItem = ECONOMY_CATALOG.find(
      (item) => item.type === "avatar" && item.itemId === itemId,
    );
    assert.ok(economyItem, itemId);
    assert.equal(economyItem.priceCoins, 0, itemId);
    assert.equal(economyItem.ownedByDefault, true, itemId);
    assert.match(
      maleCapsulePreviewSource,
      new RegExp(`${itemId}:\\s*roomAvatarLayerAssets\\.[A-Za-z0-9]+\\.source`),
      `${itemId} needs a local preview source`,
    );
  }
});

test("a male avatar fixture never receives female-compatible shop products", () => {
  const maleBodyId = "avatar_v2_body_male_light";
  const maleAvatar = resolveInitialAvatarV2(maleBodyId);
  const products = buildShopCatalogItems({
    avatar: maleAvatar,
    inventory: {
      coins: 1_250,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [],
      unlockedFeatureIds: [],
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
    roomDecor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: [],
    },
  });
  const avatarProducts = products.filter(
    (product) => product.sectionId === "avatar",
  );

  assert.ok(avatarProducts.length > 0);
  for (const product of avatarProducts) {
    assert.ok(product.avatarItem, product.sourceItemId);
    assert.deepEqual(
      product.avatarItem.compatibleBodyIds,
      [maleBodyId],
      product.sourceItemId,
    );
  }
  assert.ok(
    avatarProducts.some(
      (product) =>
        product.sourceItemId === "avatar_v2_top_male_cream_basic_tee",
    ),
  );
  assert.ok(
    avatarProducts.every(
      (product) => product.sourceItemId !== "avatar_v2_top_blush_lace_cardigan",
    ),
  );
});

test("purchase catalog does not expose disabled status pseudo-products", () => {
  const products = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2("avatar_v2_body_default"),
    inventory: {
      coins: 1_250,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [],
      unlockedFeatureIds: [],
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
    roomDecor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: [],
    },
  });

  assert.ok(products.length > 0);
  assert.ok(
    products.every(
      (product) =>
        product.sectionId === "avatar" || product.sectionId === "room",
    ),
  );
  assert.ok(
    products.every(
      (product) =>
        product.previewType === "avatar" || product.previewType === "room",
    ),
  );
});
