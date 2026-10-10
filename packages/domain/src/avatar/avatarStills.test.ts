import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "./avatarLoadoutCatalog";
import { AVATAR_STILL_MANIFEST, avatarStillThumbAsset, resolveAvatarStillLayers } from "./avatarStills";

const GIRL_RIG_OUTFIT = {
  ...DEFAULT_FEMALE_AVATAR_LOADOUT,
  hairId: "avatar_v2_hair_ink_pageboy_star",
  topId: "avatar_v2_top_coral_wave_polo",
  bottomId: "avatar_v2_bottom_coral_wave_pants",
  shoesId: "avatar_v2_shoes_mint_ribbon_court_sneakers",
  accessoryIds: [],
};
const owners = (layers: readonly { asset: string }[]) => layers.map((layer) => layer.asset.split("/")[2]!.split("__")[0]);

test("the girl's rig outfit is drawn from her body bands and her four items, bottom layer first", () => {
  const still = resolveAvatarStillLayers(GIRL_RIG_OUTFIT, "full");
  assert.equal(still.rig, "female");
  assert.deepEqual(new Set(owners(still.layers)), new Set(["body", "avatar_v2_hair_ink_pageboy_star", "avatar_v2_top_coral_wave_polo",
    "avatar_v2_bottom_coral_wave_pants", "avatar_v2_shoes_mint_ribbon_court_sneakers"]));
  const orders = still.layers.map((layer) => AVATAR_STILL_MANIFEST.bodies.female.layers.full.find((e) => `female/full/${e.key}` === layer.asset)!.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  assert.ok(still.layers.every((layer) => layer.asset.startsWith("female/full/")));
});

test("the bare legs follow what is worn: trousers and shoes replace the body's legs with their own leg drawing", () => {
  const legs = (loadout: unknown) => resolveAvatarStillLayers(loadout, "full").layers.map((l) => l.asset).filter((a) => /__o[12](__|$)/.test(a.split("/")[2]!));
  const both = legs(GIRL_RIG_OUTFIT);
  assert.ok(both.every((asset) => asset.endsWith("__bottom-shoes")), both.join())
  assert.equal(both.length, 2);
});

test("anyone's loadout resolves, however strange, and an item without baked art draws as the body's rig starter", () => {
  const starter = resolveAvatarStillLayers(GIRL_RIG_OUTFIT, "full").layers;
  for (const raw of [undefined, null, "x", 42, {}, DEFAULT_FEMALE_AVATAR_LOADOUT, { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: "avatar_v2_hair_made_up" }]) {
    assert.deepEqual(resolveAvatarStillLayers(raw, "full").layers, starter, JSON.stringify(raw));
  }
});

test("the boy is drawn from his own body and never wears a girl's item", () => {
  for (const raw of [DEFAULT_MALE_AVATAR_LOADOUT, { ...GIRL_RIG_OUTFIT, bodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId }]) {
    const still = resolveAvatarStillLayers(raw, "full");
    assert.equal(still.rig, "male");
    assert.ok(still.layers.length > 0 && owners(still.layers).every((owner) => owner === "body"));
  }
  assert.equal(resolveAvatarStillLayers({}, "bust", { hints: { gender: "man" } }).rig, "male");
});

test("the bust is the same look in its own 256 px window; mirroring is a flag; equal looks share a cache key", () => {
  const bust = resolveAvatarStillLayers(GIRL_RIG_OUTFIT, "bust");
  assert.deepEqual(bust.space, { width: 256, height: 256 });
  assert.ok(bust.layers.every((layer) => layer.asset.startsWith("female/bust/") && layer.rect[0] + layer.rect[2] <= 256 && layer.rect[1] + layer.rect[3] <= 256));
  assert.equal(owners(bust.layers).includes("avatar_v2_shoes_mint_ribbon_court_sneakers"), false, "shoes are outside the bust");
  const mirrored = resolveAvatarStillLayers(GIRL_RIG_OUTFIT, "bust", { mirror: true });
  assert.equal(mirrored.mirror, true);
  assert.deepEqual(mirrored.layers, bust.layers);
  assert.notEqual(mirrored.cacheKey, bust.cacheKey);
  // today's default girl wears old items without art: she is drawn exactly as the rig outfit, so the key is shared
  assert.equal(resolveAvatarStillLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, "bust").cacheKey, bust.cacheKey);
});

test("thumbnails exist for items with baked art on that body only", () => {
  assert.equal(avatarStillThumbAsset("female", "avatar_v2_top_coral_wave_polo"), "female/thumb/avatar_v2_top_coral_wave_polo");
  assert.equal(avatarStillThumbAsset("male", "avatar_v2_top_coral_wave_polo"), null);
  assert.equal(avatarStillThumbAsset("female", "avatar_v2_top_made_up"), null);
});
