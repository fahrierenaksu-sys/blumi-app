import type { EntryAnimationsValues, LayoutAnimationsValues, StyleProps } from "react-native-reanimated"
import { animateTo, resolveMotion } from "../../../ui/motion"

/** How far a new line rises into place (points). Small: a calm arrival, never a pop. */
export const SPEECH_BUBBLE_RISE = 6

/** A Reanimated entering/exiting/layout config: where it starts and what it animates to. */
type BubbleAnimation = { initialValues: StyleProps; animations: StyleProps }

export interface SpeechBubbleMotion {
  entering: (values: EntryAnimationsValues) => BubbleAnimation
  exiting: () => BubbleAnimation
  /** How older lines make room; undefined = they move at once (Reduce Motion). */
  layout: ((values: LayoutAnimationsValues) => BubbleAnimation) | undefined
}

/**
 * One calm, uniform motion for MiniRoom speech bubbles (owner, 2026-10-02:
 * no grow/shrink). A new line fades in while rising a few points, the lines
 * above glide up on the `smooth` spring, and a line leaves with a fade. No
 * scale anywhere. Reduce Motion keeps only the fades. These run as Reanimated
 * layout animations on the UI thread.
 */
export function createSpeechBubbleMotion(reduceMotion: boolean): SpeechBubbleMotion {
  const { fadeIn, fadeOut, smooth } = resolveMotion(reduceMotion)
  const rise = reduceMotion ? 0 : SPEECH_BUBBLE_RISE
  const entering = (_values: EntryAnimationsValues): BubbleAnimation => {
    "worklet"
    return {
      initialValues: { opacity: 0, transform: [{ translateY: rise }] },
      animations: { opacity: animateTo(1, fadeIn), transform: [{ translateY: animateTo(0, smooth) }] }
    }
  }
  const exiting = (): BubbleAnimation => {
    "worklet"
    return { initialValues: { opacity: 1 }, animations: { opacity: animateTo(0, fadeOut) } }
  }
  const layout = reduceMotion ? undefined : (values: LayoutAnimationsValues): BubbleAnimation => {
    "worklet"
    return {
      initialValues: { originX: values.currentOriginX, originY: values.currentOriginY },
      animations: { originX: animateTo(values.targetOriginX, smooth), originY: animateTo(values.targetOriginY, smooth) }
    }
  }
  return { entering, exiting, layout }
}
