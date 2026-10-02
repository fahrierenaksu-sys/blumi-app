import type { DiscoveryFilters, DiscoveryGender } from "@blumi/contracts"
import {
  DEFAULT_DISCOVERY_FILTERS,
  DISCOVERY_MAXIMUM_AGE,
  DISCOVERY_MINIMUM_AGE
} from "./discoveryFiltersModel"

// Pure rules behind the Discover filters sheet (components/DiscoverFiltersBottomSheet.tsx).
// The sheet edits only who you see (audience) and the age range. Anything else
// stored in the filters, such as legacy vibes, passes through untouched so a
// save never deletes data the sheet no longer shows. Functions marked
// 'worklet' run inside the age slider's pan gesture on the UI thread; they are
// plain functions under node:test.

/** "Show me": everyone, or one gender. */
export type DiscoveryAudience = "everyone" | DiscoveryGender

export const DISCOVERY_AUDIENCE_OPTIONS: readonly DiscoveryAudience[] = ["everyone", "woman", "man"]

export type DiscoveryAgeEdge = "min" | "max"

/**
 * The segment that matches stored genders. No gender and both genders show
 * the same people (Discover only lists women and men), so both read as
 * "everyone".
 */
export function getDiscoveryAudience(genders: readonly DiscoveryGender[]): DiscoveryAudience {
  const unique = new Set(genders)
  if (unique.size !== 1) return "everyone"
  return [...unique][0] ?? "everyone"
}

/** Horizontal space (pt) the sheet spends around the "Show me" segments. */
const AUDIENCE_SEGMENT_CHROME = 2 * 20 + 2 * 15 + 2 * 3 + 2 * 3
/** Inter Bold 13 pt: average glyph advance as a share of the font size. */
const AUDIENCE_LABEL_ADVANCE = 0.58
const AUDIENCE_LABEL_SIZE = 13
const AUDIENCE_LABEL_PADDING = 2 * 6 + 4

/**
 * The three "Show me" segments share one row only while the longest label
 * fits its segment at the current text size; otherwise the sheet lists them
 * one per row, so large Dynamic Type never clips or breaks a word.
 */
export function shouldStackDiscoveryAudience(input: {
  windowWidth: number
  fontScale: number
  longestLabelLength: number
}): boolean {
  const fontScale = Number.isFinite(input.fontScale) && input.fontScale > 0 ? input.fontScale : 1
  const segmentWidth = (input.windowWidth - AUDIENCE_SEGMENT_CHROME) / DISCOVERY_AUDIENCE_OPTIONS.length
  const labelWidth = input.longestLabelLength * AUDIENCE_LABEL_SIZE * AUDIENCE_LABEL_ADVANCE * fontScale
  return !(segmentWidth > 0) || labelWidth + AUDIENCE_LABEL_PADDING > segmentWidth
}

export function withDiscoveryAudience(
  filters: DiscoveryFilters,
  audience: DiscoveryAudience
): DiscoveryFilters {
  if (getDiscoveryAudience(filters.genders) === audience) return filters
  return { ...filters, genders: audience === "everyone" ? [] : [audience] }
}

export function clampDiscoveryAge(age: number): number {
  "worklet"
  if (!Number.isFinite(age)) return DISCOVERY_MINIMUM_AGE
  return Math.max(DISCOVERY_MINIMUM_AGE, Math.min(DISCOVERY_MAXIMUM_AGE, Math.round(age)))
}

/**
 * Moves one end of the age range. An end never crosses the other one; the two
 * may meet (a single age).
 */
export function resolveDiscoveryAgeEdge(
  edge: DiscoveryAgeEdge,
  age: number,
  otherAge: number
): number {
  "worklet"
  const clamped = clampDiscoveryAge(age)
  return edge === "min" ? Math.min(clamped, otherAge) : Math.max(clamped, otherAge)
}

export function withDiscoveryAgeEdge(
  filters: DiscoveryFilters,
  edge: DiscoveryAgeEdge,
  age: number
): DiscoveryFilters {
  if (edge === "min") {
    const ageMin = resolveDiscoveryAgeEdge("min", age, filters.ageMax)
    return ageMin === filters.ageMin ? filters : { ...filters, ageMin }
  }
  const ageMax = resolveDiscoveryAgeEdge("max", age, filters.ageMin)
  return ageMax === filters.ageMax ? filters : { ...filters, ageMax }
}

/** Reset clears what the sheet shows and keeps everything it does not show. */
export function resetVisibleDiscoveryFilters(filters: DiscoveryFilters): DiscoveryFilters {
  return {
    ...filters,
    ageMin: DEFAULT_DISCOVERY_FILTERS.ageMin,
    ageMax: DEFAULT_DISCOVERY_FILTERS.ageMax,
    genders: []
  }
}

/** Whether Reset would change anything the sheet shows. */
export function hasVisibleDiscoveryFilterChanges(filters: DiscoveryFilters): boolean {
  return filters.ageMin !== DEFAULT_DISCOVERY_FILTERS.ageMin ||
    filters.ageMax !== DEFAULT_DISCOVERY_FILTERS.ageMax ||
    getDiscoveryAudience(filters.genders) !== "everyone"
}

/** "18–99", or a single age when both ends meet. */
export function formatDiscoveryAgeRange(ageMin: number, ageMax: number): string {
  return ageMin === ageMax ? String(ageMin) : `${ageMin}–${ageMax}`
}

/** Horizontal offset (px) of an age's thumb centre on a track `width` wide. */
export function getDiscoveryAgeSliderOffset(age: number, width: number): number {
  "worklet"
  if (!(width > 0)) return 0
  const span = DISCOVERY_MAXIMUM_AGE - DISCOVERY_MINIMUM_AGE
  return ((clampDiscoveryAge(age) - DISCOVERY_MINIMUM_AGE) / span) * width
}

/** The whole age nearest to a thumb offset (px) on a track `width` wide. */
export function getDiscoveryAgeAtSliderOffset(offset: number, width: number): number {
  "worklet"
  if (!(width > 0) || !Number.isFinite(offset)) return DISCOVERY_MINIMUM_AGE
  const fraction = Math.max(0, Math.min(1, offset / width))
  return clampDiscoveryAge(
    DISCOVERY_MINIMUM_AGE + fraction * (DISCOVERY_MAXIMUM_AGE - DISCOVERY_MINIMUM_AGE)
  )
}
