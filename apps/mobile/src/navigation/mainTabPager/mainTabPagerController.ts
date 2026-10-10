import type { BottomNavKey } from "../../ui/bottomNav"

/**
 * The mounted pager registers here so bottom-bar taps use the pager's own
 * selection path (the same one a swipe commits through) instead of a second
 * navigation mechanism. Only one pager exists per navigator.
 */
export interface MainTabPagerController {
  /** Select a page; false when the pager cannot handle it (e.g. a detail route is on top). */
  selectPage(key: BottomNavKey): boolean
  /** Whether the pager is showing this page right now (its own view, which can lag the navigation route). */
  isPageShown?(key: BottomNavKey): boolean
}

let activeController: MainTabPagerController | null = null

export function registerMainTabPagerController(controller: MainTabPagerController): () => void {
  activeController = controller
  return () => {
    if (activeController === controller) activeController = null
  }
}

export function requestMainTabPagerPage(key: BottomNavKey): boolean {
  return activeController?.selectPage(key) ?? false
}

/**
 * Whether a tap on this tab is a reselect of the page the pager shows. True too when no pager is registered, so the
 * rollback path keeps deciding by the navigation route alone.
 */
export function isMainTabPagerShowingPage(key: BottomNavKey): boolean {
  return activeController?.isPageShown?.(key) ?? true
}
