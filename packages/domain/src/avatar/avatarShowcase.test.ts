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
