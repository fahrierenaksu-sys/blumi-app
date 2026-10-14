import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "./avatarLoadoutCatalog";
import { resolveShowcaseLayers, type AvatarShowcaseResolved } from "./avatarShowcase";
import { AVATAR_STILL_MANIFEST, resolveAvatarStillLayers, type AvatarStillManifest } from "./avatarStills";
import { LEGACY_AVATAR_ITEM_IDS } from "../legacy/legacyItemIds";

const HAIR = "avatar_v2_hair_ink_pageboy_star";
const TOP = "avatar_v2_top_coral_wave_polo";
const BOTTOM = "avatar_v2_bottom_coral_wave_pants";
const SHOES = "avatar_v2_shoes_mint_ribbon_court_sneakers";
const GIRL_OUTFIT = { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: HAIR, topId: TOP, bottomId: BOTTOM, shoesId: SHOES, accessoryIds: [] };

/** The baked manifest as if no body had front art yet: fixtures start here, so real front art is data these tests ignore. */
function withoutFrontArt(manifest: AvatarStillManifest = AVATAR_STILL_MANIFEST): AvatarStillManifest {
  const bodies = Object.fromEntries(
    Object.entries(manifest.bodies).map(([rig, { showcaseBase: _base, ...body }]) => [
      rig,
      { ...body, items: Object.fromEntries(Object.entries(body.items).map(([id, { showcase: _showcase, ...item }]) => [id, item])) },
    ]),
  );
  return { ...manifest, bodies } as unknown as AvatarStillManifest;
}

/** The baked manifest with front (showcase) art for the girl: a base and one layer per given item. */
function girlWithShowcase(
  layers: Readonly<Record<string, { order: number; tucked?: boolean; back?: { key: string; rect: readonly [number, number, number, number] } }>>,
): AvatarStillManifest {
  const bare = withoutFrontArt();
  const female = bare.bodies.female;
  const items = Object.fromEntries(
    Object.entries(female.items).map(([id, item]) => {
      const front = layers[id];
      return [id, front ? { ...item, showcase: { key: `${id}__front`, rect: [0, 0, 600, 1400] as const, ...front } } : item];
    }),
  );
  const showcaseBase = {
    key: "base__front",
    canvas: { width: 600, height: 1440 },
    ground: [300, 1420] as const,
    windows: { card: [0, 0, 600, 1440] as const, head: [150, 0, 300, 300] as const, push: [100, 0, 400, 400] as const },
  };
  return { ...bare, bodies: { ...bare.bodies, female: { ...female, items, showcaseBase } } };
}

const FULL_FRONT = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [TOP]: { order: 3 }, [HAIR]: { order: 4 } });

function frontOwners(resolved: AvatarShowcaseResolved): string[] {
  assert.equal(resolved.kind, "showcase", "expected the front view");
  if (resolved.kind !== "showcase") return [];
  return resolved.layers.map((layer) => layer.asset.split("/")[2]!.split("__")[0]!);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test("anyone's loadout resolves to a front figure and the stored loadout is never changed", () => {
  const legacy = LEGACY_AVATAR_ITEM_IDS.slice(0, 4);
  const loadouts: unknown[] = [
    undefined,
    null,
    "x",
    42,
    {},
    DEFAULT_FEMALE_AVATAR_LOADOUT,
    { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: legacy[0], topId: legacy[1], bottomId: legacy[2], shoesId: legacy[3] },
    { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: "avatar_v2_hair_made_up", topId: "nonsense" },
    { ...GIRL_OUTFIT, bodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId },
    DEFAULT_MALE_AVATAR_LOADOUT,
  ];
  for (const raw of loadouts) {
    const before = JSON.stringify(raw);
    const resolved = resolveShowcaseLayers(deepFreeze(structuredClone(raw)), "card", FULL_FRONT);
    assert.equal(JSON.stringify(raw), before);
    const drawn = resolved.kind === "showcase" ? resolved.layers : resolved.still.layers;
    assert.ok(drawn.length > 0, `nothing drawn for ${JSON.stringify(raw)}`);
  }
  // a girl wearing unknown or legacy items is drawn in her starter outfit, front view
  assert.deepEqual(new Set(frontOwners(resolveShowcaseLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, "card", FULL_FRONT))), new Set(["base", SHOES, BOTTOM, TOP, HAIR]));
});

test("the boy never wears a girl's front layer", () => {
  const resolved = resolveShowcaseLayers({ ...GIRL_OUTFIT, bodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId }, "card", FULL_FRONT);
  assert.equal(resolved.rig, "male");
  const assets = resolved.kind === "showcase" ? resolved.layers : resolved.still.layers;
  assert.ok(assets.every((layer) => layer.asset.startsWith("male/")));
});

test("the front figure is drawn base first, then shoes, bottom, top and hair last", () => {
  assert.deepEqual(frontOwners(resolveShowcaseLayers(GIRL_OUTFIT, "card", FULL_FRONT)), ["base", SHOES, BOTTOM, TOP, HAIR]);
});

test("a tucked top draws under the bottom, an untucked one over it, and hair stays on top either way", () => {
  const tucked = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [TOP]: { order: 3, tucked: true }, [HAIR]: { order: 4 } });
  assert.deepEqual(frontOwners(resolveShowcaseLayers(GIRL_OUTFIT, "card", tucked)), ["base", SHOES, TOP, BOTTOM, HAIR]);
  const untucked = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [TOP]: { order: 3, tucked: false }, [HAIR]: { order: 4 } });
  assert.deepEqual(frontOwners(resolveShowcaseLayers(GIRL_OUTFIT, "card", untucked)), ["base", SHOES, BOTTOM, TOP, HAIR]);
});

test("equal front looks share a cache key that differs from the 3/4 still's", () => {
  const a = resolveShowcaseLayers(GIRL_OUTFIT, "card", FULL_FRONT);
  const b = resolveShowcaseLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, "card", FULL_FRONT);
  assert.equal(a.kind, "showcase");
  assert.equal(b.kind, "showcase");
  if (a.kind !== "showcase" || b.kind !== "showcase") return;
  assert.equal(a.cacheKey, b.cacheKey);
  assert.notEqual(a.cacheKey, resolveAvatarStillLayers(GIRL_OUTFIT, "full").cacheKey);
  assert.deepEqual(Object.keys(a.windows).sort(), ["card", "head", "push"]);
});

test("two crops of the same front look get different cache keys", () => {
  const card = resolveShowcaseLayers(GIRL_OUTFIT, "card", FULL_FRONT);
  const head = resolveShowcaseLayers(GIRL_OUTFIT, "head", FULL_FRONT);
  const push = resolveShowcaseLayers(GIRL_OUTFIT, "push", FULL_FRONT);
  assert.equal(card.kind, "showcase");
  assert.equal(head.kind, "showcase");
  assert.equal(push.kind, "showcase");
  if (card.kind !== "showcase" || head.kind !== "showcase" || push.kind !== "showcase") return;
  assert.equal(new Set([card.cacheKey, head.cacheKey, push.cacheKey]).size, 3);
  assert.deepEqual(head.layers, card.layers);
  assert.deepEqual(resolveShowcaseLayers(GIRL_OUTFIT, "head", FULL_FRONT), head);
});

test("one worn item without a front layer draws the whole figure as the 3/4 still of the same loadout, never mixed", () => {
  const noTop = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [HAIR]: { order: 4 } });
  const resolved = resolveShowcaseLayers(GIRL_OUTFIT, "card", noTop);
  assert.equal(resolved.kind, "fallback");
  if (resolved.kind !== "fallback") return;
  assert.deepEqual(resolved.still, resolveAvatarStillLayers(GIRL_OUTFIT, "full", { manifest: noTop }));
  assert.ok(resolved.still.layers.length > 0);
  assert.ok(resolved.still.layers.every((layer) => !layer.asset.includes("/showcase/")));
});

test("a body without front art falls back to its 3/4 still", () => {
  const bare = withoutFrontArt();
  const resolved = resolveShowcaseLayers(GIRL_OUTFIT, "card", bare);
  assert.equal(resolved.kind, "fallback");
  if (resolved.kind !== "fallback") return;
  assert.deepEqual(resolved.still, resolveAvatarStillLayers(GIRL_OUTFIT, "full", { manifest: bare }));
});

test("a part drawn behind the body (hair back) comes before the base, and only while its item is worn", () => {
  const back = { key: `${HAIR}__back`, rect: [10, 0, 200, 300] as const };
  const manifest = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [TOP]: { order: 3 }, [HAIR]: { order: 4, back } });
  const worn = resolveShowcaseLayers(GIRL_OUTFIT, "card", manifest);
  assert.equal(worn.kind, "showcase");
  if (worn.kind !== "showcase") return;
  assert.deepEqual(worn.layers.map((layer) => layer.asset.split("/")[2]), [`${HAIR}__back`, "base__front", `${SHOES}__front`, `${BOTTOM}__front`, `${TOP}__front`, `${HAIR}__front`]);
  assert.deepEqual(worn.layers[0]!.rect, back.rect);
});

test("the baked manifest's front art is complete: a base with windows inside its canvas, layers inside it, hair back first", () => {
  for (const body of Object.values(AVATAR_STILL_MANIFEST.bodies)) {
    const base = body.showcaseBase;
    if (!base) continue;
    for (const [x, y, w, h] of Object.values(base.windows)) {
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= base.canvas.width && y + h <= base.canvas.height);
    }
    for (const item of Object.values(body.items)) {
      for (const rect of [item.showcase?.rect, item.showcase?.back?.rect]) {
        if (!rect) continue;
        assert.ok(rect[0] >= 0 && rect[1] >= 0 && rect[0] + rect[2] <= base.canvas.width && rect[1] + rect[3] <= base.canvas.height);
      }
    }
  }
});

const SLOT_FIELD = { top: "topId", bottom: "bottomId", shoes: "shoesId", hair: "hairId" } as const;
const DEFAULT_LOOK = { female: DEFAULT_FEMALE_AVATAR_LOADOUT, male: DEFAULT_MALE_AVATAR_LOADOUT } as const;

/** The body's default look wearing one item in its slot. */
function wearing(rig: keyof typeof DEFAULT_LOOK, itemId: string) {
  const slot = AVATAR_STILL_MANIFEST.bodies[rig].items[itemId]!.slot as keyof typeof SLOT_FIELD;
  return { ...DEFAULT_LOOK[rig], [SLOT_FIELD[slot]]: itemId };
}

/** What each drawn layer is: hair back, the base, the body under a piece, or a piece's front. */
function layerKinds(resolved: AvatarShowcaseResolved): string[] {
  assert.equal(resolved.kind, "showcase", "expected the front view");
  if (resolved.kind !== "showcase") return [];
  return resolved.layers.map((layer) => layer.asset.split("/")[2]!.split("__")[1]!);
}

test("every baked item of both bodies is drawn in front view on its body's base, with the body under it", () => {
  for (const rig of ["female", "male"] as const) {
    const body = AVATAR_STILL_MANIFEST.bodies[rig];
    const underSlots = body.showcaseBase?.underSlots ?? [];
    for (const [itemId, item] of Object.entries(body.items)) {
      if (!item.showcase) continue;
      const resolved = resolveShowcaseLayers(wearing(rig, itemId), "card");
      assert.equal(resolved.kind, "showcase", `${rig} ${itemId}: front view`);
      if (resolved.kind !== "showcase") continue;
      const assets = resolved.layers.map((layer) => layer.asset);
      assert.ok(assets.includes(`${rig}/showcase/${item.showcase.key}`), `${rig} ${itemId}: its front layer is drawn`);
      if (underSlots.includes(item.slot as never)) {
        assert.ok(item.showcase.under && assets.includes(`${rig}/showcase/${item.showcase.under.key}`), `${rig} ${itemId}: the body under it is drawn`);
      }
    }
  }
});

test("a mixed look across outfits composes like the factory: hair back, base, the body under each piece, shoes, bottom, top, hair", () => {
  const mix = {
    ...DEFAULT_MALE_AVATAR_LOADOUT,
    hairId: "avatar_v2_hair_male_textured_twists",
    topId: "avatar_v2_top_male_forest_collar_sweater",
    bottomId: "avatar_v2_bottom_male_grey_wide_jeans",
    shoesId: "avatar_v2_shoes_male_cream_chunky_sneakers",
  };
  const resolved = resolveShowcaseLayers(mix, "card");
  assert.deepEqual(layerKinds(resolved), ["back", "front", "under", "under", "under", "front", "front", "front", "front"]);
  assert.deepEqual(frontOwners(resolved), [
    mix.hairId, "base", mix.shoesId, mix.bottomId, mix.topId, mix.shoesId, mix.bottomId, mix.topId, mix.hairId,
  ]);
});

test("a piece whose body-under layer is missing draws the whole 3/4 still instead of a figure with a hole", () => {
  const male = AVATAR_STILL_MANIFEST.bodies.male;
  const topId = DEFAULT_MALE_AVATAR_LOADOUT.topId;
  const top = male.items[topId]?.showcase;
  assert.ok(top?.under, "the baked boy top carries the body under it");
  const { under: _under, ...withoutUnder } = top!;
  const manifest = {
    ...AVATAR_STILL_MANIFEST,
    bodies: { ...AVATAR_STILL_MANIFEST.bodies, male: { ...male, items: { ...male.items, [topId]: { ...male.items[topId]!, showcase: withoutUnder } } } },
  } as AvatarStillManifest;
  const resolved = resolveShowcaseLayers(DEFAULT_MALE_AVATAR_LOADOUT, "card", manifest);
  assert.equal(resolved.kind, "fallback");
  if (resolved.kind === "fallback") assert.equal(resolved.reason, "item-without-showcase");
});

// New item kinds (WB integration/slots_2140 DESIGN §7): the girl's real front base, plus fixture front layers for a
// one-piece dress and glasses (the fixture catalog's items).
import { TEST_AVATAR_ITEM as FX, TEST_AVATAR_ITEM_RULES as FX_RULES } from "./avatarItemRulesFixture";
import { toAvatarLoadoutV2 } from "./avatarLoadoutRules";

function frontManifest(dressUnder: boolean): AvatarStillManifest {
  const girl = AVATAR_STILL_MANIFEST.bodies.female;
  const top = girl.items[girl.starter.top!]!.showcase!;
  const layer = (key: string, order: number, under: boolean) =>
    ({ key, rect: top.rect, order, ...(under && top.under ? { under: { ...top.under, key: `${key}_under` } } : {}) });
  const item = (slot: string, showcase: ReturnType<typeof layer>) => ({ slot, rigItemId: slot, thumb: slot, showcase });
  return {
    ...AVATAR_STILL_MANIFEST,
    bodies: {
      ...AVATAR_STILL_MANIFEST.bodies,
      female: {
        ...girl,
        items: { ...girl.items, [FX.onePieceDress]: item("dress", layer("dress_front", 30, dressUnder)), [FX.paidEyewear]: item("glasses", layer("glasses_front", 35, false)) },
      },
    },
  };
}
const fxLook = (dressId: string | null, accessoryIds: string[] = []) => ({ ...toAvatarLoadoutV2(FX_RULES.starters.female, FX_RULES), dressId, accessoryIds });

test("a front figure in a one-piece dress draws the dress and its under layer instead of the top and the bottom", () => {
  const girl = AVATAR_STILL_MANIFEST.bodies.female;
  const dressed = resolveShowcaseLayers(fxLook(FX.onePieceDress), "card", frontManifest(true), {}, FX_RULES);
  assert.equal(dressed.kind, "showcase");
  const assets = dressed.kind === "showcase" ? dressed.layers.map((l) => l.asset) : [];
  assert.ok(assets.includes("female/showcase/dress_front") && assets.includes("female/showcase/dress_front_under"));
  for (const slot of ["top", "bottom"] as const) {
    assert.ok(!assets.includes(`female/showcase/${girl.items[girl.starter[slot]!]!.showcase!.key}`), slot);
  }
  // without its under layer the erased base would show a hole: the whole figure is the 3/4 still
  assert.equal(resolveShowcaseLayers(fxLook(FX.onePieceDress), "card", frontManifest(false), {}, FX_RULES).kind, "fallback");
});

test("front glasses are added over the look and taking them off restores the exact figure", () => {
  const manifest = frontManifest(true);
  const bare = resolveShowcaseLayers(fxLook(null), "card", manifest, {}, FX_RULES);
  const worn = resolveShowcaseLayers(fxLook(null, [FX.paidEyewear]), "card", manifest, {}, FX_RULES);
  assert.equal(worn.kind, "showcase");
  const assets = (figure: AvatarShowcaseResolved) => (figure.kind === "showcase" ? figure.layers.map((l) => l.asset) : []);
  assert.deepEqual(assets(worn).filter((asset) => !assets(bare).includes(asset)), ["female/showcase/glasses_front"]);
  assert.deepEqual(resolveShowcaseLayers(fxLook(null, []), "card", manifest, {}, FX_RULES), bare);
});
