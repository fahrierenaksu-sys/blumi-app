import { useEffect, useState } from "react"
import { AVATAR_LIVE_BUDGET, type AvatarLiveBudget, type AvatarLiveScope } from "../model/avatarLiveBudget"

/**
 * Whether this caller may show a live canvas now. `active` must be false whenever the caller is not focused or not
 * shown (an unfocused pager page, a screen behind another): the slot is released and the still shows instead.
 */
export function useAvatarLiveSlot(scope: AvatarLiveScope | undefined, active: boolean, budget: AvatarLiveBudget = AVATAR_LIVE_BUDGET): boolean {
  const [granted, setGranted] = useState(false)
  useEffect(() => {
    if (!scope || !active) {
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
  }, [active, budget, scope])
  return granted
}
