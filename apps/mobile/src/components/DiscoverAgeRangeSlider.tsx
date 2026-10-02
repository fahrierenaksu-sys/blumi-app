import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, View, type LayoutChangeEvent } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Reanimated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import {
  DISCOVERY_MAXIMUM_AGE,
  DISCOVERY_MINIMUM_AGE
} from "../features/discovery/discoveryFiltersModel"
import {
  getDiscoveryAgeAtSliderOffset,
  getDiscoveryAgeSliderOffset,
  resolveDiscoveryAgeEdge,
  type DiscoveryAgeEdge
} from "../features/discovery/discoveryFiltersSheetModel"
import { uiTheme } from "../ui/theme"

const THUMB_SIZE = 28
const THUMB_TARGET = 44
const TRACK_HEIGHT = 4
const AGE_ADJUST_ACTIONS = [{ name: "increment" }, { name: "decrement" }]

interface DiscoverAgeRangeSliderProps {
  ageMin: number
  ageMax: number
  minimumAccessibilityLabel: string
  maximumAccessibilityLabel: string
  /** Called once per whole-year change, never per frame. */
  onChange: (edge: DiscoveryAgeEdge, age: number) => void
}

/**
 * Two-thumb age range slider. The thumbs follow the finger on the UI thread
 * and snap to whole years; JS hears only when a year changes. There is no
 * animation of its own, so Reduce Motion needs no other path: the thumbs move
 * only under the finger (direct manipulation). VoiceOver: each thumb is one
 * adjustable element (swipe up or down to change it by a year).
 */
export function DiscoverAgeRangeSlider(props: DiscoverAgeRangeSliderProps) {
  const { ageMin, ageMax, minimumAccessibilityLabel, maximumAccessibilityLabel, onChange } = props
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  const emitMin = useCallback((age: number) => onChangeRef.current("min", age), [])
  const emitMax = useCallback((age: number) => onChangeRef.current("max", age), [])

  const [trackWidth, setTrackWidth] = useState(0)
  const width = useSharedValue(0)
  const minOffset = useSharedValue(0)
  const maxOffset = useSharedValue(0)
  const minAge = useSharedValue(ageMin)
  const maxAge = useSharedValue(ageMax)
  // 0: idle, 1: dragging the minimum thumb, 2: dragging the maximum thumb.
  const dragging = useSharedValue(0)
  const dragStart = useSharedValue(0)

  // Ages set from outside (open, Reset, VoiceOver) place the thumbs; a thumb
  // under the finger is left to the gesture.
  useLayoutEffect(() => {
    width.value = trackWidth
    if (dragging.value !== 1) {
      minAge.value = ageMin
      minOffset.value = getDiscoveryAgeSliderOffset(ageMin, trackWidth)
    }
    if (dragging.value !== 2) {
      maxAge.value = ageMax
      maxOffset.value = getDiscoveryAgeSliderOffset(ageMax, trackWidth)
    }
  }, [ageMax, ageMin, dragging, maxAge, maxOffset, minAge, minOffset, trackWidth, width])

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width)
  }, [])

  const minGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-18, 18])
    .onStart(() => {
      "worklet"
      dragging.value = 1
      dragStart.value = minOffset.value
    })
    .onUpdate((event) => {
      "worklet"
      const age = resolveDiscoveryAgeEdge(
        "min",
        getDiscoveryAgeAtSliderOffset(dragStart.value + event.translationX, width.value),
        maxAge.value
      )
      minOffset.value = getDiscoveryAgeSliderOffset(age, width.value)
      if (age !== minAge.value) {
        minAge.value = age
        scheduleOnRN(emitMin, age)
      }
    })
    .onFinalize(() => {
      "worklet"
      dragging.value = 0
    }), [dragStart, dragging, emitMin, maxAge, minAge, minOffset, width])

  const maxGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-18, 18])
    .onStart(() => {
      "worklet"
      dragging.value = 2
      dragStart.value = maxOffset.value
    })
    .onUpdate((event) => {
      "worklet"
      const age = resolveDiscoveryAgeEdge(
        "max",
        getDiscoveryAgeAtSliderOffset(dragStart.value + event.translationX, width.value),
        minAge.value
      )
      maxOffset.value = getDiscoveryAgeSliderOffset(age, width.value)
      if (age !== maxAge.value) {
        maxAge.value = age
        scheduleOnRN(emitMax, age)
      }
    })
    .onFinalize(() => {
      "worklet"
      dragging.value = 0
    }), [dragStart, dragging, emitMax, maxAge, maxOffset, minAge, width])

  const fillStyle = useAnimatedStyle(() => ({
    left: minOffset.value,
    width: Math.max(0, maxOffset.value - minOffset.value)
  }))
  // When both thumbs meet, the one that can still move away from its edge is
  // on top, so a range pinned at either end can always be opened again.
  const minThumbStyle = useAnimatedStyle(() => ({
    zIndex: minOffset.value > width.value / 2 ? 3 : 2,
    transform: [{ translateX: minOffset.value }]
  }))
  const maxThumbStyle = useAnimatedStyle(() => ({
    zIndex: minOffset.value > width.value / 2 ? 2 : 3,
    transform: [{ translateX: maxOffset.value }]
  }))

  const adjust = (edge: DiscoveryAgeEdge, actionName: string) => {
    const current = edge === "min" ? ageMin : ageMax
    const next = resolveDiscoveryAgeEdge(
      edge,
      current + (actionName === "increment" ? 1 : -1),
      edge === "min" ? ageMax : ageMin
    )
    if (next !== current) onChange(edge, next)
  }

  return (
    <View style={styles.container}>
      <View style={styles.track} onLayout={handleTrackLayout}>
        <View style={styles.trackRail} pointerEvents="none" />
        <Reanimated.View style={[styles.trackFill, fillStyle]} pointerEvents="none" />
        <GestureDetector gesture={minGesture}>
          <Reanimated.View
            style={[styles.thumbTarget, minThumbStyle]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={minimumAccessibilityLabel}
            accessibilityValue={{ min: DISCOVERY_MINIMUM_AGE, max: DISCOVERY_MAXIMUM_AGE, now: ageMin, text: String(ageMin) }}
            accessibilityActions={AGE_ADJUST_ACTIONS}
            onAccessibilityAction={(event) => adjust("min", event.nativeEvent.actionName)}
          >
            <View style={styles.thumb} />
          </Reanimated.View>
        </GestureDetector>
        <GestureDetector gesture={maxGesture}>
          <Reanimated.View
            style={[styles.thumbTarget, maxThumbStyle]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={maximumAccessibilityLabel}
            accessibilityValue={{ min: DISCOVERY_MINIMUM_AGE, max: DISCOVERY_MAXIMUM_AGE, now: ageMax, text: String(ageMax) }}
            accessibilityActions={AGE_ADJUST_ACTIONS}
            onAccessibilityAction={(event) => adjust("max", event.nativeEvent.actionName)}
          >
            <View style={styles.thumb} />
          </Reanimated.View>
        </GestureDetector>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // The track is inset by half a thumb so both thumbs stay inside the card.
  container: {
    paddingHorizontal: THUMB_SIZE / 2,
  },
  track: {
    height: THUMB_TARGET,
    justifyContent: "center",
  },
  trackRail: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: uiTheme.colors.secondaryPressed,
  },
  trackFill: {
    position: "absolute",
    top: (THUMB_TARGET - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: uiTheme.colors.primary,
  },
  // 44 pt touch target centred on the thumb's offset.
  thumbTarget: {
    position: "absolute",
    top: 0,
    left: -THUMB_TARGET / 2,
    width: THUMB_TARGET,
    height: THUMB_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    ...uiTheme.shadow.float,
  },
})
