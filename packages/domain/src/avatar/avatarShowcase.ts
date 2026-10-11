import { coerceAvatarLoadout, type AvatarLoadoutCoercionHints } from "./avatarLoadoutCoercion";
import {
  AVATAR_STILL_MANIFEST,
  AVATAR_STILL_SLOT_KEYS,
  avatarStillDrawnItems,
  avatarStillRigForBody,
  resolveAvatarStillLayers,
  type AvatarShowcaseBase,
  type AvatarShowcaseCrop,
  type AvatarShowcaseItemLayer,
  type AvatarStillManifest,
  type AvatarStillRect,
  type AvatarStillResolved,
  type AvatarStillRigId,
  type AvatarStillSlot,
} from "./avatarStills";

/**
 * The front (SHOWCASE) still of a loadout (ITEM_SYNC_RULES surface map: every avatar outside the room). Pure and
 * total, shared by the app and the server push picture. Same canonical item IDs as the 3/4 room view.
 */
export interface AvatarShowcaseFront {
  readonly kind: "showcase";
  readonly rig: AvatarStillRigId;
  /** Layer asset keys `<rig>/showcase/<key>` in draw order: parts behind the body, the base, then the front layers. */
  readonly layers: readonly { readonly asset: string; readonly rect: AvatarStillRect }[];
  /** The showcase base canvas the rects are in. */
  readonly space: AvatarShowcaseBase["canvas"];
  /** Crop windows in that space: card, head, push. */
  readonly windows: AvatarShowcaseBase["windows"];
  /** The crop this figure is shown in; its window is `windows[crop]`. */
  readonly crop: AvatarShowcaseCrop;
  /** Equal front looks in the same crop share one key: bakerVersion|rig|hair|top|bottom|shoes|showcase|crop. */
  readonly cacheKey: string;
}

/**
 * The whole figure is the 3/4 still of the same loadout: drawn when the body has no front base or any drawn item has
 * no front layer yet. Never blank, never a mix of front and 3/4 pieces (ITEM_SYNC_RULES "Runtime sync").
 */
export interface AvatarShowcaseFallback {
  readonly kind: "fallback";
  readonly rig: AvatarStillRigId;
  readonly reason: "no-showcase-base" | "item-without-showcase";
  readonly still: AvatarStillResolved;
}

export type AvatarShowcaseResolved = AvatarShowcaseFront | AvatarShowcaseFallback;

interface DrawnFrontLayer {
  readonly slot: AvatarStillSlot;
  readonly layer: AvatarShowcaseItemLayer;
}

/** Draw order from the manifest's `order`; a tucked top moves directly under the bottom it is tucked into. */
function frontDrawOrder(layers: readonly DrawnFrontLayer[]): readonly DrawnFrontLayer[] {
  const sorted = [...layers].sort((a, b) => a.layer.order - b.layer.order);
  const top = sorted.find((entry) => entry.slot === "top");
  const bottomIndex = sorted.findIndex((entry) => entry.slot === "bottom");
  if (!top || top.layer.tucked !== true || bottomIndex < 0 || sorted.indexOf(top) < bottomIndex) return sorted;
  const rest = sorted.filter((entry) => entry !== top);
  const at = rest.findIndex((entry) => entry.slot === "bottom");
  return [...rest.slice(0, at), top, ...rest.slice(at)];
}

/**
 * The front figure for anyone's loadout. The loadout is coerced first (never throws, never written back); each slot
 * draws the worn item or the body's starter, exactly as the 3/4 still does. If any of those has no front layer, the
 * whole figure falls back to the 3/4 still.
 */
export function resolveShowcaseLayers(
  rawLoadout: unknown,
  crop: AvatarShowcaseCrop,
  manifest: AvatarStillManifest = AVATAR_STILL_MANIFEST,
  hints: AvatarLoadoutCoercionHints = {},
): AvatarShowcaseResolved {
  const loadout = coerceAvatarLoadout(rawLoadout, hints);
  const rig = avatarStillRigForBody(loadout.bodyId);
  const body = manifest.bodies[rig];
  const fallback = (reason: AvatarShowcaseFallback["reason"]): AvatarShowcaseFallback => ({
    kind: "fallback",
    rig,
    reason,
    still: resolveAvatarStillLayers(loadout, "full", { manifest }),
  });
  const base = body.showcaseBase;
  if (!base) return fallback("no-showcase-base");
  const drawn = avatarStillDrawnItems(body, loadout);
  const front: DrawnFrontLayer[] = [];
  for (const [slot, itemId] of drawn) {
    const layer = body.items[itemId]?.showcase;
    if (!layer) return fallback("item-without-showcase");
    front.push({ slot, layer });
  }
  const ordered = frontDrawOrder(front);
  const behind = [...front]
    .sort((a, b) => a.layer.order - b.layer.order)
    .flatMap((entry) => (entry.layer.back ? [{ asset: `${rig}/showcase/${entry.layer.back.key}`, rect: entry.layer.back.rect }] : []));
  return {
    kind: "showcase",
    rig,
    layers: [
      ...behind,
      { asset: `${rig}/showcase/${base.key}`, rect: [0, 0, base.canvas.width, base.canvas.height] },
      ...ordered.map((entry) => ({ asset: `${rig}/showcase/${entry.layer.key}`, rect: entry.layer.rect })),
    ],
    space: base.canvas,
    windows: base.windows,
    crop,
    cacheKey: [manifest.bakerVersion, rig, ...AVATAR_STILL_SLOT_KEYS.map(([slot]) => drawn.get(slot) ?? "-"), "showcase", crop].join("|"),
  };
}
