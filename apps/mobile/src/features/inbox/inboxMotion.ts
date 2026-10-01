import { LinearTransition, ReduceMotion } from "react-native-reanimated"
import { uiTheme } from "../../ui/theme"

/**
 * A conversation that moves to the top glides there and the rows beneath it
 * slide down, critically damped so nothing overshoots or jumps. The screen
 * passes it only when the shared Reduce Motion preference allows motion, so
 * Reanimated's own check is switched off.
 */
export const INBOX_ROW_LAYOUT = LinearTransition
  .springify(uiTheme.animation.springSnappy.duration)
  .dampingRatio(1)
  .reduceMotion(ReduceMotion.Never)
