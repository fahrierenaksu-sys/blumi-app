import { createContext, useContext, useEffect } from "react"

/**
 * What sheet content may ask of whatever presents it: an iOS native-stack
 * form sheet (navigation/nativeSheets) or the Android Modal fallback around
 * `SwipeDismissSheet`. Content written against this works in both.
 */
export interface SheetPresentation {
  /**
   * Closes the sheet the same way a swipe does. `afterDismiss` runs once the
   * sheet is gone, so navigation it does lands on the screen, not the sheet.
   */
  close: (afterDismiss?: () => void) => void
  /** False while the sheet must stay open (for example, while submitting). */
  setDismissible: (dismissible: boolean) => void
}

const noop = () => undefined

const DETACHED: SheetPresentation = Object.freeze({
  close: (afterDismiss?: () => void) => {
    afterDismiss?.()
  },
  setDismissible: noop
})

export const SheetPresentationContext = createContext<SheetPresentation>(DETACHED)

export function useSheetPresentation(): SheetPresentation {
  return useContext(SheetPresentationContext)
}

/** Keeps the presenting sheet open while `dismissible` is false. */
export function useSheetDismissible(dismissible: boolean): void {
  const { setDismissible } = useSheetPresentation()
  useEffect(() => {
    setDismissible(dismissible)
  }, [dismissible, setDismissible])
}
