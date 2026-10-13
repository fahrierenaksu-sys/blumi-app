import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "./avatarLoadoutCatalog";
import {
  AVATAR_STILL_MANIFEST,
  avatarStillLayersFor,
  avatarStillThumbAsset,
  resolveAvatarStillLayers,
  type AvatarStillBody,
  type AvatarStillLayer,
  type AvatarStillLayerEntry,
  type AvatarStillSlot,
} from "./avatarStills";

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

/** Where each shoes' cell sits in a bottom's sheet of composed legs. */
const CELL_Y: Readonly<Record<string, number>> = { shoes_c3: 0, shoes_c2: 12 };

/** A boy wardrobe: two bottoms and two shoes from different outfits, legs drawn per item (factory leg drawings). */
function mixedBoyBody(): AvatarStillBody {
  const entry = (key: string, owner: string, slot: string, order: number, seq: number, extra: Partial<AvatarStillLayerEntry> = {}): AvatarStillLayerEntry =>
    ({ key, owner, slot, order, seq, rect: [0, 0, 10, 10], ...extra });
  const legs = (owner: string, slot: string, variant: string, seq: number, gatedBy?: string) =>
    (["farLeg", "nearLeg"] as const).map((leg, k) =>
      entry(`${owner}__o${k + 1}__${variant}${gatedBy ? `__${gatedBy}` : ""}`, owner, slot, k + 1, seq, {
        leg, legVariant: variant, ...(gatedBy ? { gatedBy, source: { key: `${owner}__o${k + 1}__gated`, rect: [0, CELL_Y[gatedBy]!, 10, 10] as const, sheet: [10, 22] as const } } : {}),
      }));
  const full = [
    entry("body__o1", "body", "body", 1, 0, { leg: "farLeg" }), entry("body__o2", "body", "body", 2, 1, { leg: "nearLeg" }), entry("body__o3", "body", "body", 3, 2),
    entry("bottom_c2__o3", "bottom_c2", "bottom", 3, 2000), entry("bottom_a__o3", "bottom_a", "bottom", 3, 2000),
    entry("shoes_c3__o1", "shoes_c3", "shoes", 1, 1000), entry("shoes_c2__o1", "shoes_c2", "shoes", 1, 1000),
    ...legs("bottom_c2", "bottom", "bottom", 2001), ...legs("bottom_a", "bottom", "bottom", 2001),
    ...legs("shoes_c3", "shoes", "shoes", 1001), ...legs("shoes_c2", "shoes", "shoes", 1001),
    ...legs("bottom_c2", "bottom", "bottom", 2001, "shoes_c3"), ...legs("bottom_c2", "bottom", "bottom", 2001, "shoes_c2"),
    ...legs("bottom_a", "bottom", "bottom", 2001, "shoes_c2"),
  ];
  const items = Object.fromEntries(["bottom_c2", "bottom_a", "shoes_c3", "shoes_c2"].map((id) => [id, { slot: id.split("_")[0]!, rigItemId: id, thumb: id }]));
  return { ...AVATAR_STILL_MANIFEST.bodies.male, items, layers: { full, bust: [] } };
}
/** The leg layers drawn: a body leg band, or an item's leg drawing (`__o<leg>__<variant>`, or a sheet part). */
const legAssets = (layers: readonly AvatarStillLayer[]) => layers.filter((l) => /^body__o[12]$|__o[12]__/.test(l.asset.split("/")[2]!));

test("a boy bottom worn with shoes from another outfit draws the bottom's legs cut by those shoes, never the bare legs", () => {
  const body = mixedBoyBody();
  for (const shoes of ["shoes_c3", "shoes_c2"]) {
    const layers = avatarStillLayersFor("male", body, new Map([["bottom", "bottom_c2"], ["shoes", shoes]]), "full");
    const legs = legAssets(layers);
    assert.deepEqual(legs.map((l) => l.asset), ["male/full/bottom_c2__o1__gated", "male/full/bottom_c2__o2__gated"], shoes);
    assert.ok(legs.every((l) => l.source && l.source.rect[2] === l.rect[2] && l.source.rect[3] === l.rect[3] && l.source.sheet[1] === 22));
    assert.ok(!layers.some((l) => l.asset === "male/full/body__o1" || l.asset === "male/full/body__o2"), "bare legs hidden");
    assert.ok(layers.some((l) => l.asset === `male/full/${shoes}__o1`), "the shoes' own parts are drawn");
    // the cell drawn is the one cut by these shoes, not by the first shoes of the rig
    assert.ok(legs.every((l) => l.source!.rect[1] === CELL_Y[shoes]), shoes);
  }
});

test("a boy pair without a baked cell draws the bottom's legs uncut; one piece alone draws its own legs; neither the bare legs", () => {
  const body = mixedBoyBody();
  const legsOf = (drawn: [string, string][]) => legAssets(avatarStillLayersFor("male", body, new Map(drawn as [AvatarStillSlot, string][]), "full")).map((l) => l.asset);
  assert.deepEqual(legsOf([["bottom", "bottom_a"], ["shoes", "shoes_c3"]]), ["male/full/bottom_a__o1__bottom", "male/full/bottom_a__o2__bottom"]);
  assert.deepEqual(legsOf([["bottom", "bottom_c2"]]), ["male/full/bottom_c2__o1__bottom", "male/full/bottom_c2__o2__bottom"]);
  assert.deepEqual(legsOf([["shoes", "shoes_c3"]]), ["male/full/shoes_c3__o1__shoes", "male/full/shoes_c3__o2__shoes"]);
  assert.deepEqual(legsOf([]), ["male/full/body__o1", "male/full/body__o2"]);
});

test("the girl keeps her QA'd pair drawing and no layer of hers is a sheet part", () => {
  const girl = AVATAR_STILL_MANIFEST.bodies.female;
  assert.ok([...girl.layers.full, ...girl.layers.bust].every((e) => e.gatedBy === undefined && e.source === undefined));
  const layers = resolveAvatarStillLayers(GIRL_RIG_OUTFIT, "full").layers;
  assert.ok(layers.every((l) => l.source === undefined));
  assert.deepEqual(legAssets(layers).map((l) => l.asset.split("__").pop()), ["bottom-shoes", "bottom-shoes"]);
});
