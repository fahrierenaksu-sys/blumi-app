import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming
} from "react-native-reanimated"
import {
  SETUP_MOTION_TIMELINE_MS,
  getOutgoingRetentionMs,
  shouldClearOutgoingForMotionPreference
} from "./setupFlowShellModel"

interface SetupFlowMotionSwapProps {
  children: ReactNode
  transitionKey: string
  reduceMotion: boolean
  kind: "panel" | "stage"
  testID?: string
}

export function SetupFlowMotionSwap({
  children,
  transitionKey,
  reduceMotion,
  kind,
  testID
}: SetupFlowMotionSwapProps) {
  const committed = useRef({ children, transitionKey })
  const [outgoing, setOutgoing] = useState<ReactNode>(null)
  const outgoingProgress = useSharedValue(1)
  const incomingProgress = useSharedValue(1)
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousReduceMotion = useRef(reduceMotion)

  useEffect(() => {
    if (shouldClearOutgoingForMotionPreference(
      previousReduceMotion.current,
      reduceMotion,
      outgoing !== null
    )) {
      if (cleanupTimer.current) clearTimeout(cleanupTimer.current)
      cancelAnimation(outgoingProgress)
      cancelAnimation(incomingProgress)
      outgoingProgress.value = 1
      incomingProgress.value = 1
      setOutgoing(null)
    }
    previousReduceMotion.current = reduceMotion
  }, [incomingProgress, outgoing, outgoingProgress, reduceMotion])

  useEffect(() => () => {
    if (cleanupTimer.current) clearTimeout(cleanupTimer.current)
    cancelAnimation(outgoingProgress)
    cancelAnimation(incomingProgress)
  }, [incomingProgress, outgoingProgress])

  useLayoutEffect(() => {
    if (committed.current.transitionKey === transitionKey) {
      committed.current = { children, transitionKey }
      return
    }

    if (cleanupTimer.current) clearTimeout(cleanupTimer.current)
    setOutgoing(committed.current.children)
    committed.current = { children, transitionKey }
    outgoingProgress.value = 0
    incomingProgress.value = 0

    if (reduceMotion) {
      outgoingProgress.value = withTiming(1, {
        duration: SETUP_MOTION_TIMELINE_MS.reduced,
        easing: Easing.linear
      })
      incomingProgress.value = withTiming(1, {
        duration: SETUP_MOTION_TIMELINE_MS.reduced,
        easing: Easing.linear
      })
    } else if (kind === "panel") {
      outgoingProgress.value = withTiming(1, {
        duration: SETUP_MOTION_TIMELINE_MS.oldPanelEnd,
        easing: Easing.out(Easing.cubic)
      })
      incomingProgress.value = withDelay(
        SETUP_MOTION_TIMELINE_MS.newPanelStart,
        withTiming(1, {
          duration:
            SETUP_MOTION_TIMELINE_MS.newPanelEnd -
            SETUP_MOTION_TIMELINE_MS.newPanelStart,
          easing: Easing.out(Easing.cubic)
        })
      )
    } else {
      outgoingProgress.value = withDelay(
        SETUP_MOTION_TIMELINE_MS.stageStart,
        withTiming(1, {
          duration:
            SETUP_MOTION_TIMELINE_MS.stageEnd -
            SETUP_MOTION_TIMELINE_MS.stageStart,
          easing: Easing.inOut(Easing.cubic)
        })
      )
      incomingProgress.value = withDelay(
        SETUP_MOTION_TIMELINE_MS.stageStart,
        withTiming(1, {
          duration:
            SETUP_MOTION_TIMELINE_MS.stageEnd -
            SETUP_MOTION_TIMELINE_MS.stageStart,
          easing: Easing.inOut(Easing.cubic)
        })
      )
    }

    cleanupTimer.current = setTimeout(
      () => setOutgoing(null),
      getOutgoingRetentionMs(reduceMotion)
    )
  }, [
    children,
    incomingProgress,
    kind,
    outgoingProgress,
    reduceMotion,
    transitionKey
  ])

  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: 1 - outgoingProgress.value,
    transform: [{
      translateY: reduceMotion || kind === "stage"
        ? 0
        : 12 * outgoingProgress.value
    }]
  }))
  const incomingStyle = useAnimatedStyle(() => ({
    opacity: incomingProgress.value,
    transform: [{
      translateY: reduceMotion || kind === "stage"
        ? 0
        : 10 * (1 - incomingProgress.value)
    }]
  }))

  return (
    <View style={styles.root} testID={testID}>
      {outgoing ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.outgoing, outgoingStyle]}
        >
          {outgoing}
        </Animated.View>
      ) : null}
      <Animated.View style={incomingStyle}>{children}</Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    width: "100%"
  },
  outgoing: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1
  }
})
