import { useState } from "react"
import type { WardrobeCategoryId } from "../wardrobeCategoryModel"

/** Same cap as the Shop's retained shelves: the shown category plus the one
 * visited just before it. Switching back and forth stays warm; a third
 * category evicts the oldest instead of keeping every visited shelf alive. */
export const MAX_RETAINED_WARDROBE_CATEGORIES = 2

/** Visit order, oldest first, always ending with the shown category. */
export function nextRetainedWardrobeCategories(
  retained: readonly WardrobeCategoryId[],
  activeCategory: WardrobeCategoryId,
  max: number = MAX_RETAINED_WARDROBE_CATEGORIES
): readonly WardrobeCategoryId[] {
  if (retained[retained.length - 1] === activeCategory) return retained
  const visited = [...retained.filter((category) => category !== activeCategory), activeCategory]
  return visited.slice(Math.max(0, visited.length - max))
}

/** The categories whose cards are built and whose shelves stay mounted. The
 * result always contains `activeCategory`, even on the render that adds it. */
export function useRetainedWardrobeCategories(
  activeCategory: WardrobeCategoryId
): readonly WardrobeCategoryId[] {
  const [retained, setRetained] = useState<readonly WardrobeCategoryId[]>(() => [activeCategory])
  const next = nextRetainedWardrobeCategories(retained, activeCategory)
  if (next !== retained) setRetained(next)
  return next
}
