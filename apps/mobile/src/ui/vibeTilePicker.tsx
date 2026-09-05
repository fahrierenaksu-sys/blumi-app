import Ionicons from "@expo/vector-icons/Ionicons"
import { useRef } from "react"
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { LinearGradient } from "./linearGradient"
import { uiTheme } from "./theme"

export interface VibeOption {
  id: string
  label: string
  swatch: string
  accent: string
  ring: string
}

export const VIBE_PRESETS: readonly VibeOption[] = [
  { id: "sunset", label: "Sunset", swatch: "#FFB99A", accent: "#C94D20", ring: "#F7D8C5" },
  { id: "dusk", label: "Dusk", swatch: "#CBB6F2", accent: "#4A2F87", ring: "#E3D6F7" },
  { id: "mint", label: "Mint", swatch: "#B7E7CE", accent: "#236C4D", ring: "#D2EFDF" },
  { id: "rose", label: "Rose", swatch: "#FFBEDA", accent: "#B93872", ring: "#FBDAE8" },
  { id: "aurora", label: "Aurora", swatch: "#B7D9F2", accent: "#1D5A8C", ring: "#D6E7F5" },
  { id: "dawn", label: "Dawn", swatch: "#FFE38C", accent: "#7A4B09", ring: "#F7E3B2" }
]

interface VibeTilePickerProps {
  selectedId: string
  onSelect: (id: string) => void
  style?: StyleProp<ViewStyle>
}

function VibeTile(props: {
  option: VibeOption
  selected: boolean
  onPress: () => void
}) {
  const { option, selected, onPress } = props
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springBouncy,
    }).start()
  }

  return (
    <Animated.View style={[styles.tileOuter, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${option.label} vibe`}
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.tile,
          selected ? styles.tileSelected : null,
        ]}
      >
        <View style={styles.swatchContainer}>
          {selected ? (
            <View style={[styles.swatchRingOuter, { borderColor: option.accent }]}>
              <LinearGradient
                colors={[option.swatch, option.ring]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.swatchGradient]}
              />
            </View>
          ) : (
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: option.swatch,
                  borderColor: "rgba(0,0,0,0.06)",
                }
              ]}
            />
          )}
          {selected ? (
            <View style={[styles.checkBadge, { backgroundColor: option.accent }]}>
              <Ionicons accessible={false} name="checkmark" size={12} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.label,
            selected ? { color: option.accent, fontWeight: "800" } : null
          ]}
        >
          {option.label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

export function VibeTilePicker(props: VibeTilePickerProps) {
  const { selectedId, onSelect, style } = props

  return (
    <View style={[styles.grid, style]}>
      {VIBE_PRESETS.map((option) => (
        <VibeTile
          key={option.id}
          option={option}
          selected={option.id === selectedId}
          onPress={() => onSelect(option.id)}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.sm,
    justifyContent: "space-between"
  },
  tileOuter: {
    width: "31%",
  },
  tile: {
    alignItems: "center",
    paddingVertical: uiTheme.spacing.md,
    paddingHorizontal: uiTheme.spacing.xs,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tileSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: uiTheme.colors.border,
    ...uiTheme.shadow.soft,
  },
  swatchContainer: {
    position: "relative",
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
  },
  swatchRingOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  swatchGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  checkBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  label: {
    marginTop: 8,
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
  }
})
