import manifestJson from "./avatarStillManifest.json";
import { DEFAULT_MALE_AVATAR_LOADOUT } from "./avatarLoadoutCatalog";
import { coerceAvatarLoadout, type AvatarLoadoutCoercionHints } from "./avatarLoadoutCoercion";
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
}

export interface AvatarStillItem {
  readonly slot: string;
  readonly rigItemId: string;
  readonly thumb: string;
  /** Optional until the item's front art has passed its gates; missing = the 3/4 fallback. */
  readonly showcase?: AvatarShowcaseItemLayer;
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

export interface AvatarStillResolved {
  readonly rig: AvatarStillRigId;
  readonly product: AvatarStillProduct;
  /** Layer asset keys `<rig>/<product>/<key>`, bottom first. */
  readonly layers: readonly { readonly asset: string; readonly rect: AvatarStillRect }[];
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
 * The still layers for anyone's loadout. Total: the loadout is coerced first (never throws), then a slot whose item
 * has no baked art for that body is drawn as the body's rig starter piece (draw-only, review R3).
 */
export function resolveAvatarStillLayers(
  rawLoadout: unknown,
  product: AvatarStillProduct,
  options: { readonly hints?: AvatarLoadoutCoercionHints; readonly mirror?: boolean; readonly manifest?: AvatarStillManifest } = {},
): AvatarStillResolved {
  const manifest = options.manifest ?? AVATAR_STILL_MANIFEST;
  const loadout = coerceAvatarLoadout(rawLoadout, options.hints ?? {});
  const rig = avatarStillRigForBody(loadout.bodyId);
  const body = manifest.bodies[rig];
  const drawn = avatarStillDrawnItems(body, loadout);
  const owners = new Set(drawn.values());
  const legKey = (["bottom", "shoes"] as const).filter((slot) => drawn.has(slot)).join("+");
  const all = body.layers[product];
  const replaced = new Set(
    all.filter((entry) => owners.has(entry.owner) && entry.legVariant === legKey && entry.leg).map((entry) => entry.leg),
  );
  const visible = all.filter((entry) => {
    if (entry.owner === "body") return !(entry.leg && replaced.has(entry.leg));
    if (!owners.has(entry.owner)) return false;
    return entry.legVariant === undefined || entry.legVariant === legKey;
  });
  const mirror = options.mirror === true;
  const space = product === "full" ? body.canvas : { width: body.bustPx, height: body.bustPx };
  const windows =
    product === "full"
      ? body.windows
      : { bust: [0, 0, body.bustPx, body.bustPx] as const, half: [0, 0, body.bustPx, body.bustPx] as const, full: [0, 0, body.bustPx, body.bustPx] as const };
  return {
    rig,
    product,
    layers: [...visible]
      .sort((a, b) => a.order - b.order || a.seq - b.seq)
      .map((entry) => ({ asset: `${rig}/${product}/${entry.key}`, rect: entry.rect })),
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
