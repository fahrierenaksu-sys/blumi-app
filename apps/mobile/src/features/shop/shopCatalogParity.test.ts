import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { RoomFurnitureRotation } from "../roomV2/roomV2.types";

require.extensions[".png"] = (module, filename) => {
  module.exports = filename;
};
require.extensions[".webp"] = require.extensions[".png"];

const { AVATAR_V2_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/avatarV2.mock") as typeof import("../avatarV2/avatarV2.mock");
const { resolveInitialAvatarV2 } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/avatarV2Persistence") as typeof import("../avatarV2/avatarV2Persistence");
const { buildShopCatalogItems } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./shopCatalog") as typeof import("./shopCatalog");
const {
  AVATAR_LOADOUT_CATALOG,
  ECONOMY_CATALOG,
  resolveR1PublishedEconomyCatalog,
} =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("@blumi/domain") as typeof import("@blumi/domain");
const {
  resolveEconomyCatalog,
  UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
  UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
  UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
  UNIVERSAL_CORE_ROOM_ITEM_IDS,
  UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("@blumi/domain") as typeof import("@blumi/domain");

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
  require("../roomV2/roomV2.mock") as typeof import("../roomV2/roomV2.mock");
const { resolveHistoricalRoomV2QaFurnitureCatalog } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../roomV2/roomV2HistoricalQaCatalog") as typeof import("../roomV2/roomV2HistoricalQaCatalog");
const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomV2/roomV3UniversalCoreArtifactRegistry") as typeof import("../roomV2/roomV3UniversalCoreArtifactRegistry");
const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomV2/roomV3UniversalCoreRuntimeFurniture") as typeof import("../roomV2/roomV3UniversalCoreRuntimeFurniture");
const {
  ROOM_V3_LOCKED_PERSPECTIVE_PROFILE,
  ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION,
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomV2/roomV3UniversalCoreEvidenceManifest") as typeof import("../roomV2/roomV3UniversalCoreEvidenceManifest");
const {
  ROOM_V3_FURNITURE_CATEGORIES,
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomV2/roomV3ProductionPlan") as typeof import("../roomV2/roomV3ProductionPlan");
const {
  ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID,
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomV2/roomV3UniversalCoreInventory") as typeof import("../roomV2/roomV3UniversalCoreInventory");
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

const seatCandidateIds = new Set([
  "universal_dining_chair_a",
  "universal_desk_chair_a",
  "universal_lounge_armchair_a",
  "universal_cloud_accent_chair_b",
  "universal_cloud_loveseat_a",
  "universal_bench_a",
  "universal_long_sofa_a",
  "universal_cloud_bed_b",
  "universal_soft_pouf_b",
]);

function getRequiredRotations(candidateId: string) {
  const categoryId =
    ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
      candidateId as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
    ];
  const category = ROOM_V3_FURNITURE_CATEGORIES.find((entry) => entry.id === categoryId);
  return category?.requiresDirectionalAssets
    ? (["front", "back", "left", "right"] as const)
    : (["front"] as const);
}

function createCompletePromotionRecord():
  import("../roomV2/roomV3UniversalCorePromotion").RoomV3UniversalCorePromotionRecord {
  const buildIdentity = `git:${"a".repeat(40)}`;
  const evidenceBundleSha256 = `sha256:${"b".repeat(64)}`;
  return {
    artifactRegistry: {
      verifierId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
      artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
      verifiedCandidateIds: [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS],
      verifiedAssetHashesByCandidateId: Object.fromEntries(
        ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((id) => [
          id,
          { ...ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[id] },
        ]),
      ),
    },
    evidenceManifestId: "room-v3-universal-core-test-evidence-manifest",
    simulatorEvidenceId: "simulator-universal-core-v1",
    independentReviewerEvidenceId: "reviewer-universal-core-v1",
    collisionEvidenceId: "collision-universal-core-v1",
    seatingEvidenceId: "seating-universal-core-v1",
    persistenceEvidenceId: "persistence-universal-core-v1",
    skuEvidenceManifest: {
      manifestVersion: ROOM_V3_UNIVERSAL_CORE_EVIDENCE_MANIFEST_VERSION,
      artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
      buildIdentity,
      evidenceVerifierId: UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
      evidenceBundleSha256,
      simulatorDevice: "iPhone 17 Pro iOS 26.4 Simulator",
      simulatorViewport: { width: 390, height: 844, orientation: "portrait" as const },
      rows: ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((candidateId, index) => {
        const rotations = getRequiredRotations(candidateId);
        const simulatorScreenshotEntries = rotations.map((rotation) => [
          rotation,
          `docs/room-v3-qa/universal-core/${candidateId}_${rotation}.png`,
        ] as const);
        const simulatorScreenshotPathByRotation = Object.fromEntries(
          simulatorScreenshotEntries,
        ) as Readonly<Partial<Record<RoomFurnitureRotation, string>>>;
        const simulatorScreenshotPaths = simulatorScreenshotEntries.map(
          ([, screenshotPath]) => screenshotPath,
        );
        return {
        candidateId,
        artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
        scaleSceneEvidenceId: `scale-${index}`,
        perspectiveProfile: ROOM_V3_LOCKED_PERSPECTIVE_PROFILE,
        perspectiveEvidenceId: `perspective-${index}`,
        perspectiveResult: {
          cameraAlignment: "pass" as const,
          surfaceContact: "pass" as const,
          avatarScale: "pass" as const,
          depthOcclusion: "pass" as const,
        },
        depthLaneEvidenceId: `depth-${index}`,
        collisionEvidenceId: `collision-${index}`,
        persistenceEvidenceId: `persistence-${index}`,
        simulatorEvidenceId: `simulator-${index}`,
        independentReviewId: `review-${index}`,
        rotationsReviewed: rotations,
        placementAction: "place in canonical Room V2 mobile shell",
        collisionResult: "pass" as const,
        persistenceResult: "pass" as const,
        ...(seatCandidateIds.has(candidateId)
          ? {
              seatingEvidenceId: `seating-${index}`,
              seatingResult: { contact: "pass" as const, approach: "pass" as const, exit: "pass" as const },
            }
          : {}),
        simulatorScreenshotPaths,
        simulatorScreenshotPathByRotation,
        simulatorScreenshotSha256ByPath: Object.fromEntries(
          simulatorScreenshotPaths.map((screenshotPath, rotationIndex) => [
            screenshotPath,
            `sha256:${(index * 4 + rotationIndex).toString(16).padStart(64, "0")}`,
          ]),
        ),
      };
      }),
    },
    economyPromotion: {
      schemaVersion: UNIVERSAL_CORE_ROOM_PROMOTION_SCHEMA_VERSION,
      buildIdentity,
      evidenceManifestId: "room-v3-universal-core-test-evidence-manifest",
      evidenceVerifierId: UNIVERSAL_CORE_ROOM_EVIDENCE_VERIFIER_ID,
      evidenceBundleSha256,
      artifactManifestId: UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
      candidateSetDigest: UNIVERSAL_CORE_ROOM_CANDIDATE_SET_DIGEST,
      approvedItemIds: [...UNIVERSAL_CORE_ROOM_ITEM_IDS],
    },
  };
}

function createCompletePromotionTrust(
  record: ReturnType<typeof createCompletePromotionRecord>,
) {
  return {
    buildIdentity: record.skuEvidenceManifest.buildIdentity,
    evidenceVerifierId: record.skuEvidenceManifest.evidenceVerifierId,
    evidenceBundleSha256: record.skuEvidenceManifest.evidenceBundleSha256,
  };
}

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

test("R1 Shop hides every unreceipted paid item while retaining its published starter catalog", () => {
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

  assert.ok(r1Catalog.every((item) => item.ownedByDefault));
  assert.ok(products.length > 0);
  assert.ok(products.every((product) => publishedItemIds.has(product.sourceItemId)));
  assert.equal(
    products.some((product) => product.sourceItemId === "avatar_v2_top_cherry_heart_milkmaid_blouse"),
    false,
  );
});

test("a complete shared promotion record makes a Universal Core room product purchasable in the production shop contract", () => {
  const completePromotion = createCompletePromotionRecord();
  const products = buildShopCatalogItems({
    avatar: resolveInitialAvatarV2("avatar_v2_body_default"),
    inventory: {
      coins: 1_250,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [],
      unlockedFeatureIds: [],
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
    roomDecor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: [],
    },
    roomFurnitureCatalog: resolveHistoricalRoomV2QaFurnitureCatalog(
      [completePromotion],
      createCompletePromotionTrust(completePromotion),
    ),
    economyCatalog: resolveEconomyCatalog(completePromotion.economyPromotion),
  });

  const loveseat = products.find(
    (product) => product.sourceItemId === "universal_cloud_loveseat_a",
  );
  assert.ok(loveseat);
  assert.equal(loveseat.sectionId, "room");
  assert.equal(loveseat.owned, false);
  assert.equal(loveseat.actionType, "roomUnlock");
  assert.equal(loveseat.priceCoins, 520);
  assert.equal(loveseat.actionLabel, "Unlock for 520 coins");
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

test("the shared catalog contains the approved 106 premium avatar items", () => {
  const premiumAvatarEntries = Array.from(
    economyCatalogSource.matchAll(
      /avatarItem\(\s*"([^"]+)"\s*,\s*"[^"]+"\s*,\s*(\d+)/g,
    ),
  ).filter((match) => Number(match[2]) > 0);

  // This is a release catalog contract, not a derived expectation. Change it
  // only together with an approved merch expansion and its runtime assets.
  assert.equal(premiumAvatarEntries.length, 106);
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
    "avatar_v2_hair_male_espresso_crop",
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
