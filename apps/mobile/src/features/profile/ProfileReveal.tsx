import type { ReactNode } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated"
import { useReducedMotion } from "../../ui/animations"
import { getProfileSectionEntranceDelay } from "./profileMotionModel"

/**
 * One section of the profile page rising into place after the hero, staggered
 * by its index. The layout animation runs on the UI thread; Reduce Motion is
 * decided from the shared store and shows the section at once.
 */
export function ProfileReveal(props: {
  index: number
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const delay = getProfileSectionEntranceDelay(props.index, reduceMotion)
  const entering = delay === null
    ? undefined
    : FadeInDown.delay(delay).springify().damping(18).stiffness(160).reduceMotion(ReduceMotion.Never)
  return (
    <Animated.View entering={entering} style={props.style}>
      {props.children}
    </Animated.View>
  )
}
