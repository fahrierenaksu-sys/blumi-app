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

/** The baked manifest with front (showcase) art for the girl: a base and one layer per given item. */
function girlWithShowcase(layers: Readonly<Record<string, { order: number; tucked?: boolean }>>): AvatarStillManifest {
  const female = AVATAR_STILL_MANIFEST.bodies.female;
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
  return { ...AVATAR_STILL_MANIFEST, bodies: { ...AVATAR_STILL_MANIFEST.bodies, female: { ...female, items, showcaseBase } } };
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
    const resolved = resolveShowcaseLayers(deepFreeze(structuredClone(raw)), FULL_FRONT);
    assert.equal(JSON.stringify(raw), before);
    const drawn = resolved.kind === "showcase" ? resolved.layers : resolved.still.layers;
    assert.ok(drawn.length > 0, `nothing drawn for ${JSON.stringify(raw)}`);
  }
  // a girl wearing unknown or legacy items is drawn in her starter outfit, front view
  assert.deepEqual(new Set(frontOwners(resolveShowcaseLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, FULL_FRONT))), new Set(["base", SHOES, BOTTOM, TOP, HAIR]));
});

test("the boy never wears a girl's front layer", () => {
  const resolved = resolveShowcaseLayers({ ...GIRL_OUTFIT, bodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId }, FULL_FRONT);
  assert.equal(resolved.rig, "male");
  const assets = resolved.kind === "showcase" ? resolved.layers : resolved.still.layers;
  assert.ok(assets.every((layer) => layer.asset.startsWith("male/")));
});

test("the front figure is drawn base first, then shoes, bottom, top and hair last", () => {
  assert.deepEqual(frontOwners(resolveShowcaseLayers(GIRL_OUTFIT, FULL_FRONT)), ["base", SHOES, BOTTOM, TOP, HAIR]);
});

test("a tucked top draws under the bottom, an untucked one over it, and hair stays on top either way", () => {
  const tucked = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [TOP]: { order: 3, tucked: true }, [HAIR]: { order: 4 } });
  assert.deepEqual(frontOwners(resolveShowcaseLayers(GIRL_OUTFIT, tucked)), ["base", SHOES, TOP, BOTTOM, HAIR]);
  const untucked = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [TOP]: { order: 3, tucked: false }, [HAIR]: { order: 4 } });
  assert.deepEqual(frontOwners(resolveShowcaseLayers(GIRL_OUTFIT, untucked)), ["base", SHOES, BOTTOM, TOP, HAIR]);
});

test("equal front looks share a cache key that differs from the 3/4 still's", () => {
  const a = resolveShowcaseLayers(GIRL_OUTFIT, FULL_FRONT);
  const b = resolveShowcaseLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, FULL_FRONT);
  assert.equal(a.kind, "showcase");
  assert.equal(b.kind, "showcase");
  if (a.kind !== "showcase" || b.kind !== "showcase") return;
  assert.equal(a.cacheKey, b.cacheKey);
  assert.notEqual(a.cacheKey, resolveAvatarStillLayers(GIRL_OUTFIT, "full").cacheKey);
  assert.deepEqual(Object.keys(a.windows).sort(), ["card", "head", "push"]);
});

test("one worn item without a front layer draws the whole figure as the 3/4 still of the same loadout, never mixed", () => {
  const noTop = girlWithShowcase({ [SHOES]: { order: 1 }, [BOTTOM]: { order: 2 }, [HAIR]: { order: 4 } });
  const resolved = resolveShowcaseLayers(GIRL_OUTFIT, noTop);
  assert.equal(resolved.kind, "fallback");
  if (resolved.kind !== "fallback") return;
  assert.deepEqual(resolved.still, resolveAvatarStillLayers(GIRL_OUTFIT, "full", { manifest: noTop }));
  assert.ok(resolved.still.layers.length > 0);
  assert.ok(resolved.still.layers.every((layer) => !layer.asset.includes("/showcase/")));
});

test("a body without front art falls back to its 3/4 still", () => {
  const resolved = resolveShowcaseLayers(GIRL_OUTFIT, AVATAR_STILL_MANIFEST);
  assert.equal(resolved.kind, "fallback");
  if (resolved.kind !== "fallback") return;
  assert.deepEqual(resolved.still, resolveAvatarStillLayers(GIRL_OUTFIT, "full"));
});
