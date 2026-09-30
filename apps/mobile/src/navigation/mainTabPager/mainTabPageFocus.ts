/**
 * Per-page focus for pages hosted by the pager.
 *
 * All pages share one native-stack slot route, so the slot's own focus says
 * nothing about which page is on screen. Each page instead receives a
 * navigation object whose `isFocused()` and `focus`/`blur` listeners follow
 * "slot focused AND this page selected". Existing focus-aware code
 * (`useFocusEffect`, `useIsFocused`, `navigation.isFocused()` guards, the
 * Inbox focus refresh, My Room motion lifecycle) therefore pauses on pages
 * that are mounted but not selected, and resumes when they are selected.
 */

type FocusEventType = "focus" | "blur"
type FocusListener = (event: { type: FocusEventType; target: string }) => void

export interface MainTabPageFocusHub {
  isFocused(page: string): boolean
  subscribe(page: string, type: FocusEventType, listener: FocusListener): () => void
  /** Apply a new selection and/or slot focus; emits blur before focus. */
  update(input: { selectedPage: string; slotFocused: boolean }): void
}

export function createMainTabPageFocusHub(
  getTargetKey: (page: string) => string = (page) => page
): MainTabPageFocusHub {
  let focusedPage: string | null = null
  const listeners = new Map<string, Set<{ type: FocusEventType; listener: FocusListener }>>()

  const emit = (page: string, type: FocusEventType) => {
    const pageListeners = listeners.get(page)
    if (!pageListeners) return
    for (const entry of [...pageListeners]) {
      if (entry.type === type) entry.listener({ type, target: getTargetKey(page) })
    }
  }

  return {
    isFocused(page) {
      return focusedPage === page
    },
    subscribe(page, type, listener) {
      let pageListeners = listeners.get(page)
      if (!pageListeners) {
        pageListeners = new Set()
        listeners.set(page, pageListeners)
      }
      const entry = { type, listener }
      pageListeners.add(entry)
      return () => {
        pageListeners.delete(entry)
      }
    },
    update({ selectedPage, slotFocused }) {
      const nextFocused = slotFocused ? selectedPage : null
      if (nextFocused === focusedPage) return
      const previous = focusedPage
      focusedPage = nextFocused
      if (previous !== null) emit(previous, "blur")
      if (nextFocused !== null) emit(nextFocused, "focus")
    }
  }
}

interface SlotNavigationLike {
  isFocused: () => boolean
  addListener: (type: never, listener: never) => () => void
  setParams: (params: never) => void
}

/**
 * Navigation object for one hosted page. Everything delegates to the slot
 * route's navigation except focus, which follows the hub, and `setParams`,
 * which updates the slot only while this page is the selected one (otherwise
 * the page's remembered params are updated locally).
 */
export function createMainTabPageNavigation<Navigation extends SlotNavigationLike>(input: {
  slotNavigation: Navigation
  page: string
  hub: MainTabPageFocusHub
  getSelectedPage: () => string
  setUnselectedPageParams: (page: string, params: object) => void
}): Navigation {
  const { slotNavigation, page, hub, getSelectedPage, setUnselectedPageParams } = input
  const addListener = (type: string, listener: (...args: never[]) => void): (() => void) => {
    if (type === "focus" || type === "blur") {
      return hub.subscribe(page, type, listener as unknown as FocusListener)
    }
    return (slotNavigation.addListener as unknown as (t: string, l: unknown) => () => void)(type, listener)
  }
  return {
    ...slotNavigation,
    isFocused: () => hub.isFocused(page),
    addListener,
    setParams: (params: object) => {
      if (getSelectedPage() === page) {
        (slotNavigation.setParams as unknown as (p: object) => void)(params)
      } else {
        setUnselectedPageParams(page, params)
      }
    }
  } as Navigation
}
