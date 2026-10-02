import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native"
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type AnimatedRef,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"
import { animateTo, useMotion } from "../motion"
import {
  flightContentOpacity,
  flightLayerScale,
  flightTargetSurfaceOpacity,
  isFlightFrameUsable,
  isFlightFrameVisible,
  mixFlightFrame,
  type FlightFrame
} from "./flightModel"
import {
  flightStore,
  type Flight,
  type FlightRequest,
  type FlightSurface,
  type FlightTarget
} from "./flightStore"

/**
 * One shared-element primitive for the whole app (MOTION_PLAN §C.8).
 *
 * `launchFlight` draws a clone at a measured source frame in this root layer
 * (above every screen, never touchable). The first `FlightTargetView` that
 * claims the flight is hidden, measured on the UI thread, and the clone
 * flies to its frame on a spring: the source surface hands over to the target
 * surface (which morphs the corner radius) and the carried content fades as
 * the target is revealed under it. Only transform and opacity animate, no
 * React renders happen per frame, and the target is tracked live, so a list
 * that shifts during the flight is followed.
 *
 * A flight never blocks anything: without a measurable, visible target it
 * fades out within FLIGHT_TARGET_WAIT_MS and the target simply shows. Under
 * Reduce Motion the clone stays put and crossfades into the target.
 */

/** Longest wait for a target before the clone fades out on its own. */
export const FLIGHT_TARGET_WAIT_MS = 650

interface FlightTargetHandle {
  ref: AnimatedRef<Animated.View>
  opacity: SharedValue<number>
}

export type FlightContentRequest = FlightRequest<ReactNode>

/** Starts a flight from `request.source`; returns its id, or null when the source is unusable. */
export function launchFlight(request: FlightContentRequest): string | null {
  if (!isFlightFrameUsable(request.source)) return null
  return flightStore.launch(request)
}

/** Claims the oldest waiting flight for `channel` + `match` (call once, when the target mounts). */
export function claimFlight(channel: string, match: string): string | null {
  return flightStore.claim(channel, match)
}

/**
 * The landing spot of a claimed flight. Hidden until the clone lands (or the
 * flight is abandoned), then shown in the same frame the clone fades. Render
 * it only for a claimed flight id; it costs one animated style.
 */
export function FlightTargetView({
  flightId,
  style,
  children
}: {
  flightId: string
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const ref = useAnimatedRef<Animated.View>()
  const opacity = useSharedValue(0)
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  useLayoutEffect(() => {
    const target: FlightTarget<FlightTargetHandle> = {
      handle: { ref, opacity },
      reveal: () => {
        opacity.value = 1
      }
    }
    flightStore.attachTarget(flightId, target)
    return () => flightStore.detachTarget(flightId)
  }, [flightId, opacity, ref])
  return (
    <Animated.View ref={ref} style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  )
}

/** Mount once at the app root, above the navigator and below toasts. */
export function FlightLayer() {
  const flights = useSyncExternalStore(flightStore.subscribe, flightStore.getFlights, flightStore.getFlights)
  if (flights.length === 0) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flights.map((flight) => (
        <FlightClone key={flight.id} flight={flight as Flight<ReactNode>} />
      ))}
    </View>
  )
}

const finishFlight = (id: string) => {
  flightStore.finish(id)
}

const settleFlight = (id: string) => {
  flightStore.settle(id)
}

function FlightClone({ flight }: { flight: Flight<ReactNode> }) {
  const motion = useMotion()
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions()
  const { id, source, sourceSurface, targetSurface, content } = flight

  const subscribe = useCallback(
    (listener: () => void) => flightStore.subscribeToFlight(id, listener),
    [id]
  )
  const getTarget = useCallback(
    () => flightStore.getTarget(id) as FlightTarget<FlightTargetHandle> | null,
    [id]
  )
  const target = useSyncExternalStore(subscribe, getTarget, getTarget)
  const targetHandle = target?.handle ?? null

  const [targetSize, setTargetSize] = useState<{ width: number; height: number } | null>(null)
  const progress = useSharedValue(0)
  const cloneOpacity = useSharedValue(1)
  const landing = useSharedValue<FlightFrame | null>(null)

  const abandon = useCallback(() => {
    cloneOpacity.value = animateTo(0, motion.fadeOut, () => {
      "worklet"
      scheduleOnRN(finishFlight, id)
    })
  }, [cloneOpacity, id, motion])

  // No target in time (not on screen, never rendered): fade out, never wait.
  useEffect(() => {
    if (targetSize) return
    const timer = setTimeout(abandon, FLIGHT_TARGET_WAIT_MS)
    return () => clearTimeout(timer)
  }, [abandon, targetSize])

  // Measure the target on the UI thread; an unmeasurable or off-screen target ends the flight.
  useEffect(() => {
    if (!targetHandle) return
    const ref = targetHandle.ref
    const viewport = { width: viewportWidth, height: viewportHeight }
    scheduleOnUI(() => {
      "worklet"
      const measured = measure(ref)
      const frame = measured
        ? { x: measured.pageX, y: measured.pageY, width: measured.width, height: measured.height }
        : null
      if (!frame || !isFlightFrameVisible(frame, viewport)) {
        scheduleOnRN(finishFlight, id)
        return
      }
      landing.value = frame
      scheduleOnRN(setTargetSize, { width: frame.width, height: frame.height })
    })
  }, [id, landing, targetHandle, viewportHeight, viewportWidth])

  // Land once the target surface is laid out at the target's size.
  useEffect(() => {
    if (!targetSize || !targetHandle) return
    const targetOpacity = targetHandle.opacity
    if (motion.reduceMotion) {
      targetOpacity.value = animateTo(1, motion.crossfade)
      cloneOpacity.value = animateTo(0, motion.crossfade, () => {
        "worklet"
        scheduleOnRN(finishFlight, id)
      })
      return
    }
    const fadeOut = motion.fadeOut
    progress.value = animateTo(1, motion.snappy, () => {
      "worklet"
      scheduleOnRN(settleFlight, id)
      // Revealed in the clone's last frame, so nothing blinks.
      targetOpacity.value = 1
      cloneOpacity.value = animateTo(0, fadeOut, () => {
        "worklet"
        scheduleOnRN(finishFlight, id)
      })
    })
  }, [cloneOpacity, id, motion, progress, targetHandle, targetSize])

  const targetRef = targetHandle?.ref ?? null
  // The live frame: follows the target if its list moves during the flight.
  const frame = useDerivedValue<FlightFrame>(() => {
    const landed = landing.value
    if (!landed) return source
    let to = landed
    if (targetRef) {
      const live = measure(targetRef)
      if (live) to = { x: live.pageX, y: live.pageY, width: live.width, height: live.height }
    }
    return mixFlightFrame(source, to, progress.value)
  })

  const containerStyle = useAnimatedStyle(() => ({
    opacity: cloneOpacity.value,
    transform: [{ translateX: frame.value.x }, { translateY: frame.value.y }]
  }))
  const sourceLayerStyle = useAnimatedStyle(() => {
    const scale = flightLayerScale(frame.value, source)
    return {
      opacity: 1 - flightTargetSurfaceOpacity(progress.value),
      transform: [{ scaleX: scale.scaleX }, { scaleY: scale.scaleY }]
    }
  })
  const targetLayerStyle = useAnimatedStyle(() => {
    const base = landing.value ?? source
    const scale = flightLayerScale(frame.value, base)
    return {
      opacity: flightTargetSurfaceOpacity(progress.value),
      transform: [{ scaleX: scale.scaleX }, { scaleY: scale.scaleY }]
    }
  })
  const scaleContent = flight.scaleContent === true
  const contentStyle = useAnimatedStyle(() => {
    if (!scaleContent) return { opacity: flightContentOpacity(progress.value) }
    const scale = flightLayerScale(frame.value, source)
    return {
      opacity: flightContentOpacity(progress.value),
      transform: [{ scaleX: scale.scaleX }, { scaleY: scale.scaleY }]
    }
  })

  return (
    <Animated.View style={[styles.clone, containerStyle]}>
      <Animated.View style={[styles.layer, surfaceStyle(sourceSurface, source), sourceLayerStyle]} />
      {targetSize ? (
        <Animated.View style={[styles.layer, surfaceStyle(targetSurface, targetSize), targetLayerStyle]} />
      ) : null}
      <Animated.View style={[styles.layer, styles.content, { width: source.width, height: source.height }, contentStyle]}>
        {content}
      </Animated.View>
    </Animated.View>
  )
}

function surfaceStyle(surface: FlightSurface, size: { width: number; height: number }): ViewStyle {
  return {
    width: size.width,
    height: size.height,
    borderRadius: surface.radius,
    borderCurve: "continuous",
    backgroundColor: surface.backgroundColor,
    borderColor: surface.borderColor,
    borderWidth: surface.borderWidth ?? 0
  }
}

const styles = StyleSheet.create({
  clone: {
    position: "absolute",
    left: 0,
    top: 0
  },
  layer: {
    position: "absolute",
    left: 0,
    top: 0,
    transformOrigin: "left top"
  },
  content: {
    overflow: "hidden"
  }
})
