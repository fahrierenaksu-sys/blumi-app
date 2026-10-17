import { useEffect, useState } from "react"
import { AVATAR_LIVE_BUDGET, type AvatarLiveBudget, type AvatarLiveScope } from "../model/avatarLiveBudget"
import { useIsSurfaceFocused } from "./useIsSurfaceFocused"

/**
 * Whether this caller may show a live canvas now. A caller on the focused screen asks for a full slot; a mounted
 * pager page that is not shown, or a screen behind another, releases it on blur, so the visible surface always
 * owns the canvas. With `keepWhileBlurred` (a room avatar) the blurred caller instead asks for a background slot:
 * it keeps its canvas paused, never at a shown caller's cost, and draws again on the first frame back. `active`
 * adds the caller's own condition (a card showing its back).
 */
export function useAvatarLiveSlot(
  scope: AvatarLiveScope | undefined,
  active: boolean,
  budget: AvatarLiveBudget = AVATAR_LIVE_BUDGET,
  keepWhileBlurred = false
): boolean {
  const [granted, setGranted] = useState(false)
  const isSurfaceFocused = useIsSurfaceFocused()
  const wantsCanvas = active && (isSurfaceFocused || keepWhileBlurred)
  const background = !isSurfaceFocused
  useEffect(() => {
    if (!scope || !wantsCanvas) {
      setGranted(false)
      return undefined
    }
    const token = budget.request(scope, background)
    const sync = () => setGranted(budget.isGranted(token))
    const unsubscribe = budget.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      budget.release(token)
    }
  }, [background, budget, scope, wantsCanvas])
  return granted
}
