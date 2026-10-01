import { useCallback, useEffect } from "react"
import { useFrameCallback, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"

/**
 * Samples intro frame pacing on the UI thread, where the native-driven intro
 * actually renders. It replaces a JS requestAnimationFrame loop that woke the
 * JS thread every frame just to record a timestamp (MQ-3). Gaps stay on the UI
 * thread until `readFrameGaps` hands them over once, at intro completion.
 */
export function useOnboardingIntroFrameSampler(active: boolean) {
  const frameGaps = useSharedValue<number[]>([])
  const sampler = useFrameCallback((frame) => {
    "worklet"
    const gap = frame.timeSincePreviousFrame
    if (gap === null || !(gap > 0) || gap >= 1_000) return
    frameGaps.modify((gaps) => {
      "worklet"
      gaps.push(gap)
      return gaps
    }, false)
  }, false)

  useEffect(() => {
    sampler.setActive(active)
    return () => sampler.setActive(false)
  }, [active, sampler])

  return useCallback((onRead: (gaps: number[]) => void) => {
    sampler.setActive(false)
    scheduleOnUI(() => {
      "worklet"
      scheduleOnRN(onRead, frameGaps.value.slice())
    })
  }, [frameGaps, sampler])
}
