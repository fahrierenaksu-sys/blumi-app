import assert from "node:assert/strict";
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
const { getAvatarItemPreviewSource } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./shopAssets") as typeof import("./shopAssets");
const {
  AVATAR_LOADOUT_CATALOG,
  BOY_WARDROBE_PREVIEW_ALL_IDS,
  GIRL_WARDROBE_PREVIEW_ALL_IDS,
  BLUMI_R1_RELEASE_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  ECONOMY_CATALOG,
  findEconomyCatalogItem,
  isReleaseCatalogItemHeld,
  resolvePublishedReleaseCatalogItemIds,
  resolveR1PublishedEconomyCatalog,
} =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("@blumi/domain") as typeof import("@blumi/domain");
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

// Plain Node has no room seam (and, since X8, no flat pieces): stand-in drawings, one unheld with its own price
const standInPiece = (id: string, name: string) => ({
  id, name, asset: { key: id, source: 1 }, category: "seating" as const, layer: "furniture" as const,
  width: 0.1, height: 0.1, interactionType: "seat" as const,
});
const STAND_IN_ROOM_ID = "stand_in_room_piece";
const STAND_IN_ROOM_CATALOG = [
  standInPiece(STAND_IN_ROOM_ID, "Stand-in Piece"),
  standInPiece("room_v2_chair_blush", "Blush Lounge Chair"),
];
const STAND_IN_ECONOMY = [
  ...ECONOMY_CATALOG,
  { itemId: STAND_IN_ROOM_ID, type: "room" as const, title: "Stand-in Piece", priceCoins: 10 },
];

test("every mobile shop item is represented by the shared economy catalog", () => {
  const visibleAvatarItems = AVATAR_V2_CATALOG.filter(
    (item) => visibleAvatarTypes.has(item.type) && item.hiddenFromShop !== true,
  );

  for (const item of visibleAvatarItems) {
    assert.ok(findEconomyCatalogItem(item.id, "avatar"), item.id);
  }
  for (const item of ROOM_V2_FURNITURE_CATALOG) {
    assert.ok(findEconomyCatalogItem(item.id, "room"), item.id);
  }
});

test("every Shop product is priced exactly as the shared economy catalog", () => {
  let checked = 0;
  for (const bodyId of ["avatar_v2_body_default", "avatar_v2_body_male_light"]) {
    const products = buildShopCatalogItems({
      avatar: resolveInitialAvatarV2(bodyId),
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
    for (const product of products) {
      const type = product.sectionId === "avatar" ? "avatar" : "room";
      const economyItem = findEconomyCatalogItem(product.sourceItemId, type);
      assert.equal(product.priceCoins, economyItem?.priceCoins ?? null, product.sourceItemId);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "no Shop product was checked");
});

test("room shop accepts an explicitly gated QA catalog and treats its QA-owned pieces as placeable", () => {
  const qaOnlyItem = {
    ...STAND_IN_ROOM_CATALOG[0]!,
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
    roomDecor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    economyCatalog: STAND_IN_ECONOMY,
    roomFurnitureCatalog: STAND_IN_ROOM_CATALOG
  })
  const roomProducts = products.filter((product) => product.sectionId === "room")
  // every piece but the held ones (pricing pending), which no build lists
  assert.equal(roomProducts.length, STAND_IN_ROOM_CATALOG.filter((item) => !isReleaseCatalogItemHeld(item.id)).length)
  assert.equal(roomProducts.length, 1)
  assert.ok(roomProducts.some((product) => !product.owned))
  assert.ok(roomProducts.every((product) => product.roomItem))
})

// Plan X15 retired every old paid item and removed their receipts, so the R1 listing test runs on fixture items:
// two paid tops copied from old items (same art), one published in a fixture release catalog and one not. The
// fixture publication carries only the item ID; it is not a receipt and never leaves this test.
const PUBLISHED_FIXTURE_TOP_ID = "fixture_shop_top_published";
const HELD_BACK_FIXTURE_TOP_ID = "fixture_shop_top_not_published";
const fixtureTops = [
  [PUBLISHED_FIXTURE_TOP_ID, "avatar_v2_top_sage_ribbon_knit_jacket", 410],
  [HELD_BACK_FIXTURE_TOP_ID, "avatar_v2_top_cherry_heart_milkmaid_blouse", 520],
] as const;
const fixtureShelf = fixtureTops.map(([id, realId]) => {
  const item = AVATAR_V2_CATALOG.find((entry) => entry.id === realId);
  assert.ok(item, realId);
  return { ...item, id, hiddenFromShop: false, hiddenFromWardrobe: false };
});
const fixtureEconomy = [
  ...ECONOMY_CATALOG,
  ...fixtureTops.map(([itemId, , priceCoins]) => ({ itemId, type: "avatar" as const, title: itemId, priceCoins })),
];
const fixtureReleaseCatalog = {
  ...BLUMI_R1_RELEASE_CATALOG,
  publishedItems: [{ itemId: PUBLISHED_FIXTURE_TOP_ID, itemType: "avatar" }],
} as unknown as typeof BLUMI_R1_RELEASE_CATALOG;

test("R1 Shop lists starter and receipted paid items and hides held ones", () => {
  const r1Catalog = resolveR1PublishedEconomyCatalog(fixtureEconomy, fixtureReleaseCatalog);
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
    avatarCatalog: [...AVATAR_V2_CATALOG, ...fixtureShelf],
  });

  const receiptedItemIds = new Set(resolvePublishedReleaseCatalogItemIds(fixtureReleaseCatalog));
  assert.ok(r1Catalog.every((item) => item.ownedByDefault || receiptedItemIds.has(item.itemId)));
  assert.ok(products.length > 0);
  assert.ok(products.every((product) => publishedItemIds.has(product.sourceItemId)));
  const receiptedTop = products.find((product) => product.sourceItemId === PUBLISHED_FIXTURE_TOP_ID);
  assert.ok(receiptedTop, "a receipted paid top is listed");
  assert.ok((receiptedTop.priceCoins ?? 0) > 0);
  assert.equal(
    products.some((product) => product.sourceItemId === HELD_BACK_FIXTURE_TOP_ID),
    false,
  );
});

test("an owned room item already placed in the room is shown as placed, not offered for a duplicate placement", () => {
  const item = STAND_IN_ROOM_CATALOG.find((entry) => !isReleaseCatalogItemHeld(entry.id))!;
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
    economyCatalog: STAND_IN_ECONOMY,
    roomFurnitureCatalog: STAND_IN_ROOM_CATALOG,
  });

  const roomProduct = products.find((product) => product.sourceItemId === item.id);
  assert.ok(roomProduct);
  assert.equal(roomProduct.actionType, "disabled");
});

test("every dress grants one real hidden paired bottom", () => {
  const dressTops = AVATAR_V2_CATALOG.filter(
    (item) => item.type === "top" && typeof item.pairedItemId === "string",
  );

  assert.ok(dressTops.length > 0);
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

test("the boy's starter pieces (curls + basic_a) are free, owned by default, and never sold in the Shop", () => {
  const starterIds = [
    DEFAULT_MALE_AVATAR_LOADOUT.hairId,
    DEFAULT_MALE_AVATAR_LOADOUT.topId,
    DEFAULT_MALE_AVATAR_LOADOUT.bottomId,
    DEFAULT_MALE_AVATAR_LOADOUT.shoesId,
  ];

  for (const itemId of starterIds) {
    const avatarItem = AVATAR_V2_CATALOG.find((item) => item.id === itemId);
    assert.ok(avatarItem, itemId);
    assert.equal(avatarItem.hiddenFromShop, true, itemId);
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
  }
});

test("every visible starter garment has a local shop preview", () => {
  const garmentTypes = new Set(["hair", "top", "bottom", "shoes", "accessory"]);
  const visibleStarters = AVATAR_V2_CATALOG.filter(
    (item) => garmentTypes.has(item.type) && item.hiddenFromShop !== true && item.ownedByDefault === true,
  );
  assert.ok(visibleStarters.length > 0);
  for (const item of visibleStarters) {
    assert.ok(getAvatarItemPreviewSource(item.id), `${item.id} needs a local preview source`);
  }
});

function avatarShopProductsFor(bodyId: string) {
  return buildShopCatalogItems({
    avatar: resolveInitialAvatarV2(bodyId),
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
  }).filter((product) => product.sectionId === "avatar");
}

test("each body's Shop lists only avatar products made for that body", () => {
  const maleBodyId = "avatar_v2_body_male_light";
  const femaleBodyId = "avatar_v2_body_default";
  const femaleProducts = avatarShopProductsFor(femaleBodyId);
  const maleProducts = avatarShopProductsFor(maleBodyId);

  assert.ok(femaleProducts.length > 0, "the girl's Shop lists her avatar products");
  for (const [bodyId, products] of [[femaleBodyId, femaleProducts], [maleBodyId, maleProducts]] as const) {
    for (const product of products) {
      assert.ok(product.avatarItem, product.sourceItemId);
      assert.ok(
        (product.avatarItem.compatibleBodyIds ?? [femaleBodyId]).includes(bodyId),
        `${bodyId} was offered ${product.sourceItemId}`,
      );
    }
  }
  assert.ok(femaleProducts.some((product) => product.sourceItemId === DEFAULT_FEMALE_AVATAR_LOADOUT.topId));
  assert.ok(maleProducts.every((product) => product.sourceItemId !== DEFAULT_FEMALE_AVATAR_LOADOUT.topId));
  assert.ok(maleProducts.every((product) => product.sourceItemId !== "avatar_v2_top_blush_lace_cardigan"));
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

test("every 2.5D wardrobe piece of both bodies has a wardrobe card picture of its own", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset loading requires static require.
  const wardrobe = require("../avatarV2/wardrobe/wardrobePreviewSources") as typeof import("../avatarV2/wardrobe/wardrobePreviewSources");
  for (const id of [...BOY_WARDROBE_PREVIEW_ALL_IDS, ...GIRL_WARDROBE_PREVIEW_ALL_IDS]) {
    const item = AVATAR_V2_CATALOG.find((candidate) => candidate.id === id);
    assert.ok(item, `${id} is in the avatar catalog`);
    // (the test runner resolves a bundled asset to its path; Metro to a number)
    const source: unknown = wardrobe.getAvatarItemPreviewSource(item);
    assert.ok(typeof source === "string" && source.includes(`/thumb/${id}.webp`), `${id} card shows its own baked thumb`);
  }
});

test("every piece the 2.5D rig draws shows its baked thumb on wardrobe and Shop cards, never pre-2.5D art", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset loading requires static require.
  const wardrobe = require("../avatarV2/wardrobe/wardrobePreviewSources") as typeof import("../avatarV2/wardrobe/wardrobePreviewSources");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset loading requires static require.
  const shop = require("./shopAssets") as typeof import("./shopAssets");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset loading requires static require.
  const { listAvatarItemArt } = require("../avatar/model/avatarItemArt") as typeof import("../avatar/model/avatarItemArt");
  const rigItemIds = [...new Set(listAvatarItemArt().map(({ itemId }) => itemId))];
  // the girl's starter pieces carried pre-2.5D cards before; they must be covered here
  for (const starterId of [
    "avatar_v2_hair_ink_pageboy_star",
    "avatar_v2_shoes_mint_ribbon_court_sneakers",
  ]) {
    assert.ok(rigItemIds.includes(starterId), `${starterId} is drawn by the 2.5D rig`);
  }
  for (const id of rigItemIds) {
    const item = AVATAR_V2_CATALOG.find((candidate) => candidate.id === id);
    assert.ok(item, `${id} is in the avatar catalog`);
    const ownThumb = `/thumb/${id}.webp`;
    // the test loader maps an image require to its file path
    assert.ok(String(wardrobe.getAvatarItemPreviewSource(item)).endsWith(ownThumb), `${id} wardrobe card shows its baked thumb`);
    assert.ok(wardrobe.isAvatarItemCutoutPreview(item), `${id} wardrobe card is fitted whole`);
    for (const [surface, source] of [
      ["Shop card", shop.getShopProductThumbnailSource(id)],
      ["Shop preview", shop.getAvatarItemPreviewSource(id)],
    ] as const) {
      if (source === undefined) continue;
      assert.ok(String(source).endsWith(ownThumb), `${id} ${surface} shows its baked thumb, not ${String(source)}`);
    }
  }
});
