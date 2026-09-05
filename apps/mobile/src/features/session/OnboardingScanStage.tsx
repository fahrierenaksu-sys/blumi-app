import { Animated, StyleSheet, View } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../ui/theme"
import { ONBOARDING_SCAN_FRAMES } from "./OnboardingGreetingPair"

const SCAN_LASER = require(
  "./assets/onboarding-scan-beam-v3-runtime/blumi_scan_laser_v3.png"
)

interface OnboardingScanStageProps {
  scanRows: Animated.Value
  scanSweep: Animated.Value
}

export function OnboardingScanStage({
  scanRows,
  scanSweep
}: OnboardingScanStageProps) {
  const scanLineTranslateY = scanSweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-142, 150]
  })
  // A small irregular pulse sells the optical energy without introducing a
  // separate JS timer or an aggressive repeating flash.
  const laserPulse = scanSweep.interpolate({
    inputRange: [0, 0.18, 0.42, 0.7, 1],
    outputRange: [0.66, 0.88, 0.74, 0.94, 0.78],
    extrapolate: "clamp"
  })

  return (
    <View pointerEvents="none" style={styles.scanLayer} testID="onboarding-scan-stage">
      <View style={styles.scanGrid}>
        {ONBOARDING_SCAN_FRAMES.map((source, index) => {
          const row = Math.floor(index / 3)
          const cellPresence = scanRows.interpolate({
            inputRange: [row * 0.22, Math.min(1, row * 0.22 + 0.42)],
            outputRange: [0, 1],
            extrapolate: "clamp"
          })
          const scanColor = scanSweep.interpolate({
            inputRange: [Math.max(0, row * 0.34), Math.min(1, row * 0.34 + 0.36)],
            outputRange: [0.2, 0.88],
            extrapolate: "clamp"
          })
          const cellOpacity = Animated.multiply(cellPresence, scanColor)
          return (
            <View key={index} style={styles.scanCell}>
              <Animated.Image
                accessibilityIgnoresInvertColors
                fadeDuration={0}
                resizeMode="contain"
                source={source}
                style={[styles.scanCharacter, { opacity: cellOpacity }]}
              />
            </View>
          )
        })}
      </View>
      <Animated.View
        style={[styles.scanLine, { transform: [{ translateY: scanLineTranslateY }] }]}
      >
        <View style={styles.scanTrail} />
        <Animated.Image
          accessibilityIgnoresInvertColors
          resizeMode="stretch"
          source={SCAN_LASER}
          style={[styles.scanLaserImage, { opacity: laserPulse }]}
        />
        <View style={styles.scanGlow} />
        <View style={styles.scanCore} />
        <View style={styles.scanSpecular} />
        <View style={styles.scanEdgeLeft} />
        <View style={styles.scanEdgeRight} />
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
    gap: uiTheme.spacing.sm
  },
  scanCell: {
    width: 72,
    height: 78,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${uiTheme.colors.primaryDeep}1F`,
    backgroundColor: "rgba(255,255,255,0.44)"
  },
  scanCharacter: {
    width: 56,
    height: 76
  },
  scanLine: {
    position: "absolute",
    width: 268,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  // A restrained trail above the moving core gives the eye a clear scan
  // direction without turning the beam into a thick painted stroke.
  scanTrail: {
    position: "absolute",
    top: 0,
    width: 256,
    height: 15,
    borderRadius: 8,
    backgroundColor: "rgba(235, 71, 108, 0.055)"
  },
  scanGlow: {
    position: "absolute",
    width: 264,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(232, 58, 96, 0.16)",
    shadowColor: "#E83A60",
    shadowOpacity: 0.34,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 }
  },
  scanLaserImage: {
    position: "absolute",
    width: 268,
    height: 26
  },
  scanCore: {
    position: "absolute",
    width: 258,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#E83A60"
  },
  scanSpecular: {
    position: "absolute",
    width: 224,
    height: 1,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.82)",
    transform: [{ translateY: -1 }]
  },
  scanEdgeLeft: {
    position: "absolute",
    left: 3,
    width: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(232,58,96,0.48)"
  },
  scanEdgeRight: {
    position: "absolute",
    right: 3,
    width: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(232,58,96,0.48)"
  }
})
