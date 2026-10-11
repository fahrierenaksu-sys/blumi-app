import {
  resolveShowcaseLayers,
  type AvatarLoadoutCoercionHints,
  type AvatarShowcaseCrop,
  type AvatarShowcaseFallback
} from "@blumi/domain"
import { placeStillLayers, type AvatarStillCrop, type AvatarStillFrame } from "./avatarStillLayout"

/** Why a whole figure is drawn as today's 3/4 still instead of the front view. */
export type AvatarShowcaseFallbackReason = AvatarShowcaseFallback["reason"] | "missing-asset"

/** The front (showcase) figure placed in a box: every layer bundled, base first, in draw order. */
export interface AvatarShowcaseFrontPlan {
  readonly kind: "showcase"
  readonly cacheKey: string
  readonly frames: readonly AvatarStillFrame[]
}

/** The whole figure as the 3/4 still of the same loadout (lead decision: never a mix of front and 3/4 pieces). */
export interface AvatarShowcaseStillPlan {
  readonly kind: "still"
  readonly reason: AvatarShowcaseFallbackReason
  readonly stillCrop: AvatarStillCrop
}

export type AvatarShowcasePlan = AvatarShowcaseFrontPlan | AvatarShowcaseStillPlan

export interface AvatarShowcaseBox {
  readonly width: number
  readonly height: number
}

/** The 3/4 crop that stands in for a front crop: the card shows the whole figure, the head crops the bust. */
export function avatarShowcaseFallbackCrop(crop: AvatarShowcaseCrop): AvatarStillCrop {
  return crop === "card" ? "full" : "bust"
}

export interface PlanAvatarShowcaseOptions {
  readonly hints?: AvatarLoadoutCoercionHints
  /** The bundled layer sources by `<rig>/<product>/<key>`; a front layer missing here draws the 3/4 still instead. */
  readonly assets: Readonly<Record<string, unknown>>
  /** Defaults to the baked manifest; tests pass one with front art. */
  readonly manifest?: Parameters<typeof resolveShowcaseLayers>[2]
}

/**
 * What an `AvatarShowcase` draws for anyone's loadout in a crop: the front stack, or the whole 3/4 still when the
 * resolver falls back or a front layer is not bundled. Pure and total; never throws, never changes the loadout.
 */
export function planAvatarShowcase(
  loadout: unknown,
  crop: AvatarShowcaseCrop,
  box: AvatarShowcaseBox,
  options: PlanAvatarShowcaseOptions
): AvatarShowcasePlan {
  const resolved = resolveShowcaseLayers(loadout, crop, options.manifest, options.hints)
  const stillCrop = avatarShowcaseFallbackCrop(crop)
  if (resolved.kind === "fallback") return { kind: "still", reason: resolved.reason, stillCrop }
  if (resolved.layers.some((layer) => options.assets[layer.asset] === undefined)) {
    return { kind: "still", reason: "missing-asset", stillCrop }
  }
  return { kind: "showcase", cacheKey: resolved.cacheKey, frames: placeStillLayers(resolved.layers, resolved.windows[crop], box).frames }
}

const MAX_CACHED_PLANS = 64

/**
 * Remembers front plans by the resolver's cache key (which names the crop) and the box, so equal looks on many cards
 * share one frozen plan and the layers keep their identity across renders. Bounded: the oldest entry is dropped.
 */
export function createAvatarShowcasePlanCache(limit: number = MAX_CACHED_PLANS) {
  const plans = new Map<string, AvatarShowcaseFrontPlan>()
  return function cachedPlan(
    loadout: unknown,
    crop: AvatarShowcaseCrop,
    box: AvatarShowcaseBox,
    options: PlanAvatarShowcaseOptions
  ): AvatarShowcasePlan {
    const plan = planAvatarShowcase(loadout, crop, box, options)
    if (plan.kind !== "showcase") return plan
    const key = `${plan.cacheKey}@${box.width}x${box.height}`
    const cached = plans.get(key)
    if (cached) return cached
    if (plans.size >= limit) {
      const oldest = plans.keys().next().value
      if (oldest !== undefined) plans.delete(oldest)
    }
    const frozen = Object.freeze({ ...plan, frames: Object.freeze(plan.frames.map((frame) => Object.freeze({ ...frame }))) })
    plans.set(key, frozen)
    return frozen
  }
}
