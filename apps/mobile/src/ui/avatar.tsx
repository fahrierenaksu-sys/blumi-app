import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { uiTheme } from "./theme"

interface AvatarProps {
  name: string
  seed?: string
  size?: number
  ring?: "none" | "soft" | "strong"
  style?: StyleProp<ViewStyle>
  /** Optional cosmetic frame ring color override */
  frameColor?: string
}

function hashSeed(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function deriveInitials(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return "?"
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return parts[0][0].toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function pickAvatarSwatch(seed: string): { bg: string; fg: string } {
  const palette = uiTheme.palette.avatar
  return palette[hashSeed(seed) % palette.length]
}

export function Avatar(props: AvatarProps) {
  const { name, seed, size = 64, ring = "none", style, frameColor } = props
  const key = seed ?? name
  const swatch = pickAvatarSwatch(key)
  const initials = deriveInitials(name)
  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0
  const ringColor = frameColor ?? (ring === "strong" ? "#FFFFFF" : "rgba(255,255,255,0.7)")

  return (
    <View
      style={[
        styles.wrapper,
        ring !== "none" ? uiTheme.shadow.soft : null,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: swatch.bg,
          borderWidth: ringWidth,
          borderColor: ringColor
        },
        style
      ]}
    >
      {/* Highlight orb for depth */}
      <View
        style={[
          styles.highlight,
          {
            width: size * 0.65,
            height: size * 0.65,
            borderRadius: (size * 0.65) / 2,
            top: -size * 0.1,
            left: -size * 0.05
          }
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.accent,
          {
            width: Math.max(4, size * 0.12),
            height: Math.max(4, size * 0.12),
            borderRadius: size,
            right: size * 0.16,
            bottom: size * 0.14
          }
        ]}
      />
      <Text
        style={[
          styles.initials,
          {
            color: swatch.fg,
            fontSize: Math.round(size * 0.38)
          }
        ]}
      >
        {initials}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative"
  },
  highlight: {
    position: "absolute",
    backgroundColor: "rgba(255, 255, 255, 0.45)"
  },
  accent: {
    position: "absolute",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    zIndex: 1
  },
  initials: {
    fontWeight: "800",
    letterSpacing: 0.5,
    zIndex: 1
  }
})
