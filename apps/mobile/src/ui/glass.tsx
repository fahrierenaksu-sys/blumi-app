import type { ReactNode } from "react"
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native"
import { LinearGradient } from "./linearGradient"
import { uiTheme } from "./theme"

type GlassTone = "light" | "dark" | "accent"

interface GlassSurfaceProps {
  children: ReactNode
  tone?: GlassTone
  style?: StyleProp<ViewStyle>
}

interface GlassActionProps {
  label: string
  onPress: (event: GestureResponderEvent) => void
  disabled?: boolean
  icon?: string
  accessibilityLabel?: string
  variant?: "primary" | "secondary"
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

export function GlassSurface(props: GlassSurfaceProps) {
  const { children, tone = "light", style } = props
  return (
    <View style={[styles.surface, getToneStyle(tone), style]}>
      <View pointerEvents="none" style={styles.edgeHighlight} />
      {children}
    </View>
  )
}

export function GlassCard(props: GlassSurfaceProps) {
  return (
    <GlassSurface
      tone={props.tone}
      style={[styles.card, props.style]}
    >
      {props.children}
    </GlassSurface>
  )
}

export function GlassPill(props: GlassSurfaceProps) {
  return (
    <GlassSurface
      tone={props.tone}
      style={[styles.pill, props.style]}
    >
      {props.children}
    </GlassSurface>
  )
}

export function FloatingGlassDock(props: GlassSurfaceProps) {
  return (
    <GlassSurface
      tone={props.tone}
      style={[styles.dock, props.style]}
    >
      {props.children}
    </GlassSurface>
  )
}

export function GlassHeader(props: {
  title: string
  eyebrow?: string
  rightSlot?: ReactNode
  leftSlot?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.header, props.style]}>
      {props.leftSlot}
      <View style={styles.headerTextBlock}>
        {props.eyebrow ? (
          <Text style={styles.eyebrow}>{props.eyebrow}</Text>
        ) : null}
        <Text style={styles.headerTitle}>{props.title}</Text>
      </View>
      {props.rightSlot ? (
        <View style={styles.headerRight}>{props.rightSlot}</View>
      ) : null}
    </View>
  )
}

export function GlassCTA(props: GlassActionProps) {
  const {
    label,
    onPress,
    disabled = false,
    icon,
    variant = "primary",
    style,
    textStyle
  } = props
  const isPrimary = variant === "primary"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cta,
        isPrimary ? styles.primaryCta : styles.secondaryCta,
        pressed && !disabled ? styles.ctaPressed : null,
        disabled ? styles.ctaDisabled : null,
        style
      ]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={uiTheme.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {icon ? (
        <Text style={[
          styles.ctaIcon,
          isPrimary ? styles.primaryCtaText : styles.secondaryCtaText
        ]}>
          {icon}
        </Text>
      ) : null}
      <Text
        style={[
          styles.ctaText,
          isPrimary ? styles.primaryCtaText : styles.secondaryCtaText,
          textStyle
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  )
}

function getToneStyle(tone: GlassTone): ViewStyle {
  if (tone === "dark") return styles.surfaceDark
  if (tone === "accent") return styles.surfaceAccent
  return styles.surfaceLight
}

const styles = StyleSheet.create({
  surface: {
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
    ...uiTheme.shadow.float
  },
  surfaceLight: {
    backgroundColor: "rgba(255, 255, 255, 0.76)",
    borderColor: "rgba(255, 255, 255, 0.68)"
  },
  surfaceDark: {
    backgroundColor: "rgba(32, 22, 42, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.18)"
  },
  surfaceAccent: {
    backgroundColor: "rgba(255, 226, 238, 0.76)",
    borderColor: "rgba(255, 255, 255, 0.72)"
  },
  edgeHighlight: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.78)"
  },
  card: {
    borderRadius: uiTheme.radius.xl,
    padding: uiTheme.spacing.lg
  },
  pill: {
    borderRadius: uiTheme.radius.full,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm
  },
  dock: {
    borderRadius: uiTheme.radius.xxl,
    padding: uiTheme.spacing.sm,
    ...uiTheme.shadow.deep
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.md
  },
  headerTextBlock: {
    flex: 1,
    gap: 2
  },
  headerRight: {
    alignItems: "flex-end",
    justifyContent: "center"
  },
  eyebrow: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primaryDeep,
    textTransform: "uppercase",
    letterSpacing: 1.1
  },
  headerTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary
  },
  cta: {
    minHeight: 50,
    borderRadius: uiTheme.radius.full,
    paddingHorizontal: uiTheme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.sm,
    overflow: "hidden",
    borderWidth: 1
  },
  primaryCta: {
    borderColor: "rgba(255, 255, 255, 0.4)",
    ...uiTheme.shadow.glowSubtle
  },
  secondaryCta: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderColor: uiTheme.colors.borderStrong
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  ctaDisabled: {
    opacity: 0.48
  },
  ctaIcon: {
    fontSize: 16,
    fontWeight: "900"
  },
  ctaText: {
    ...uiTheme.font.bodyBold
  },
  primaryCtaText: {
    color: uiTheme.colors.textInverted
  },
  secondaryCtaText: {
    color: uiTheme.colors.textPrimary
  }
})
