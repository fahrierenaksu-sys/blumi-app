import type {
  NavigationAction,
  ParamListBase,
  Router,
  StackNavigationState
} from "@react-navigation/native"
import { MAIN_TAB_ROUTE_NAMES, type MainTabRouteName } from "./mainTabPagerConfig"

/**
 * Router rules that keep the four main tabs in ONE native-stack slot route
 * while the pager is enabled.
 *
 * The slot route's name is always the selected tab ("Lobby", "Inbox",
 * "MyRoom" or "CosmeticShop"), so every existing route-name based helper
 * (chrome store, bottom-bar selection, deep links, notification routing,
 * `navigate("Inbox")`, `popTo("Lobby", params)`, `replace("MyRoom")`, resets)
 * keeps working. Its key is stable, so the native screen and the pager inside
 * it are never recreated by a tab change:
 *
 * - `BLUMI_MAIN_TAB_PAGER_SELECT` renames the slot in place (the pager's own
 *   commit for taps and swipes). It never pushes or pops.
 * - Any other action whose result holds more than one tab route collapses
 *   them into the slot: the most recently added tab supplies name and params,
 *   detail routes between them are dropped, routes above the newest tab stay.
 * - A result that replaced the slot with a new tab route key reuses the
 *   previous slot key, so `replace("Lobby")` or a reset keeps the pager.
 */
export const MAIN_TAB_PAGER_SELECT_ACTION = "BLUMI_MAIN_TAB_PAGER_SELECT"

export interface MainTabPagerSelectAction {
  type: typeof MAIN_TAB_PAGER_SELECT_ACTION
  payload: { name: MainTabRouteName; params?: object }
  target?: string
}

export function createMainTabPagerSelectAction(
  name: MainTabRouteName,
  params: object | undefined,
  target?: string
): MainTabPagerSelectAction {
  return {
    type: MAIN_TAB_PAGER_SELECT_ACTION,
    payload: params === undefined ? { name } : { name, params },
    ...(target === undefined ? {} : { target })
  }
}

interface RouteLike {
  key?: string
  name: string
  params?: object
  path?: string
}

interface StateLike {
  index?: number
  routes: readonly RouteLike[]
  routeNames?: readonly string[]
}

export function isMainTabRoute(route: { name: string } | undefined): boolean {
  return route !== undefined && (MAIN_TAB_ROUTE_NAMES as readonly string[]).includes(route.name)
}

/** Key of the slot route (the first tab route) in a state, if any. */
export function getMainTabSlotKey(state: StateLike | undefined): string | undefined {
  return state?.routes.find(isMainTabRoute)?.key
}

/**
 * Collapse every tab route of `next` into one slot route. `previous` is the
 * state the action started from; its slot key is reused when possible.
 */
export function collapseMainTabRoutes<S extends StateLike>(
  previous: StateLike | undefined,
  next: S
): S {
  const tabIndices: number[] = []
  next.routes.forEach((route, index) => {
    if (isMainTabRoute(route)) tabIndices.push(index)
  })
  if (tabIndices.length === 0) return next

  const slotIndex = tabIndices[0]!
  const selectedIndex = tabIndices[tabIndices.length - 1]!
  const selected = next.routes[selectedIndex]!
  const previousSlotKey = getMainTabSlotKey(previous)
  const keyStillUsedElsewhere = previousSlotKey !== undefined &&
    next.routes.some((route, index) => route.key === previousSlotKey && !tabIndices.includes(index))
  const slotKey = previousSlotKey !== undefined && !keyStillUsedElsewhere
    ? previousSlotKey
    : next.routes[slotIndex]!.key

  if (tabIndices.length === 1 && selected.key === slotKey) return next

  const collapsed: RouteLike = { ...selected }
  if (slotKey === undefined) delete collapsed.key
  else collapsed.key = slotKey
  const routes = [
    ...next.routes.slice(0, slotIndex),
    collapsed,
    ...next.routes.slice(selectedIndex + 1)
  ]
  const focusedIndex = next.index ?? next.routes.length - 1
  const removed = selectedIndex - slotIndex
  const index = focusedIndex < slotIndex
    ? focusedIndex
    : focusedIndex <= selectedIndex
      ? slotIndex
      : focusedIndex - removed

  return {
    ...next,
    ...(next.index === undefined ? {} : { index }),
    routes
  }
}

/** Rename the slot route in place; null when there is no slot or the name is unknown. */
export function selectMainTabInState<S extends StateLike>(
  state: S,
  action: MainTabPagerSelectAction
): S | null {
  const { name, params } = action.payload
  if (state.routeNames && !state.routeNames.includes(name)) return null
  const slotIndex = state.routes.findIndex(isMainTabRoute)
  if (slotIndex < 0) return null
  const slot = state.routes[slotIndex]!
  if (slot.name === name && slot.params === params) return state
  const renamed: RouteLike = { ...slot, name }
  delete renamed.path
  if (params === undefined) delete renamed.params
  else renamed.params = params
  const routes = state.routes.slice()
  routes[slotIndex] = renamed
  return { ...state, routes }
}

/**
 * `UNSTABLE_router` override for the root native stack. It must stay pure:
 * React Navigation creates the router once per navigator.
 */
export function withMainTabPagerRouter<
  ParamList extends ParamListBase,
  Action extends NavigationAction
>(
  original: Router<StackNavigationState<ParamList>, Action>
): Partial<Router<StackNavigationState<ParamList>, Action>> {
  return {
    getStateForAction(state, action, options) {
      if (action.type === MAIN_TAB_PAGER_SELECT_ACTION) {
        return selectMainTabInState(state, action as unknown as MainTabPagerSelectAction)
      }
      const next = original.getStateForAction(state, action, options)
      return next === null ? null : collapseMainTabRoutes(state, next)
    },
    getRehydratedState(partialState, options) {
      return collapseMainTabRoutes(undefined, original.getRehydratedState(partialState, options))
    },
    getStateForRouteNamesChange(state, options) {
      return collapseMainTabRoutes(state, original.getStateForRouteNamesChange(state, options))
    }
  }
}
