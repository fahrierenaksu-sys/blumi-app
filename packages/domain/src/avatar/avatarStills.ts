import manifestJson from "./avatarStillManifest.json";
import { DEFAULT_MALE_AVATAR_LOADOUT } from "./avatarLoadoutCatalog";
import { coerceAvatarLoadout, type AvatarLoadoutCoercionHints } from "./avatarLoadoutCoercion";
import type { AvatarItemRules } from "./avatarItemRules";
import type { AvatarLoadout } from "@blumi/contracts";

/**
 * Baked 2.5D avatar stills (plan 2.2): which pre-rendered layers draw a loadout, in painter's order. Pure and total,
 * shared by the app and (later) the server compositor. The manifest is written by tools/avatar25d/bake-stills.mjs.
 */
export type AvatarStillRigId = "female" | "male";
export type AvatarStillProduct = "full" | "bust";
export type AvatarStillSlot = "shoes" | "bottom" | "top" | "hair";
export type AvatarStillRect = readonly [number, number, number, number];

export interface AvatarStillLayerEntry {
  readonly key: string;
  /** "body", or the canonical item ID. */
  readonly owner: string;
  readonly slot: string;
  readonly order: number;
  readonly seq: number;
  /** Pixels of the layer: canvas px (full) or bust-window px (bust). */
  readonly rect: AvatarStillRect;
  /** The leg layer a body leg (or an item piece on it) is drawn on. */
  readonly leg?: "farLeg" | "nearLeg";
  /** A leg drawing owned by an item: drawn only for this worn-items key ("bottom", "shoes", "bottom+shoes"). */
  readonly legVariant?: string;
  /** A composed leg (legVariant "bottom"): the worn shoes whose own leg drawing gates it (the room renderer's AND). */
  readonly gatedBy?: string;
  /** Drawn from `rect` of a shared sheet `<rig>/<product>/<key>` (composed legs of one bottom), not from its own file. */
  readonly source?: { readonly key: string; readonly rect: AvatarStillRect; readonly sheet: readonly [number, number] };
  /** A body layer that a worn item can draw instead (only on a body with such items): the body range it is. */
  readonly part?: string;
  /** An item's own drawing of the body range `bodyPart`, drawn instead of the body's while it wins (avatarStillBodySwaps). */
  readonly bodyPart?: string;
  /** Such a drawing made for a pair: drawn only while this other item is drawn too. */
  readonly bodyWith?: string;
}

/** A body range an item draws instead of the body's (its `part`), optionally only together with another item. */
export interface AvatarStillBodyClaim {
  readonly part: string;
  readonly with?: string;
}

/** The crops of the one front (showcase) still: Discover card front, chat head, push picture. */
export type AvatarShowcaseCrop = "card" | "head" | "push";

/** The fixed front body every showcase item is registered to (ITEM_SYNC_RULES "Fit in the showcase view"). */
export interface AvatarShowcaseBase {
  readonly key: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly ground: readonly [number, number];
  readonly windows: Readonly<Record<AvatarShowcaseCrop, AvatarStillRect>>;
}

/**
 * An item's front (showcase) layer. Same canonical item ID as its 3/4 art, no separate ID. `order` is the draw order
 * on the showcase base (shoes < bottoms < tops < hair front); `tucked: true` draws a top under the bottom.
 */
export interface AvatarShowcaseItemLayer {
  readonly key: string;
  /** Pixels on the showcase base canvas. */
  readonly rect: AvatarStillRect;
  readonly order: number;
  readonly tucked?: boolean;
  /** A part drawn under the base body (hair behind the head and shoulders); the layer above stays in front. */
  readonly back?: { readonly key: string; readonly rect: AvatarStillRect };
}

export interface AvatarStillItem {
  readonly slot: string;
  readonly rigItemId: string;
  readonly thumb: string;
  /** Optional until the item's front art has passed its gates; missing = the 3/4 fallback. */
  readonly showcase?: AvatarShowcaseItemLayer;
  /**
   * Every body range this item draws instead of the body's, in any pose (black trousers: torso, arms, seated card; a
   * crop top: the bare-belly torso). It decides which item wins a body part, like the room renderer does.
   */
  readonly replaces?: readonly AvatarStillBodyClaim[];
}

export interface AvatarStillBody {
  readonly rigSha256: string;
  readonly sheetHeight: number;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly ground: readonly [number, number];
  readonly windows: { readonly bust: AvatarStillRect; readonly half: AvatarStillRect; readonly full: AvatarStillRect };
  readonly bustPx: number;
  readonly starter: Readonly<Partial<Record<AvatarStillSlot, string>>>;
  readonly items: Readonly<Record<string, AvatarStillItem>>;
  /** Optional: the body's front (showcase) base. A body without it draws every showcase as the 3/4 fallback. */
  readonly showcaseBase?: AvatarShowcaseBase;
  readonly layers: { readonly full: readonly AvatarStillLayerEntry[]; readonly bust: readonly AvatarStillLayerEntry[] };
}

export interface AvatarStillManifest {
  readonly bakerVersion: number;
  readonly supersample: number;
  readonly bodies: Readonly<Record<AvatarStillRigId, AvatarStillBody>>;
}

export const AVATAR_STILL_MANIFEST = manifestJson as unknown as AvatarStillManifest;

/** A drawn layer: its asset `<rig>/<product>/<key>`, where it lands, and the part of the asset drawn (whole if absent). */
export interface AvatarStillLayer {
  readonly asset: string;
  readonly rect: AvatarStillRect;
  /** A part of a shared sheet: its rect in the sheet (same size as `rect`) and the sheet's size, px. */
  readonly source?: { readonly rect: AvatarStillRect; readonly sheet: readonly [number, number] };
}

export interface AvatarStillResolved {
  readonly rig: AvatarStillRigId;
  readonly product: AvatarStillProduct;
  /** Layer asset keys `<rig>/<product>/<key>`, bottom first. */
  readonly layers: readonly AvatarStillLayer[];
  /** The space the rects are in: the body canvas (full) or the bust window (bust). */
  readonly space: { readonly width: number; readonly height: number };
  /** Crop windows in that space (full: bust, half, full; bust: the whole window). */
  readonly windows: AvatarStillBody["windows"];
  readonly mirror: boolean;
  /** Equal looks share one key: bakerVersion|rig|hair|top|bottom|shoes|product|mirror (drawn items). */
  readonly cacheKey: string;
}

export const AVATAR_STILL_SLOT_KEYS: readonly (readonly [AvatarStillSlot, "shoesId" | "bottomId" | "topId" | "hairId"])[] = [
  ["shoes", "shoesId"],
  ["bottom", "bottomId"],
  ["top", "topId"],
  ["hair", "hairId"],
];

/** Which rig draws this body: the male body is the boy, every other body the girl. */
export function avatarStillRigForBody(bodyId: string): AvatarStillRigId {
  return bodyId === DEFAULT_MALE_AVATAR_LOADOUT.bodyId ? "male" : "female";
}

/**
 * Which item each slot draws for a coerced loadout: the worn item when this body has baked art for it in that slot,
 * else the body's starter piece, else nothing. Shared by the 3/4 stills and the front showcase.
 */
export function avatarStillDrawnItems(body: AvatarStillBody, loadout: AvatarLoadout): ReadonlyMap<AvatarStillSlot, string> {
  const drawn = new Map<AvatarStillSlot, string>();
  for (const [slot, key] of AVATAR_STILL_SLOT_KEYS) {
    const worn = loadout[key];
    const own = body.items[worn]?.slot === slot ? worn : undefined;
    const starter = body.starter[slot];
    const item = own ?? (starter && body.items[starter]?.slot === slot ? starter : undefined);
    if (item) drawn.set(slot, item);
  }
  return drawn;
}

/**
 * The item leg drawings drawn for the drawn items, as the room renderer picks them (avatar25Legs.legPlan): a legacy
 * pair drawing when either worn piece owns one (the girl); else the bottom's own drawing gated by the worn shoes (a
 * composed cell); a pair with no baked cell yet draws the bottom's drawing uncut (never the bare legs); one piece
 * alone draws its own drawing.
 */
export function avatarStillLegLayers(
  all: readonly AvatarStillLayerEntry[],
  drawn: ReadonlyMap<AvatarStillSlot, string>,
): readonly AvatarStillLayerEntry[] {
  const bottom = drawn.get("bottom");
  const shoes = drawn.get("shoes");
  const own = (owner: string | undefined, variant: string) =>
    all.filter((entry) => owner !== undefined && entry.owner === owner && entry.legVariant === variant && entry.gatedBy === undefined);
  if (bottom && shoes) {
    const pair = all.filter((entry) => (entry.owner === bottom || entry.owner === shoes) && entry.legVariant === "bottom+shoes");
    if (pair.length > 0) return pair;
    const composed = all.filter((entry) => entry.owner === bottom && entry.legVariant === "bottom" && entry.gatedBy === shoes);
    if (composed.length > 0) return composed;
  }
  const alone = own(bottom, "bottom");
  return alone.length > 0 ? alone : own(shoes, "shoes");
}

const TORSO_PARTS: ReadonlySet<string> = new Set(["torso", "torsoUpper", "torsoNoArms", "torsoSit", "torsoCardArms", "torsoWalk"]);
const SWAP_SLOT_RANK: Readonly<Record<string, number>> = { top: 0, bottom: 1, shoes: 2, hair: 3 };

/** The family a body range is replaced in: one item wins all torso drawings, one both arms, one the seated card. */
function bodySwapFamily(part: string): string {
  if (TORSO_PARTS.has(part)) return "torso";
  return part === "farArm" || part === "nearArm" ? "arms" : part;
}

/**
 * Which drawn item draws each body range instead of the body, exactly as the room renderer picks it (mobile
 * avatar25BodySwap): per family the best claim of the drawn items wins, a pair (whose other item is drawn) over a
 * single item, then top, bottom, shoes, hair, then item ID; the winner replaces exactly the ranges it claims.
 */
export function avatarStillBodySwaps(
  body: AvatarStillBody,
  drawn: ReadonlyMap<AvatarStillSlot, string>,
): ReadonlyMap<string, AvatarStillBodyClaim & { readonly owner: string }> {
  const ids = new Set(drawn.values());
  const winners = new Map<string, { owner: string; with: string | undefined; rank: readonly [number, number, string] }>();
  for (const owner of ids) {
    const item = body.items[owner];
    for (const claim of item?.replaces ?? []) {
      if (claim.with !== undefined && !ids.has(claim.with)) continue;
      const rank = [claim.with !== undefined ? 0 : 1, SWAP_SLOT_RANK[item!.slot] ?? 9, owner] as const;
      const family = bodySwapFamily(claim.part);
      const best = winners.get(family);
      const better = !best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && (rank[1] < best.rank[1] || (rank[1] === best.rank[1] && rank[2] < best.rank[2])));
      if (better) winners.set(family, { owner, with: claim.with, rank });
    }
  }
  const swaps = new Map<string, AvatarStillBodyClaim & { readonly owner: string }>();
  for (const [family, winner] of winners) {
    for (const claim of body.items[winner.owner]!.replaces!) {
      if (bodySwapFamily(claim.part) !== family || claim.with !== winner.with) continue;
      swaps.set(claim.part, { part: claim.part, owner: winner.owner, ...(claim.with !== undefined ? { with: claim.with } : {}) });
    }
  }
  return swaps;
}

/** The layers that draw these items on a body, in painter's order (body, item parts, the chosen leg drawings). */
export function avatarStillLayersFor(
  rig: AvatarStillRigId,
  body: AvatarStillBody,
  drawn: ReadonlyMap<AvatarStillSlot, string>,
  product: AvatarStillProduct,
): readonly AvatarStillLayer[] {
  const all = body.layers[product];
  const owners = new Set(drawn.values());
  const legs = avatarStillLegLayers(all, drawn);
  const replaced = new Set(legs.flatMap((entry) => (entry.leg ? [entry.leg] : [])));
  const swaps = avatarStillBodySwaps(body, drawn);
  const visible = [
    ...all.filter((entry) => {
      if (entry.owner === "body") return !(entry.leg && replaced.has(entry.leg)) && !(entry.part !== undefined && swaps.has(entry.part));
      if (entry.bodyPart !== undefined) {
        const swap = swaps.get(entry.bodyPart);
        return swap !== undefined && swap.owner === entry.owner && swap.with === entry.bodyWith;
      }
      return owners.has(entry.owner) && entry.legVariant === undefined;
    }),
    ...legs,
  ];
  return visible
    .sort((a, b) => a.order - b.order || a.seq - b.seq)
    .map((entry) =>
      entry.source
        ? { asset: `${rig}/${product}/${entry.source.key}`, rect: entry.rect, source: { rect: entry.source.rect, sheet: entry.source.sheet } }
        : { asset: `${rig}/${product}/${entry.key}`, rect: entry.rect },
    );
}

/**
 * The still layers for anyone's loadout. Total: the loadout is coerced first (never throws), then a slot whose item
 * has no baked art for that body is drawn as the body's rig starter piece (draw-only, review R3).
 */
export function resolveAvatarStillLayers(
  rawLoadout: unknown,
  product: AvatarStillProduct,
  options: {
    readonly hints?: AvatarLoadoutCoercionHints;
    readonly mirror?: boolean;
    readonly manifest?: AvatarStillManifest;
    /** The item facts the loadout is coerced with; the live catalog unless a test injects its fixture. */
    readonly rules?: AvatarItemRules;
  } = {},
): AvatarStillResolved {
  const manifest = options.manifest ?? AVATAR_STILL_MANIFEST;
  const loadout = coerceAvatarLoadout(rawLoadout, options.hints ?? {}, options.rules);
  const rig = avatarStillRigForBody(loadout.bodyId);
  const body = manifest.bodies[rig];
  const drawn = avatarStillDrawnItems(body, loadout);
  const mirror = options.mirror === true;
  const space = product === "full" ? body.canvas : { width: body.bustPx, height: body.bustPx };
  const windows =
    product === "full"
      ? body.windows
      : { bust: [0, 0, body.bustPx, body.bustPx] as const, half: [0, 0, body.bustPx, body.bustPx] as const, full: [0, 0, body.bustPx, body.bustPx] as const };
  return {
    rig,
    product,
    layers: avatarStillLayersFor(rig, body, drawn, product),
    space,
    windows,
    mirror,
    cacheKey: [manifest.bakerVersion, rig, ...AVATAR_STILL_SLOT_KEYS.map(([slot]) => drawn.get(slot) ?? "-"), product, mirror ? 1 : 0].join("|"),
  };
}

/** The thumbnail asset key of an item for a body, or null when that body has no baked art for it. */
export function avatarStillThumbAsset(rig: AvatarStillRigId, itemId: string, manifest: AvatarStillManifest = AVATAR_STILL_MANIFEST): string | null {
  const item = manifest.bodies[rig].items[itemId];
  return item ? `${rig}/thumb/${item.thumb}` : null;
}
