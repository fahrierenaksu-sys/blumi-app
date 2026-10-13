import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "./avatarLoadoutCatalog";
import {
  AVATAR_STILL_MANIFEST,
  avatarStillLayersFor,
  avatarStillThumbAsset,
  resolveAvatarStillLayers,
  type AvatarStillBody,
  type AvatarStillBodyClaim,
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
    const maleItems = AVATAR_STILL_MANIFEST.bodies.male.items;
    assert.ok(still.layers.length > 0 && owners(still.layers).every((owner) => owner === "body" || maleItems[owner] !== undefined));
    assert.ok(owners(still.layers).every((owner) => AVATAR_STILL_MANIFEST.bodies.female.items[owner] === undefined), "no girl item");
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

test("the girl keeps her QA'd pair drawing; only a bottom without a pair drawing has composed (sheet) legs", () => {
  const girl = AVATAR_STILL_MANIFEST.bodies.female;
  // her starter pants own the QA'd pair drawing, so they never need a composed leg; the black trousers do with her sneakers
  const composed = new Set([...girl.layers.full, ...girl.layers.bust].filter((e) => e.gatedBy !== undefined || e.source !== undefined).map((e) => e.owner));
  assert.ok(!composed.has("avatar_v2_bottom_coral_wave_pants"));
  assert.ok([...composed].every((owner) => girl.items[owner]?.slot === "bottom"), [...composed].join());
  const layers = resolveAvatarStillLayers(GIRL_RIG_OUTFIT, "full").layers;
  assert.ok(layers.every((l) => l.source === undefined));
  assert.deepEqual(legAssets(layers).map((l) => l.asset.split("__").pop()), ["bottom-shoes", "bottom-shoes"]);
});

/**
 * A girl-like body whose items draw body ranges instead of the body's (bake-stills: body layers that can be replaced
 * carry `part`, an item's drawing of one `bodyPart`): black trousers (torso, arms, seated card), a crop top (bare-belly
 * torso), a top whose torso drawing is made for one bottom only (a pair) and a hair that claims only an unseen torso.
 */
function swapBody(): AvatarStillBody {
  const entry = (key: string, owner: string, slot: string, order: number, seq: number, extra: Partial<AvatarStillLayerEntry> = {}): AvatarStillLayerEntry =>
    ({ key, owner, slot, order, seq, rect: [0, 0, 10, 10], ...extra });
  const swap = (owner: string, slot: string, part: string, order: number, seq: number, bodyWith?: string) =>
    entry(`${owner}__o${order}__body-${part}${bodyWith ? `-with-${bodyWith}` : ""}`, owner, slot, order, seq, { bodyPart: part, ...(bodyWith ? { bodyWith } : {}) });
  const full = [
    entry("body__o0", "body", "body", 0, 0, { part: "farArm" }), entry("body__o1", "body", "body", 1, 1, { leg: "farLeg" }),
    entry("body__o3", "body", "body", 3, 3, { part: "torso" }), entry("body__o4", "body", "body", 4, 4), entry("body__o5", "body", "body", 5, 5, { part: "nearArm" }),
    entry("trousers__o3p3", "trousers", "bottom", 3.3, 2000), swap("trousers", "bottom", "farArm", 0, 2010), swap("trousers", "bottom", "torso", 3, 2011),
    swap("trousers", "bottom", "nearArm", 5, 2012),
    entry("crop__o3p45", "crop", "top", 3.45, 3000), swap("crop", "top", "torso", 3, 3010),
    entry("polo__o3p45", "polo", "top", 3.45, 3000), swap("polo", "top", "torso", 3, 3010, "skirt"),
    entry("skirt__o3p3", "skirt", "bottom", 3.3, 2000),
    entry("bob__o4p6", "bob", "hair", 4.6, 4000),
  ];
  const item = (id: string, slot: string, replaces?: AvatarStillBodyClaim[]) => [id, { slot, rigItemId: id, thumb: id, ...(replaces ? { replaces } : {}) }] as const;
  const items = Object.fromEntries([
    item("trousers", "bottom", ["torso", "torsoCardArms", "torsoWalk", "farArm", "nearArm", "sit"].map((part) => ({ part }))),
    item("crop", "top", ["torso", "torsoNoArms", "torsoCardArms", "torsoWalk"].map((part) => ({ part }))),
    item("polo", "top", [{ part: "torso", with: "skirt" }]),
    item("skirt", "bottom"),
    // claims only a torso drawing the stand pose never shows; it still wins the torso family over the trousers' (live rule)
    item("bob", "hair", [{ part: "torsoSit", with: "trousers" }]),
  ]);
  return { ...AVATAR_STILL_MANIFEST.bodies.female, items, layers: { full, bust: [] } };
}
const keysOf = (drawn: [AvatarStillSlot, string][]) =>
  avatarStillLayersFor("female", swapBody(), new Map(drawn), "full").map((l) => l.asset.replace("female/full/", ""));

test("an item that draws body ranges is drawn instead of exactly those body layers, at the body's place in the stack", () => {
  assert.deepEqual(keysOf([["bottom", "trousers"]]),
    ["trousers__o0__body-farArm", "body__o1", "trousers__o3__body-torso", "trousers__o3p3", "body__o4", "trousers__o5__body-nearArm"]);
  // nothing drawn replaces the body: its own layers, and no item's body drawing
  assert.deepEqual(keysOf([["bottom", "skirt"]]), ["body__o0", "body__o1", "body__o3", "skirt__o3p3", "body__o4", "body__o5"]);
});

test("each body part is drawn by one item: the top's bare belly wins the torso, the trousers keep the arms", () => {
  const both = keysOf([["top", "crop"], ["bottom", "trousers"]]);
  assert.deepEqual(both, ["trousers__o0__body-farArm", "body__o1", "crop__o3__body-torso", "trousers__o3p3", "crop__o3p45", "body__o4", "trousers__o5__body-nearArm"]);
  // the same look whatever the slot order of the map
  assert.deepEqual(keysOf([["bottom", "trousers"], ["top", "crop"]]), both);
});

test("a drawing made for a pair is drawn only while both items are, and then wins over a single item's", () => {
  assert.ok(keysOf([["top", "polo"], ["bottom", "skirt"]]).includes("polo__o3__body-torso-with-skirt"));
  assert.ok(keysOf([["top", "polo"]]).includes("body__o3"));
  assert.ok(!keysOf([["top", "polo"], ["bottom", "trousers"]]).some((k) => k.startsWith("polo__o3__body")));
  assert.ok(keysOf([["top", "polo"], ["bottom", "trousers"]]).includes("trousers__o3__body-torso"));
});

test("the winner of a body part is chosen from every claim, even one the still never shows (as the room renderer does)", () => {
  // the hair's pair claim on the seated torso wins the torso family, so the trousers' standing torso is not drawn
  const layers = keysOf([["bottom", "trousers"], ["hair", "bob"]]);
  assert.ok(layers.includes("body__o3") && !layers.includes("trousers__o3__body-torso"), layers.join());
  assert.ok(layers.includes("trousers__o0__body-farArm"), "the arms family is the trousers' still");
});
