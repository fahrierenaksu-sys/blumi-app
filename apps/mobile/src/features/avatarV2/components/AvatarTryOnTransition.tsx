import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { animateTo, useMotion } from "../../../ui/motion"
import {
  AVATAR_TRY_ON_HOP_FROM_SCALE,
  getAvatarTryOnKey,
  resolveAvatarTryOnSwap
} from "./avatarTryOnTransitionModel"

interface Outgoing<T> {
  id: number
  value: T
}

/**
 * Draws `render(value)` and answers a change of look: the previous look is
 * kept on top for one crossfade and fades out while the new one shows
 * beneath it, and the body hops 0.97 → 1 (bouncy), growing from the feet.
 * Reduce Motion keeps only the crossfade. Two renders per try-on (start and
 * end of the fade); nothing per frame.
 */
export function AvatarTryOnTransition<T extends object>(props: {
  value: T
  render: (value: T) => ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { value, render } = props
  const motion = useMotion()
  const key = useMemo(() => getAvatarTryOnKey(value), [value])
  const [outgoing, setOutgoing] = useState<Outgoing<T> | null>(null)
  const previousRef = useRef<{ key: string; value: T } | null>(null)
  const nextIdRef = useRef(0)
  const hop = useSharedValue(1)
  const fade = useSharedValue(0)

  const clearOutgoing = useCallback((id: number) => {
    setOutgoing((current) => (current?.id === id ? null : current))
  }, [])

  useLayoutEffect(() => {
    const previous = previousRef.current
    previousRef.current = { key, value }
    const swap = resolveAvatarTryOnSwap({
      previousKey: previous?.key ?? null,
      nextKey: key,
      reduceMotion: motion.reduceMotion
    })
    if (swap.crossfade && previous) {
      nextIdRef.current += 1
      const id = nextIdRef.current
      setOutgoing({ id, value: previous.value })
      fade.value = 1
      fade.value = animateTo(0, motion.crossfade, (finished) => {
        "worklet"
        if (finished) scheduleOnRN(clearOutgoing, id)
      })
    }
    if (swap.hop) {
      hop.value = AVATAR_TRY_ON_HOP_FROM_SCALE
      hop.value = animateTo(1, motion.bouncy)
    }
  }, [clearOutgoing, fade, hop, key, motion, value])

  const hopStyle = useAnimatedStyle(() => ({ transform: [{ scale: hop.value }] }))
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))

  return (
    <Animated.View style={[styles.root, props.style, hopStyle]}>
      {render(value)}
      {outgoing ? (
        <Animated.View key={outgoing.id} pointerEvents="none" style={[StyleSheet.absoluteFill, fadeStyle]}>
          {render(outgoing.value)}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    transformOrigin: "50% 100%"
  }
})
