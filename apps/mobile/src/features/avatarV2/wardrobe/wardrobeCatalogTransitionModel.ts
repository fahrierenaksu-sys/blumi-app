/**
 * WRD-1: a category change used to paint the new products at full opacity
 * for a frame, then hide them and fade them in (the fade reset ran after
 * the commit). The list now keeps the previous category's cards while they
 * fade out, swaps the data only once they are invisible, then fades in.
 */
export const WARDROBE_CATALOG_FADE_OUT_MS = 90
export const WARDROBE_CATALOG_FADE_IN_MS = 160

export interface WardrobeCatalogFrame<TCard> {
  /** The cards the list draws now. */
  cards: readonly TCard[]
  /** True while the previous category is fading out before the swap. */
  switching: boolean
}

/**
 * Which cards the list draws. The shown category always uses the freshest
 * cards (an equip or a lock change updates at once); a different requested
 * category keeps the last cards of the shown one until the swap.
 */
export function resolveWardrobeCatalogFrame<TCategory, TCard>(input: {
  requestedCategory: TCategory
  shownCategory: TCategory
  cards: readonly TCard[]
  lastShownCards: readonly TCard[]
  reduceMotion: boolean
}): WardrobeCatalogFrame<TCard> {
  if (input.reduceMotion || input.requestedCategory === input.shownCategory) {
    return { cards: input.cards, switching: false }
  }
  return { cards: input.lastShownCards, switching: true }
}
