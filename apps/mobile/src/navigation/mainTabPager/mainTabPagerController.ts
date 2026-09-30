import type { BottomNavKey } from "../../ui/bottomNav"

/**
 * The mounted pager registers here so bottom-bar taps use the pager's own
 * selection path (the same one a swipe commits through) instead of a second
 * navigation mechanism. Only one pager exists per navigator.
 */
export interface MainTabPagerController {
  /** Select a page; false when the pager cannot handle it (e.g. a detail route is on top). */
  selectPage(key: BottomNavKey): boolean
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
