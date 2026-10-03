import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
 * With `awaitDisplay`, the old look stays fully opaque until the new look
 * reports a drawn layer, or this long: a decode that outlasts the fade would
 * otherwise leave the avatar blank for a moment.
 */
export const AVATAR_TRY_ON_DISPLAY_WAIT_CAP_MS = 350

/**
 * Draws `render(value)` and answers a change of look: the previous look is
 * kept on top for one crossfade and fades out while the new one shows
 * beneath it, and the body hops 0.97 → 1 (bouncy), growing from the feet.
 * Reduce Motion keeps only the crossfade. Two renders per try-on (start and
 * end of the fade); nothing per frame.
 *
 * `awaitDisplay`: `render` receives `onLayerDisplay` as its second argument
 * (wire it to RoomAvatarRenderer2D's prop of the same name) and the old look
 * starts fading out only once the new one has drawn a layer. Callers that do
 * not forward it must leave `awaitDisplay` off, or each swap waits the cap.
 */
export function AvatarTryOnTransition<T extends object>(props: {
  value: T
  render: (value: T, onLayerDisplay?: (layerId: string) => void) => ReactNode
  style?: StyleProp<ViewStyle>
  awaitDisplay?: boolean
}) {
  const { value, render, awaitDisplay = false } = props
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

  const motionRef = useRef(motion)
  useLayoutEffect(() => {
    motionRef.current = motion
  }, [motion])
  // The swap whose fade is waiting for the new look to be drawn, and its cap.
  const pendingFadeRef = useRef<number | null>(null)
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startFade = useCallback((id: number) => {
    if (pendingFadeRef.current !== id) return
    pendingFadeRef.current = null
    if (capTimerRef.current !== null) clearTimeout(capTimerRef.current)
    capTimerRef.current = null
    fade.value = animateTo(0, motionRef.current.crossfade, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(clearOutgoing, id)
    })
  }, [clearOutgoing, fade])
  const handleLayerDisplay = useCallback(() => {
    if (pendingFadeRef.current !== null) startFade(pendingFadeRef.current)
  }, [startFade])
  useEffect(() => () => {
    if (capTimerRef.current !== null) clearTimeout(capTimerRef.current)
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
      if (capTimerRef.current !== null) clearTimeout(capTimerRef.current)
      pendingFadeRef.current = id
      if (awaitDisplay) {
        capTimerRef.current = setTimeout(() => startFade(id), AVATAR_TRY_ON_DISPLAY_WAIT_CAP_MS)
      } else {
        startFade(id)
      }
    }
    if (swap.hop) {
      hop.value = AVATAR_TRY_ON_HOP_FROM_SCALE
      hop.value = animateTo(1, motion.bouncy)
    }
  }, [awaitDisplay, clearOutgoing, fade, hop, key, motion, startFade, value])

  const hopStyle = useAnimatedStyle(() => ({ transform: [{ scale: hop.value }] }))
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))

  return (
    <Animated.View style={[styles.root, props.style, hopStyle]}>
      {render(value, awaitDisplay ? handleLayerDisplay : undefined)}
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
