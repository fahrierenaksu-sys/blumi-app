import { useCallback, useEffect, useRef, useState } from "react"
import { isStillFullyDisplayed, NO_STILL_DISPLAY_RECEIPTS, recordStillLayerDisplay, type StillDisplayReceipts } from "../model/stillDisplayReceipts"

/**
 * Reports once when every layer of a still has displayed (`onDisplay`), and returns the per-layer callback for the
 * images. Receipts are kept in a ref and only the moment the whole still shows renders, so a listener that arrives
 * later (a Discover card promoted to the top, whose layers are already on screen and never display again) still gets
 * its report, and gaining or losing the listener never remounts the layers.
 */
export function useStillDisplayReceipts(scope: string, assets: readonly string[], onDisplay: (() => void) | undefined) {
  const receiptsRef = useRef<StillDisplayReceipts>(NO_STILL_DISPLAY_RECEIPTS)
  const [completedScope, setCompletedScope] = useState<string | null>(null)
  const onLayerDisplay = useCallback((asset: string) => {
    receiptsRef.current = recordStillLayerDisplay(receiptsRef.current, scope, asset)
    if (isStillFullyDisplayed(receiptsRef.current, scope, assets)) setCompletedScope(scope)
  }, [assets, scope])
  const allDisplayed = completedScope === scope
  useEffect(() => {
    if (allDisplayed) onDisplay?.()
  }, [allDisplayed, onDisplay])
  return onLayerDisplay
}
