import { StackActions } from "@react-navigation/native"
import { navigationRef } from "../rootNavigationRef"
import { getRouteBeneathSheets } from "./nativeSheetModel"

/**
 * The screen the user is on, ignoring native sheets presented over it. Root
 * concerns (bottom bar, active conversation, room arrival, leaving a blocked
 * partner's chat) read this instead of `getCurrentRoute()`, so a report sheet
 * over a chat still counts as "in that chat".
 */
export function getRootRouteBeneathSheets(): ReturnType<typeof navigationRef.getCurrentRoute> {
  if (!navigationRef.isReady()) return undefined
  const beneath = getRouteBeneathSheets(navigationRef.getRootState()) as ReturnType<typeof navigationRef.getCurrentRoute>
  return beneath ?? navigationRef.getCurrentRoute()
}

/**
 * Leaves the screen beneath any sheets the way the back button does: the
 * screen and every sheet above it are removed in one step.
 */
export function popRootRouteBeneathSheets(): void {
  if (!navigationRef.isReady()) return
  const state = navigationRef.getRootState()
  const route = getRouteBeneathSheets(state)
  if (!state || !route) {
    navigationRef.goBack()
    return
  }
  const routeIndex = state.routes.findIndex((entry) => entry.key === route.key)
  // Pops the top routes down to and including the screen (a keyed POP would
  // keep the sheets above it).
  navigationRef.dispatch({ ...StackActions.pop(state.index - routeIndex + 1), target: state.key })
}
