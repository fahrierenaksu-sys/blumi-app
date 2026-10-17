import { StyleSheet, View } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue
} from "react-native-reanimated"
import { blumiEntryTheme as uiTheme } from "../../ui/theme"
import { ONBOARDING_SCAN_FRAMES } from "./OnboardingGreetingPair"
import { OnboardingScanLaser, scanBeamY } from "./OnboardingScanLaser"

/** Sweep progress at which the beam crosses the centre of each character row. */
const ROW_PASS_PROGRESS = [0.34, 0.63] as const

const CELL_HEIGHT = 78
const CELL_BORDER = 1
const CHARACTER_HEIGHT = 76
const GRID_GAP = uiTheme.spacing.sm
/** Top of each row's character image, relative to the scan layer's centre. */
const ROW_CHARACTER_TOP = [0, 1].map(
  (row) => -(CELL_HEIGHT * 2 + GRID_GAP) / 2 + row * (CELL_HEIGHT + GRID_GAP) + CELL_BORDER
)
/** Unscanned characters wait as faint silhouettes until the beam reaches them. */
const UNSCANNED_OPACITY = 0.26
const SCANNED_OPACITY = 0.94

interface OnboardingScanStageProps {
  scanRows: SharedValue<number>
  scanSweep: SharedValue<number>
  onAssetLoad?: (id: number) => void
  onAssetError?: () => void
}

export function OnboardingScanStage({
  scanRows,
  scanSweep,
  onAssetLoad,
  onAssetError
}: OnboardingScanStageProps) {
  return (
    <View pointerEvents="none" style={styles.scanLayer} testID="onboarding-scan-stage">
      <View style={styles.scanGrid}>
        {ONBOARDING_SCAN_FRAMES.map((source, index) => (
          <ScanCell
            key={index}
            index={index}
            onAssetError={onAssetError}
            onAssetLoad={onAssetLoad}
            scanRows={scanRows}
            scanSweep={scanSweep}
            source={source}
          />
        ))}
      </View>
      <OnboardingScanLaser
        onError={onAssetError}
        onLoad={onAssetLoad ? () => onAssetLoad(ONBOARDING_SCAN_FRAMES.length) : undefined}
        scanSweep={scanSweep}
      />
    </View>
  )
}

function ScanCell({
  index,
  onAssetError,
  onAssetLoad,
  scanRows,
  scanSweep,
  source
}: {
  index: number
  onAssetError?: () => void
  onAssetLoad?: (id: number) => void
  scanRows: SharedValue<number>
  scanSweep: SharedValue<number>
  source: (typeof ONBOARDING_SCAN_FRAMES)[number]
}) {
  const row = Math.floor(index / 3)
  const column = index % 3
  const pass = ROW_PASS_PROGRESS[row] ?? 1
  const presenceRange = [row * 0.22, Math.min(1, row * 0.22 + 0.42)]
  // Outer columns bounce a beat later so the row reads as a wave, not a block.
  const offset = column === 1 ? 0 : 0.025
  const bounceRange = [pass - 0.1 + offset, pass + offset, pass + 0.14 + offset]
  const glowRange = [pass - 0.08, pass, pass + 0.16]
  const characterTop = ROW_CHARACTER_TOP[row] ?? 0

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanSweep.value, glowRange, [0, 1, 0], Extrapolation.CLAMP)
  }))
  // Each character rises a little as it appears, then gets a soft "hello"
  // bounce when the beam passes its row.
  const liftStyle = useAnimatedStyle(() => {
    const presence = interpolate(scanRows.value, presenceRange, [0, 1], Extrapolation.CLAMP)
    return {
      transform: [
        { translateY: interpolate(presence, [0, 1], [12, 0]) },
        { scale: interpolate(scanSweep.value, bounceRange, [1, 1.07, 1], Extrapolation.CLAMP) }
      ]
    }
  })
  const presenceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanRows.value, presenceRange, [0, 1], Extrapolation.CLAMP)
  }))
  // The beam colours each character exactly where it has passed: the full
  // colour copy is clipped to everything above the beam line.
  const revealStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scanBeamY(scanSweep.value) - characterTop,
      [0, CHARACTER_HEIGHT],
      [0, CHARACTER_HEIGHT],
      Extrapolation.CLAMP
    )
  }))

  return (
    <View style={styles.scanCell}>
      <Animated.View pointerEvents="none" style={[styles.scanCellGlow, glowStyle]} />
      <Animated.View style={[liftStyle, presenceStyle]}>
        <Animated.Image
          onLoad={onAssetLoad ? () => onAssetLoad(index) : undefined}
          onError={onAssetError}
          accessibilityIgnoresInvertColors
          fadeDuration={0}
          resizeMode="contain"
          source={source}
          style={[styles.scanCharacter, styles.unscanned]}
        />
        <Animated.View style={[styles.revealClip, revealStyle]}>
          <Animated.Image
            accessibilityIgnoresInvertColors
            fadeDuration={0}
            resizeMode="contain"
            source={source}
            style={[styles.scanCharacter, styles.scanned]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  scanLayer: {
    width: 286,
    height: 330,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  scanGrid: {
    width: 250,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: GRID_GAP
  },
  scanCell: {
    width: 72,
    height: CELL_HEIGHT,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    borderWidth: CELL_BORDER,
    borderColor: `${uiTheme.colors.primaryDeep}1F`,
    backgroundColor: "rgba(255,255,255,0.44)"
  },
  scanCellGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(232,58,96,0.42)",
    backgroundColor: "rgba(255,226,238,0.55)"
  },
  scanCharacter: {
    width: 56,
    height: CHARACTER_HEIGHT
  },
  unscanned: {
    opacity: UNSCANNED_OPACITY
  },
  revealClip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden"
  },
  scanned: {
    opacity: SCANNED_OPACITY
  }
})
