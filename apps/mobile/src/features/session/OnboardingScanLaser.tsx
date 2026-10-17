import { useCallback, useRef } from "react"
import { StyleSheet } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue
} from "react-native-reanimated"

/** Beam centre, relative to the scan layer's centre, at the start and end of the sweep. */
export const SCAN_BEAM_START_Y = -142
export const SCAN_BEAM_END_Y = 150

const BEAM_WIDTH = 268
const BEAM_HEIGHT = 34
const CURTAIN_HEIGHT = 56

const LASER_TEXTURES = {
  beam: require("./assets/onboarding-scan-laser-v4/scan_laser_beam.png"),
  curtain: require("./assets/onboarding-scan-laser-v4/scan_laser_curtain.png")
} as const
const LASER_TEXTURE_COUNT = Object.keys(LASER_TEXTURES).length

export function scanBeamY(sweep: number) {
  "worklet"
  return interpolate(sweep, [0, 1], [SCAN_BEAM_START_Y, SCAN_BEAM_END_Y])
}

interface OnboardingScanLaserProps {
  scanSweep: SharedValue<number>
  /** Called once every laser texture has loaded. */
  onLoad?: () => void
  onError?: () => void
}

/** One clean line of light with a faint sheet of light trailing behind it. */
export function OnboardingScanLaser({ scanSweep, onLoad, onError }: OnboardingScanLaserProps) {
  const loaded = useRef(new Set<string>())
  const reportLoad = useCallback((key: string) => {
    if (!onLoad || loaded.current.has(key)) return
    loaded.current = new Set([...loaded.current, key])
    if (loaded.current.size === LASER_TEXTURE_COUNT) onLoad()
  }, [onLoad])

  // The beam eases in and out instead of popping at the edges.
  const rigStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanSweep.value, [0, 0.07, 0.9, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: scanBeamY(scanSweep.value) }]
  }))

  return (
    <Animated.View pointerEvents="none" style={[styles.rig, rigStyle]}>
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        onError={onError}
        onLoad={() => reportLoad("curtain")}
        resizeMode="stretch"
        source={LASER_TEXTURES.curtain}
        style={styles.curtain}
      />
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        onError={onError}
        onLoad={() => reportLoad("beam")}
        resizeMode="stretch"
        source={LASER_TEXTURES.beam}
        style={styles.beam}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  rig: {
    position: "absolute",
    width: BEAM_WIDTH,
    height: BEAM_HEIGHT,
    alignItems: "center",
    justifyContent: "center"
  },
  curtain: {
    position: "absolute",
    bottom: BEAM_HEIGHT / 2,
    width: BEAM_WIDTH,
    height: CURTAIN_HEIGHT
  },
  beam: {
    position: "absolute",
    width: BEAM_WIDTH,
    height: BEAM_HEIGHT
  }
})
