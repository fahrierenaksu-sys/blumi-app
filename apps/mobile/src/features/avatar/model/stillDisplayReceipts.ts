/**
 * Display receipts of a still: the layers an `expo-image` has reported on screen for one drawn look (the scope). The
 * whole still counts as displayed once every layer has shown; a different look starts over. Pure and immutable.
 */
export interface StillDisplayReceipts {
  readonly scope: string
  readonly shown: ReadonlySet<string>
}

export const NO_STILL_DISPLAY_RECEIPTS: StillDisplayReceipts = { scope: "", shown: new Set() }

/** Records one layer of `scope`; receipts of any other scope are dropped. */
export function recordStillLayerDisplay(current: StillDisplayReceipts, scope: string, asset: string): StillDisplayReceipts {
  const shown = current.scope === scope ? current.shown : new Set<string>()
  return { scope, shown: new Set([...shown, asset]) }
}

/** True when every layer of `scope` has shown. A still with no layers has nothing to show and never completes. */
export function isStillFullyDisplayed(current: StillDisplayReceipts, scope: string, assets: readonly string[]): boolean {
  return current.scope === scope && assets.length > 0 && assets.every((asset) => current.shown.has(asset))
}
