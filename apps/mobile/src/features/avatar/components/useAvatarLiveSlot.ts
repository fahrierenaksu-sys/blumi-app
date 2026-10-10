import { useEffect, useState } from "react"
import { AVATAR_LIVE_BUDGET, type AvatarLiveBudget, type AvatarLiveScope } from "../model/avatarLiveBudget"
import { useIsSurfaceFocused } from "./useIsSurfaceFocused"

/**
 * Whether this caller may show a live canvas now. Only a caller on the focused screen asks: a mounted pager page
 * that is not shown, or a screen behind another, releases its slot on blur and shows the still, so the visible
 * surface always owns the canvas. `active` adds the caller's own condition (a held MiniRoom fade-in, a card
 * showing its back).
 */
export function useAvatarLiveSlot(scope: AvatarLiveScope | undefined, active: boolean, budget: AvatarLiveBudget = AVATAR_LIVE_BUDGET): boolean {
  const [granted, setGranted] = useState(false)
  const isSurfaceFocused = useIsSurfaceFocused()
  const wantsCanvas = active && isSurfaceFocused
  useEffect(() => {
    if (!scope || !wantsCanvas) {
      setGranted(false)
      return undefined
    }
    const token = budget.request(scope)
    const sync = () => setGranted(budget.isGranted(token))
    const unsubscribe = budget.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      budget.release(token)
    }
  }, [budget, scope, wantsCanvas])
  return granted
}
