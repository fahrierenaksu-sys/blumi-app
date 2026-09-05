import { useEffect, useRef } from "react"
import { Animated, Easing, Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { blumiEntryTheme, uiTheme } from "./theme"
import { LinearGradient } from "./linearGradient"
import { useReducedMotion } from "./animations"

type BackgroundVariant = "lobby" | "bootstrap" | "register" | "miniRoom" | "premiumMesh" | "homeLiquid"

const homeLiquidBackground = require("../../assets/ui/home-liquid-background-v2.png")
const registerBackground = require("../../assets/ui/register-blush-to-white-background-v1.png")

interface SoftBlobBackgroundProps {
  variant?: BackgroundVariant
  style?: StyleProp<ViewStyle>
  animated?: boolean
}

interface BlobSpec {
  size: number
  color: string
  top?: number
  left?: number
  right?: number
  bottom?: number
  opacity: number
}

const blobConfig: Record<BackgroundVariant, { baseColors: string[]; blobs: BlobSpec[] }> = {
  lobby: {
    baseColors: [uiTheme.colors.background, uiTheme.colors.backgroundWarm, uiTheme.colors.background],
    blobs: [
      { size: 380, color: uiTheme.colors.blobPink, top: -150, right: -130, opacity: 0.5 },
      { size: 300, color: uiTheme.colors.blobLilac, top: 260, left: -130, opacity: 0.4 },
      { size: 340, color: uiTheme.colors.blobPeach, bottom: -170, right: -110, opacity: 0.3 },
      { size: 200, color: uiTheme.colors.blobMint, bottom: 120, left: 60, opacity: 0.25 },
    ]
  },
  bootstrap: {
    baseColors: [
      blumiEntryTheme.colors.backgroundWarm,
      blumiEntryTheme.colors.surfaceSoft,
      blumiEntryTheme.colors.backgroundWarm
    ],
    blobs: [
      { size: 440, color: blumiEntryTheme.colors.blobPink, top: -160, left: -130, opacity: 0.55 },
      { size: 360, color: blumiEntryTheme.colors.blobPeach, top: 120, right: -170, opacity: 0.45 },
      { size: 320, color: blumiEntryTheme.colors.blobLilac, bottom: -130, left: -100, opacity: 0.4 },
    ]
  },
  register: {
    baseColors: ["#FCE8F0", "#FFF6F8", "#FFFFFF"],
    blobs: [
      { size: 500, color: "rgba(247,196,207,0.46)", top: -220, left: -150, opacity: 1 },
      { size: 360, color: "rgba(248,215,206,0.24)", top: 210, right: -180, opacity: 1 }
    ]
  },
  miniRoom: {
    baseColors: [uiTheme.colors.nightBackground, "#2D1B4E", uiTheme.colors.nightBackground],
    blobs: [
      { size: 480, color: "#B2418F", top: -210, right: -190, opacity: 0.5 },
      { size: 400, color: "#5E3B89", top: 260, left: -150, opacity: 0.45 },
      { size: 320, color: "#D12F7E", bottom: -130, right: -90, opacity: 0.25 },
    ]
  },
  premiumMesh: {
    baseColors: ["#FFC8E0", "#FFB3D9", "#E8D5FF"],
    blobs: [
      { size: 700, color: "#FFA1C5", top: -200, left: -200, opacity: 0.9 },
      { size: 800, color: "#C6A1FF", bottom: -200, right: -200, opacity: 0.8 },
      { size: 500, color: "#FFFFFF", top: 100, right: -150, opacity: 0.7 },
      { size: 600, color: "#FF8EBB", bottom: 100, left: -150, opacity: 0.7 },
      { size: 400, color: "#E8D5FF", top: 300, left: 100, opacity: 0.8 },
    ]
  },
  homeLiquid: {
    baseColors: ["#FFF6FA", "#FFFDFE", "#E7DCFF"],
    blobs: [
      { size: 620, color: "rgba(255, 150, 194, 0.28)", top: -210, right: -220, opacity: 1 },
      { size: 520, color: "rgba(255, 255, 255, 0.54)", top: 120, left: -220, opacity: 1 },
      { size: 660, color: "rgba(189, 167, 255, 0.32)", bottom: -260, right: -250, opacity: 1 },
      { size: 460, color: "rgba(255, 216, 233, 0.34)", bottom: 120, left: -170, opacity: 1 },
    ]
  }
}

export function SoftBlobBackground(props: SoftBlobBackgroundProps) {
  const { variant = "lobby", style, animated = true } = props
  const config = blobConfig[variant]
  const pulseAnim = useRef(new Animated.Value(0)).current
  const reduceMotion = useReducedMotion()
  const motionEnabled = animated && !reduceMotion

  useEffect(() => {
    if (!motionEnabled) {
      pulseAnim.stopAnimation()
      pulseAnim.setValue(0)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 8000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [motionEnabled, pulseAnim])

  if (variant === "register") {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, styles.registerRoot, style]}>
        <Image source={registerBackground} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </View>
    )
  }

  if (variant === "homeLiquid") {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, styles.homeLiquidRoot, style]}>
        <Image source={homeLiquidBackground} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </View>
    )
  }

  if (variant === "premiumMesh") {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, style]}>
        <LinearGradient
          colors={["#FFD6E8", "#F2E8FF", "#D1BCFF"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(255, 105, 180, 0.5)", "transparent", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["transparent", "transparent", "rgba(155, 99, 248, 0.4)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["transparent", "rgba(255, 255, 255, 0.64)", "transparent"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    )
  }

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, style]}
    >
      <LinearGradient
        colors={config.baseColors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {config.blobs.map((blob, index) => {
        const isEven = index % 2 === 0
        const scaleInterp = motionEnabled
          ? pulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: isEven ? [1, 1.12] : [1.08, 0.96],
            })
          : 1

        return (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              top: blob.top,
              left: blob.left,
              right: blob.right,
              bottom: blob.bottom,
              opacity: blob.opacity,
              transform: [{ scale: scaleInterp }],
              overflow: "hidden"
            }}
          >
            <LinearGradient
              colors={[blob.color, "transparent"]}
              start={{ x: 0.2, y: 0.2 }}
              end={{ x: 0.8, y: 0.8 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden"
  },
  homeLiquidRoot: {
    backgroundColor: "#FFF8FC"
  },
  registerRoot: {
    backgroundColor: "#FFFFFF"
  }
})
