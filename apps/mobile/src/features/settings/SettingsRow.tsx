import Ionicons from "@expo/vector-icons/Ionicons"
import { useRef } from "react"
import { Animated, Pressable, Text, View } from "react-native"
import { springPressScale, useReducedMotion } from "../../ui/animations"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import { settingsStyles as styles } from "./settingsStyles"

/* ── Animated Row ──────────────────────────────────────────── */

export function SettingsRow(props: {
  icon: keyof typeof Ionicons.glyphMap
  iconColors: [string, string]
  label: string
  description?: string
  value?: string
  chevron?: boolean
  onPress?: () => void
  isLast?: boolean
  children?: React.ReactNode
}) {
  const { icon, iconColors, label, description, value, chevron, onPress, isLast, children } = props
  const scaleAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()

  const handlePressIn = () => springPressScale(scaleAnim, 0.98, uiTheme.animation.spring, reduceMotion)
  const handlePressOut = () => springPressScale(scaleAnim, 1, uiTheme.animation.spring, reduceMotion)

  const content = (
    <>
      <View style={styles.iconCircle}>
        <LinearGradient
          colors={iconColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          <Ionicons accessible={false} name={icon} size={19} color="#FFFFFF" />
        </LinearGradient>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {children}
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {chevron ? (
        <Ionicons accessible={false} name="chevron-forward" size={18} color={uiTheme.colors.textMuted} />
      ) : null}
    </>
  )

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}${value ? `, ${value}` : ""}`}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.row, !isLast && styles.rowDivider]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={[styles.row, !isLast && styles.rowDivider]}>{content}</View>
      )}
    </Animated.View>
  )
}
