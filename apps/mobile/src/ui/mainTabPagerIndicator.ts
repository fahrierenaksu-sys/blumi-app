import { makeMutable } from "react-native-reanimated"
import type { MainTabPagerIndicatorValues } from "./layout/bottomNavIndicatorModel"

/**
 * UI-thread link between the main-page pager and the bottom bar, which are
 * not in the same React subtree (the bar is root chrome above the stack).
 * The pager writes it from a Reanimated reaction while a drag or settle moves
 * the pages; the bar reads it in its own reaction, so the indicator moves in
 * the same frame as the pages without any JS work per frame. One pager exists
 * per navigator; it clears `tracking` when it unmounts.
 *
 * Reactions must reference this object directly in their prepare function:
 * Reanimated subscribes to shared values found in that closure (including
 * plain objects), not to ones reached through a called worklet.
 */
export const mainTabPagerIndicator: MainTabPagerIndicatorValues = {
  progress: makeMutable(0),
  tracking: makeMutable(false),
  selection: makeMutable(-1)
}
