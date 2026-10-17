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
const CURTAIN_HEIGHT = 92
const HOTSPOT_SIZE = 46
const EMITTER_SIZE = 26
const MOTE_SIZE = 9
/** Hotspot travel from the beam centre; the beam tapers to points past this. */
const HOTSPOT_REACH = 96
/** Horizontal positions of the light motes that drift off the beam. */
const MOTE_OFFSETS = [-104, -71, -38, -9, 22, 49, 80, 108] as const

const LASER_TEXTURES = {
  beam: require("./assets/onboarding-scan-laser-v4/scan_laser_beam.png"),
  curtain: require("./assets/onboarding-scan-laser-v4/scan_laser_curtain.png"),
  flare: require("./assets/onboarding-scan-laser-v4/scan_laser_flare.png")
} as const
const LASER_TEXTURE_COUNT = 4 // beam, curtain, hotspot and the emitter pair's first flare

export function scanBeamY(sweep: number) {
  "worklet"
  return interpolate(sweep, [0, 1], [SCAN_BEAM_START_Y, SCAN_BEAM_END_Y])
}

/** Visibility of the whole laser: eases in and out instead of popping at the edges. */
function laserPresence(sweep: number) {
  "worklet"
  return interpolate(sweep, [0, 0.07, 0.9, 1], [0, 1, 1, 0], Extrapolation.CLAMP)
}

/** Two detuned sines give a light, irregular shimmer without a second clock. */
function shimmer(sweep: number, depth: number) {
  "worklet"
  return 1 - depth + depth * (0.5 + 0.3 * Math.sin(sweep * 71) + 0.2 * Math.sin(sweep * 173 + 1.3))
}

interface OnboardingScanLaserProps {
  scanSweep: SharedValue<number>
  /** Called once every laser texture has loaded. */
  onLoad?: () => void
  onError?: () => void
}

export function OnboardingScanLaser({ scanSweep, onLoad, onError }: OnboardingScanLaserProps) {
  const loaded = useRef(new Set<string>())
  const reportLoad = useCallback((key: string) => {
    if (!onLoad || loaded.current.has(key)) return
    loaded.current = new Set([...loaded.current, key])
    if (loaded.current.size === LASER_TEXTURE_COUNT) onLoad()
  }, [onLoad])

  const rigStyle = useAnimatedStyle(() => ({
    opacity: laserPresence(scanSweep.value),
    transform: [{ translateY: scanBeamY(scanSweep.value) }]
  }))
  const beamStyle = useAnimatedStyle(() => ({
    opacity: shimmer(scanSweep.value, 0.14),
    transform: [{ scaleY: 0.94 + 0.08 * shimmer(scanSweep.value, 1) }]
  }))
  // The light sheet behind the beam is faint at first and fills in as the scan
  // builds up, so the first frames read as a beam switching on.
  const curtainStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanSweep.value, [0, 0.2, 0.85, 1], [0, 0.9, 1, 0.4], Extrapolation.CLAMP)
  }))
  // A hotspot glides along the beam twice, like a scanning head.
  const hotspotStyle = useAnimatedStyle(() => ({
    opacity: shimmer(scanSweep.value, 0.25),
    transform: [
      { translateX: HOTSPOT_REACH * Math.sin(scanSweep.value * Math.PI * 2.5 - Math.PI / 2) },
      { scale: 0.9 + 0.2 * shimmer(scanSweep.value, 1) }
    ]
  }))
  const emitterStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * shimmer(scanSweep.value, 1),
    transform: [{ scale: 0.85 + 0.3 * shimmer(scanSweep.value + 0.4, 1) }]
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
        style={[styles.curtain, curtainStyle]}
      />
      {MOTE_OFFSETS.map((offset, index) => (
        <LaserMote index={index} key={offset} offset={offset} scanSweep={scanSweep} />
      ))}
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        onError={onError}
        onLoad={() => reportLoad("beam")}
        resizeMode="stretch"
        source={LASER_TEXTURES.beam}
        style={[styles.beam, beamStyle]}
      />
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        onError={onError}
        onLoad={() => reportLoad("hotspot")}
        source={LASER_TEXTURES.flare}
        style={[styles.hotspot, hotspotStyle]}
      />
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        onError={onError}
        onLoad={() => reportLoad("emitter")}
        source={LASER_TEXTURES.flare}
        style={[styles.emitter, styles.emitterLeft, emitterStyle]}
      />
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        source={LASER_TEXTURES.flare}
        style={[styles.emitter, styles.emitterRight, emitterStyle]}
      />
    </Animated.View>
  )
}

/** A speck of light that lifts off the beam into the scanned area and fades. */
function LaserMote({
  index,
  offset,
  scanSweep
}: {
  index: number
  offset: number
  scanSweep: SharedValue<number>
}) {
  const style = useAnimatedStyle(() => {
    const cycle = scanSweep.value * 3.2 + index * 0.37
    const phase = cycle - Math.floor(cycle)
    return {
      opacity: Math.sin(Math.PI * phase) * 0.85,
      transform: [
        { translateX: offset + Math.sin(cycle * 4.1) * 3 },
        { translateY: -phase * 24 },
        { scale: 1 - phase * 0.5 }
      ]
    }
  })
  return (
    <Animated.Image
      accessibilityIgnoresInvertColors
      fadeDuration={0}
      source={LASER_TEXTURES.flare}
      style={[styles.mote, style]}
    />
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
  },
  hotspot: {
    position: "absolute",
    width: HOTSPOT_SIZE,
    height: HOTSPOT_SIZE
  },
  emitter: {
    position: "absolute",
    width: EMITTER_SIZE,
    height: EMITTER_SIZE
  },
  emitterLeft: {
    left: 14 - EMITTER_SIZE / 2
  },
  emitterRight: {
    right: 14 - EMITTER_SIZE / 2
  },
  mote: {
    position: "absolute",
    width: MOTE_SIZE,
    height: MOTE_SIZE
  }
})
