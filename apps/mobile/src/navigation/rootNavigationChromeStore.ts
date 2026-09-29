import type { BottomNavReturnPreview } from "./bottomNavReturnPreview"

export interface RootNavigationChromeSnapshot {
  navigatorKey?: string
  routeName?: string
  routeKey?: string
  shopMode?: "avatar" | "home"
  previewEditorRouteKey?: string
  returnPreview?: BottomNavReturnPreview
}

let snapshot: RootNavigationChromeSnapshot = Object.freeze({})
const listeners = new Set<() => void>()

export function getRootNavigationChromeSnapshot(): RootNavigationChromeSnapshot {
  return snapshot
}

export function subscribeToRootNavigationChrome(
  listener: () => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishRootNavigationChrome(
  next: RootNavigationChromeSnapshot
): boolean {
  if (
    snapshot.navigatorKey === next.navigatorKey &&
    snapshot.routeName === next.routeName &&
    snapshot.routeKey === next.routeKey &&
    snapshot.shopMode === next.shopMode &&
    snapshot.previewEditorRouteKey === next.previewEditorRouteKey &&
    snapshot.returnPreview?.sourceRouteKey === next.returnPreview?.sourceRouteKey &&
    snapshot.returnPreview?.targetRouteKey === next.returnPreview?.targetRouteKey &&
    snapshot.returnPreview?.targetRouteName === next.returnPreview?.targetRouteName &&
    snapshot.returnPreview?.completed === next.returnPreview?.completed
  ) {
    return false
  }

  snapshot = Object.freeze({
    navigatorKey: next.navigatorKey,
    routeName: next.routeName,
    routeKey: next.routeKey,
    shopMode: next.shopMode,
    previewEditorRouteKey: next.previewEditorRouteKey,
    returnPreview: next.returnPreview ? Object.freeze({ ...next.returnPreview }) : undefined
  })
  for (const listener of listeners) listener()
  return true
}

export function publishRootNavigationChromeReturnPreview(navigatorKey: string, preview: BottomNavReturnPreview): boolean {
  const current = getRootNavigationChromeSnapshot()
  if (current.navigatorKey !== navigatorKey || current.routeKey !== preview.sourceRouteKey) return false
  return publishRootNavigationChrome({ ...current, returnPreview: preview })
}

export function clearRootNavigationChromeReturnPreview(navigatorKey: string, eventRouteKey: string, includeTarget = false): boolean {
  const current = getRootNavigationChromeSnapshot()
  if (current.navigatorKey !== navigatorKey || !current.returnPreview) return false
  if (current.returnPreview.sourceRouteKey !== eventRouteKey &&
    !(includeTarget && current.returnPreview.targetRouteKey === eventRouteKey)) return false
  return publishRootNavigationChrome({ ...current, returnPreview: undefined })
}

export function settleRootNavigationChromeReturnPreview(navigatorKey: string, eventRouteKey: string, closing: boolean): boolean {
  const current = getRootNavigationChromeSnapshot()
  const preview = current.returnPreview
  if (current.navigatorKey !== navigatorKey || !preview ||
    (eventRouteKey !== preview.sourceRouteKey && eventRouteKey !== preview.targetRouteKey)) return false
  if ((eventRouteKey === preview.sourceRouteKey && !closing) || current.routeKey === preview.targetRouteKey) {
    return publishRootNavigationChrome({ ...current, returnPreview: undefined })
  }
  // Native disappearance may precede JS pop. Keep the visual shell until the
  // target route is published; clearing here would hide it between the events.
  return publishRootNavigationChrome({ ...current, returnPreview: { ...preview, completed: true } })
}

export function publishRootNavigationChromeEditorPreview(
  navigatorKey: string,
  previewEditorRouteKey: string | undefined
): boolean {
  const current = getRootNavigationChromeSnapshot()
  if (current.navigatorKey !== navigatorKey) return false
  return publishRootNavigationChrome({ ...current, previewEditorRouteKey })
}
