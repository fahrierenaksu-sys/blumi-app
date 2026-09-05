import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";

require.extensions[".png"] = (module, filename) => {
  module.exports = filename;
};
require.extensions[".webp"] = require.extensions[".png"];

const { ECONOMY_CATALOG, AVATAR_LOADOUT_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("@blumi/domain") as typeof import("@blumi/domain");
const { AVATAR_V2_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./avatarV2.mock") as typeof import("./avatarV2.mock");
const { resolveInitialAvatarV2 } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./avatarV2Persistence") as typeof import("./avatarV2Persistence");
const { MALE_CAPSULE_PREVIEW_SOURCES } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./maleCapsulePreviewSources") as typeof import("./maleCapsulePreviewSources");
const {
  MALE_BOTTOMS_BEHIND_SHOES_IDS,
  ROOM_AVATAR_CATALOG,
  ROOM_AVATAR_LAYER_ORDER,
} =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./room/avatarRoom.mock") as typeof import("./room/avatarRoom.mock");
const {
  DEFAULT_AVATAR_ROOM_PROJECTION_MAP,
  projectAvatarV2ToRoomAvatarAppearance,
} =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection");
const { buildShopCatalogItems } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../shop/shopCatalog") as typeof import("../shop/shopCatalog");
const { canMiniRoomAvatarUseMotion } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../miniRoom/miniRoomAvatarMotion") as typeof import("../miniRoom/miniRoomAvatarMotion");
const { MALE_PREMIUM_CAPSULE_INVENTORY } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./malePremiumCapsuleInventory") as typeof import("./malePremiumCapsuleInventory");
const { MALE_PREMIUM_CAPSULE_RUNTIME } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./malePremiumCapsulePilotDefinitions") as typeof import("./malePremiumCapsulePilotDefinitions");

const maleBodyId = "avatar_v2_body_male_light";
const femaleBodyId = "avatar_v2_body_default";

const approved = {
  tee: [
    [
      "avatar_v2_top_male_cream_basic_tee",
      "room_avatar_top_male_cream_basic_tee_v1",
    ],
    [
      "avatar_v2_top_male_powder_blue_crew_tee",
      "room_avatar_top_male_powder_blue_crew_tee_v1",
    ],
    [
      "avatar_v2_top_male_sage_basic_tee",
      "room_avatar_top_male_sage_basic_tee_v1",
    ],
    [
      "avatar_v2_top_male_dusty_navy_tee",
      "room_avatar_top_male_dusty_navy_tee_v1",
    ],
  ],
  shirt: [
    [
      "avatar_v2_top_male_mist_blue_oxford_shirt",
      "room_avatar_top_male_mist_blue_oxford_shirt_v1",
    ],
    [
      "avatar_v2_top_male_soft_sage_linen_shirt",
      "room_avatar_top_male_soft_sage_linen_shirt_v1",
    ],
  ],
  jacket: [
    [
      "avatar_v2_top_male_cocoa_varsity_jacket",
      "room_avatar_top_male_cocoa_varsity_jacket_v1",
    ],
    [
      "avatar_v2_top_male_dusty_navy_chore_jacket",
      "room_avatar_top_male_dusty_navy_chore_jacket_v1",
    ],
  ],
  pants: [
    [
      "avatar_v2_bottom_male_navy_straight_pants",
      "room_avatar_bottom_male_navy_straight_pants_v1",
    ],
    [
      "avatar_v2_bottom_male_mid_blue_straight_jeans",
      "room_avatar_bottom_male_mid_blue_straight_jeans_v1",
    ],
    [
      "avatar_v2_bottom_male_charcoal_tapered_chinos",
      "room_avatar_bottom_male_charcoal_tapered_chinos_v1",
    ],
    [
      "avatar_v2_bottom_male_warm_sand_relaxed_pants",
      "room_avatar_bottom_male_warm_sand_relaxed_pants_v1",
    ],
  ],
  hair: [
    [
      "avatar_v2_hair_male_espresso_crop",
      "room_avatar_hair_front_male_espresso_crop_v1",
    ],
    [
      "avatar_v2_hair_male_cocoa_textured_quiff",
      "room_avatar_hair_front_male_cocoa_textured_quiff_v1",
    ],
    [
      "avatar_v2_hair_male_soft_black_side_part",
      "room_avatar_hair_front_male_soft_black_side_part_v1",
    ],
    [
      "avatar_v2_hair_male_chestnut_short_waves",
      "room_avatar_hair_front_male_chestnut_short_waves_v1",
    ],
  ],
  shoes: [
    [
      "avatar_v2_shoes_male_milk_tea_court",
      "room_avatar_shoes_male_milk_tea_court_v1",
    ],
    [
      "avatar_v2_shoes_male_cloud_white_trainers",
      "room_avatar_shoes_male_cloud_white_trainers_v1",
    ],
    [
      "avatar_v2_shoes_male_cocoa_penny_loafers",
      "room_avatar_shoes_male_cocoa_penny_loafers_v1",
    ],
    [
      "avatar_v2_shoes_male_dusty_blue_canvas_sneakers",
      "room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1",
    ],
  ],
} as const;

const approvedPairs = Object.values(approved).flat();
const animatedPairs = [
  ...approved.tee,
  ...approved.shirt,
  ...approved.jacket,
  ...approved.pants,
  ...approved.shoes,
];

const inventory = {
  coins: 1_250,
  ownedAvatarItemIds: [],
  ownedRoomItemIds: [],
  unlockedFeatureIds: [],
  updatedAt: "2026-07-14T00:00:00.000Z",
};
const roomDecor = {
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: [],
};

test("premium male capsule exposes the approved replacement tops and excludes rejected legacy tops", () => {
  const counts = Object.fromEntries(
    ["top", "bottom", "shoes", "accessory", "hairFront"].map((type) => [
      type,
      MALE_PREMIUM_CAPSULE_INVENTORY.filter((item) => item.type === type)
        .length,
    ]),
  );

  assert.equal(MALE_PREMIUM_CAPSULE_INVENTORY.length, 49);
  assert.deepEqual(counts, {
    top: 19,
    bottom: 14,
    shoes: 4,
    accessory: 5,
    hairFront: 7,
  });
  for (const approvedV3Id of [
    "copper_compact_quiff",
    "ash_blond_low_fade_crop",
    "blue_black_short_curls",
    "tortoiseshell_smoke_sunglasses",
    "matte_black_panto_sunglasses",
    "dusty_blue_weekend_crew_sweatshirt",
    "modern_track_luxury_top",
    "cocoa_sage_canvas_shacket",
  ]) {
    assert.equal(
      MALE_PREMIUM_CAPSULE_INVENTORY.some((item) => item.id === approvedV3Id),
      true,
      approvedV3Id,
    );
  }
  for (const cancelledId of [
    "cropped_cocoa_moto_jacket",
    "diagonal_seam_zip_mock_neck",
    "medium_curtain_middle_part",
    "slim_oval_glasses",
    "soft_rectangular_glasses",
    "translucent_wrap_glasses",
    "tinted_star_glasses",
  ]) {
    assert.equal(
      MALE_PREMIUM_CAPSULE_INVENTORY.some((item) => item.id === cancelledId),
      false,
      cancelledId,
    );
  }
  assert.equal(
    new Set(MALE_PREMIUM_CAPSULE_INVENTORY.map((item) => item.id)).size,
    49,
  );
  assert.equal(
    MALE_PREMIUM_CAPSULE_INVENTORY.filter((item) => item.coordinationKey)
      .length,
    12,
    "the approved modern-track top restores its complete mix-and-match pair",
  );
});

test("approved 49-piece premium male capsule is wired across avatar, room, server loadout, economy, projection, and preview", () => {
  assert.equal(MALE_PREMIUM_CAPSULE_RUNTIME.length, 49);
  assert.deepEqual(
    MALE_PREMIUM_CAPSULE_RUNTIME.map((item) => item.slug).sort(),
    MALE_PREMIUM_CAPSULE_INVENTORY.map((item) => item.id).sort(),
  );

  for (const item of MALE_PREMIUM_CAPSULE_RUNTIME) {
    const avatarType = item.type === "hairFront" ? "hair" : item.type;
    const avatarId = `avatar_v2_${avatarType}_male_${item.slug}`;
    const roomId = item.roomId;
    const expectedRoomType =
      item.type === "hairFront" ? "hair_front" : item.type;
    assert.equal(
      roomId,
      `room_avatar_${expectedRoomType}_male_${item.slug}_v1`,
    );
    const avatar = AVATAR_V2_CATALOG.find(
      (candidate) => candidate.id === avatarId,
    );
    const room = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === roomId,
    );
    const loadout = AVATAR_LOADOUT_CATALOG.find(
      (candidate) => candidate.itemId === avatarId,
    );
    const economy = ECONOMY_CATALOG.find(
      (candidate) => candidate.itemId === avatarId,
    );
    const projection = DEFAULT_AVATAR_ROOM_PROJECTION_MAP[avatarId];

    assert.ok(avatar, avatarId);
    assert.ok(room, roomId);
    assert.ok(loadout, `${avatarId} loadout`);
    assert.ok(economy, `${avatarId} economy`);
    assert.ok(projection, `${avatarId} projection`);
    assert.ok(MALE_CAPSULE_PREVIEW_SOURCES[avatarId], `${avatarId} preview`);
    assert.equal(room.bodyPreset, "male");
    assert.equal(room.fitProfileId, "blumi_male_room_avatar_v1");
    assert.ok(room.assetsByMotion?.walking?.front);
    assert.ok(room.assetsByMotion?.sitting?.front);
    assert.deepEqual(avatar.compatibleBodyIds, [maleBodyId]);
    assert.deepEqual(loadout.supportedBodyIds, [maleBodyId]);
    assert.equal(economy.ownedByDefault, undefined);
    assert.equal(avatar.ownedByDefault, undefined);
    if (item.type === "accessory") {
      const inventoryItem = MALE_PREMIUM_CAPSULE_INVENTORY.find(
        (candidate) => candidate.id === item.slug,
      );
      assert.equal(
        avatar.accessoryGroup,
        inventoryItem?.accessoryGroup ?? "eyewear",
      );
    }
  }
});

test("all promoted premium clothing has real 4W+1S motion and fixed-head features have keyed 4W+1S motion", () => {
  for (const item of MALE_PREMIUM_CAPSULE_RUNTIME) {
    const roomId = item.roomId;
    const room = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === roomId,
    );
    const walking = room?.assetsByMotion?.walking?.front;
    const sitting = room?.assetsByMotion?.sitting?.front;

    assert.ok(room, roomId);
    assert.ok(walking && "frames" in walking, `${roomId} walking sequence`);
    assert.equal(walking.frames.length, 4, `${roomId} walking count`);
    assert.ok(sitting && !("frames" in sitting), `${roomId} sitting frame`);
    assert.equal(sitting.key, `${roomId}_sitting_front_f01`);

    for (const frame of walking.frames)
      assert.ok(statSync(String(frame.source)).size > 0, frame.key);
    assert.ok(
      statSync(String(sitting.source)).size > 0,
      `${roomId} sitting source`,
    );

    if (
      item.type === "top" ||
      item.type === "bottom" ||
      item.type === "shoes"
    ) {
      assert.equal(
        new Set(walking.frames.map((frame) => frame.source)).size,
        4,
        `${roomId} distinct walking art`,
      );
      assert.notEqual(
        walking.frames[0].source,
        sitting.source,
        `${roomId} pose-specific sitting art`,
      );
    } else {
      assert.equal(
        new Set(walking.frames.map((frame) => frame.source)).size,
        1,
        `${roomId} fixed-head sequence`,
      );
      assert.equal(
        walking.frames[0].source,
        room.asset.source,
        `${roomId} static feature source`,
      );
      assert.equal(
        sitting.source,
        room.asset.source,
        `${roomId} fixed-head sitting source`,
      );
    }
  }
});

test("approved male starter capsule exposes exactly the PM-approved live counts", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(approved).map(([key, items]) => [key, items.length]),
    ),
    {
      tee: 4,
      shirt: 2,
      jacket: 2,
      pants: 4,
      hair: 4,
      shoes: 4,
    },
  );

  for (const [avatarId] of approvedPairs) {
    const item = AVATAR_V2_CATALOG.find(
      (candidate) => candidate.id === avatarId,
    );
    assert.ok(item, avatarId);
    assert.notEqual(item.hiddenFromShop, true, avatarId);
  }
  assert.equal(
    AVATAR_V2_CATALOG.find(
      (item) => item.id === "avatar_v2_bottom_male_sage_cuffed_shorts",
    )?.hiddenFromShop,
    true,
  );
});

test("live room catalog has non-empty rig layers and exact 4W+1S motion for animated wearables", () => {
  for (const [, roomId] of approvedPairs) {
    const item = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === roomId,
    );
    assert.ok(item, roomId);
    assert.ok(statSync(String(item.asset.source)).size > 0, `${roomId} static`);
  }

  for (const [, roomId] of animatedPairs) {
    const item = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === roomId,
    );
    const walking = item?.assetsByMotion?.walking?.front;
    const sitting = item?.assetsByMotion?.sitting?.front;
    assert.ok(
      walking && "frames" in walking,
      `${roomId} cannot use static walking fallback`,
    );
    assert.equal(walking.frames.length, 4, `${roomId} walking`);
    assert.ok(
      sitting && !("frames" in sitting),
      `${roomId} cannot use static sitting fallback`,
    );
    for (const frame of walking.frames) {
      assert.ok(
        statSync(String(frame.source)).size > 0,
        `${frame.key} live frame`,
      );
    }
    assert.ok(statSync(String(sitting.source)).size > 0, `${roomId} sitting`);
  }
});

test("all four male hairs keep exact keyed fixed-head motion in the full MiniRoom avatar", () => {
  for (const [, roomId] of approved.hair) {
    const item = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === roomId,
    );
    const walking = item?.assetsByMotion?.walking?.front;
    const sitting = item?.assetsByMotion?.sitting?.front;

    assert.ok(item, roomId);
    assert.ok(walking && "frames" in walking, `${roomId} walking sequence`);
    assert.deepEqual(
      walking.frames.map((frame) => frame.key),
      [1, 2, 3, 4].map((frame) => `${roomId}_walking_front_f0${frame}`),
      `${roomId} keyed fixed-head frames`,
    );
    assert.equal(
      new Set(walking.frames.map((frame) => frame.source)).size,
      1,
      `${roomId} rigid head`,
    );
    assert.ok(
      walking.frames.every((frame) => frame.source === item.asset.source),
      `${roomId} static source preserved`,
    );
    assert.ok(
      sitting && !("frames" in sitting),
      `${roomId} exact sitting frame`,
    );
    assert.equal(sitting.key, `${roomId}_sitting_front_f01`);
    assert.equal(sitting.source, item.asset.source);

    const roomAvatarAppearance = {
      bodyPreset: "male" as const,
      baseId: "room_avatar_base_male_light_v1",
      faceId: "room_avatar_face_male_warm_friendly_v1",
      hairFrontId: roomId,
      topId: "room_avatar_top_male_powder_blue_crew_tee_v1",
      bottomId: "room_avatar_bottom_male_navy_straight_pants_v1",
      shoesId: "room_avatar_shoes_male_milk_tea_court_v1",
      accessoryIds: [],
    };
    const appearance = {
      base: "male_base_01" as const,
      snapshotSource: "avatar_v2_current_user" as const,
      roomAvatarAppearance,
    };

    for (const motion of ["walking", "sitting"] as const) {
      assert.equal(
        canMiniRoomAvatarUseMotion({
          appearance,
          motion,
          facing: "front",
        }),
        true,
        `${roomId} full avatar ${motion}`,
      );
    }
  }
});

test("avatar, projection, room, loadout, and free ownership metadata stay in parity", () => {
  for (const [avatarId, roomId] of approvedPairs) {
    const avatarItem = AVATAR_V2_CATALOG.find(
      (candidate) => candidate.id === avatarId,
    );
    const roomItem = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === roomId,
    );
    const economyItem = ECONOMY_CATALOG.find(
      (candidate) =>
        candidate.type === "avatar" && candidate.itemId === avatarId,
    );
    const loadoutItem = AVATAR_LOADOUT_CATALOG.find(
      (candidate) => candidate.itemId === avatarId,
    );
    assert.ok(avatarItem, avatarId);
    assert.ok(roomItem, roomId);
    assert.ok(economyItem, `${avatarId} economy`);
    assert.ok(loadoutItem, `${avatarId} loadout`);
    assert.deepEqual(avatarItem.compatibleBodyIds, [maleBodyId], avatarId);
    assert.equal(roomItem.bodyPreset, "male", roomId);
    assert.equal(roomItem.fitProfileId, "blumi_male_room_avatar_v1", roomId);
    assert.equal(avatarItem.ownedByDefault, true, avatarId);
    assert.equal(economyItem.priceCoins, 0, avatarId);
    assert.equal(economyItem.ownedByDefault, true, avatarId);
    assert.deepEqual(loadoutItem.supportedBodyIds, [maleBodyId], avatarId);

    const projection = DEFAULT_AVATAR_ROOM_PROJECTION_MAP[avatarId];
    assert.ok(projection, `${avatarId} projection`);
    assert.ok(
      Object.values(projection).includes(roomId),
      `${avatarId} -> ${roomId}`,
    );
    assert.ok(
      MALE_CAPSULE_PREVIEW_SOURCES[avatarId],
      `${avatarId} rig preview`,
    );

    const slot = avatarItem.type === "hair" ? "hairId" : `${avatarItem.type}Id`;
    const projected = projectAvatarV2ToRoomAvatarAppearance({
      avatar: {
        ...resolveInitialAvatarV2(maleBodyId),
        [slot]: avatarId,
      },
    });
    assert.deepEqual(projected.unmappedItemIds, [], `${avatarId} unmapped`);
    assert.ok(
      Object.values(projected.appearance).includes(roomId),
      `${avatarId} exact appearance`,
    );
  }
});

test("male and female Shop catalogs have zero cross-body leakage", () => {
  const maleProducts = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2(maleBodyId),
    inventory,
    roomDecor,
  }).filter((item) => item.sectionId === "avatar");
  const femaleProducts = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2(femaleBodyId),
    inventory,
    roomDecor,
  }).filter((item) => item.sectionId === "avatar");

  for (const [avatarId] of approvedPairs) {
    assert.ok(
      maleProducts.some((item) => item.sourceItemId === avatarId),
      avatarId,
    );
    assert.equal(
      femaleProducts.some((item) => item.sourceItemId === avatarId),
      false,
      `${avatarId} leaked female`,
    );
  }
  assert.equal(
    maleProducts.some((item) =>
      item.avatarItem?.compatibleBodyIds?.includes(femaleBodyId),
    ),
    false,
    "female wearable leaked into male Shop",
  );
});

test("pants preserve each approved shoe-upper occlusion decision", () => {
  for (const [, roomId] of approved.pants) {
    const pants = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === roomId,
    );
    assert.ok(pants);
    if (MALE_BOTTOMS_BEHIND_SHOES_IDS.has(roomId)) {
      assert.equal(pants.occlusionRole, "bottomBehindShoes");
      assert.ok(
        pants.layerOrder < ROOM_AVATAR_LAYER_ORDER.shoes,
        `${roomId} must reveal the approved shoe upper`,
      );
    } else {
      assert.equal(pants.occlusionRole, "bottomOverShoeUpper");
      assert.ok(
        pants.layerOrder > ROOM_AVATAR_LAYER_ORDER.shoes,
        `${roomId} must cover shoe upper`,
      );
    }
  }
});
