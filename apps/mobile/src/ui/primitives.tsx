import { useRef } from "react"
import type { ReactNode } from "react"
import {
  Animated,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle
} from "react-native"
import { blumiEntryTheme, uiTheme } from "./theme"
import { LinearGradient } from "./linearGradient"
import { useReducedMotion } from "./animations"

/* ── Animated Pressable ─────────────────────────────────────── */

interface AnimatedPressableProps {
  children: ReactNode
  onPress?: (event: GestureResponderEvent) => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  scaleValue?: number
  accessibilityLabel: string
}

export function AnimatedPressable(props: AnimatedPressableProps) {
  const { children, onPress, disabled, style, scaleValue = uiTheme.animation.scalePress, accessibilityLabel } = props
  const scaleAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()

  const handlePressIn = () => {
    if (reduceMotion) return
    Animated.spring(scaleAnim, {
      toValue: scaleValue,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handlePressOut = () => {
    if (reduceMotion) {
      scaleAnim.stopAnimation()
      scaleAnim.setValue(1)
      return
    }
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={{ width: "100%" }}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

/* ── Screen Surface ─────────────────────────────────────────── */

interface ScreenSurfaceProps {
  children: ReactNode
  scrollable?: boolean
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
}

export function ScreenSurface(props: ScreenSurfaceProps) {
  const { children, scrollable = false, style, contentContainerStyle } = props

  if (scrollable) {
    return (
      <ScrollView
        style={[styles.screen, style]}
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    )
  }

  return <View style={[styles.screen, styles.screenContent, style]}>{children}</View>
}

/* ── Card Wrapper ───────────────────────────────────────────── */

interface CardWrapperProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  variant?: "default" | "elevated" | "glass" | "accent"
}

export function CardWrapper(props: CardWrapperProps) {
  const { children, style, variant = "default" } = props
  const variantStyle =
    variant === "elevated" ? styles.cardElevated :
    variant === "glass" ? styles.cardGlass :
    variant === "accent" ? styles.cardAccent :
    null

  return <View style={[styles.card, variantStyle, style]}>{children}</View>
}

/* ── Gradient Card ──────────────────────────────────────────── */

interface GradientCardProps {
  children: ReactNode
  colors?: string[]
  style?: StyleProp<ViewStyle>
}

export function GradientCard(props: GradientCardProps) {
  const { children, colors = uiTheme.gradients.heroBackground, style } = props
  return (
    <View style={[styles.gradientCardOuter, style]}>
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientCardInner}
      >
        {children}
      </LinearGradient>
    </View>
  )
}

/* ── Section Card ───────────────────────────────────────────── */

interface SectionCardProps {
  children: ReactNode
  icon?: string
  title?: string
  action?: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}

export function SectionCard(props: SectionCardProps) {
  const { children, icon, title, action, onPress, style } = props

  const content = (
    <View style={[styles.sectionCard, style]}>
      {(title || action) ? (
        <View style={styles.sectionCardHeader}>
          <View style={styles.sectionCardTitleRow}>
            {icon ? (
              <View style={styles.sectionCardIcon}>
                <Text style={styles.sectionCardIconText}>{icon}</Text>
              </View>
            ) : null}
            {title ? (
              <Text style={styles.sectionCardTitle}>{title}</Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  )

  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} accessibilityLabel={title ?? "Open section"}>
        {content}
      </AnimatedPressable>
    )
  }

  return content
}

/* ── Primary Button ─────────────────────────────────────────── */

interface SharedButtonProps {
  label: string
  onPress: (event: GestureResponderEvent) => void
  disabled?: boolean
  busy?: boolean
  style?: StyleProp<ViewStyle>
  icon?: ReactNode
  testID?: string
  tone?: "default" | "entry"
}

export function PrimaryButton(props: SharedButtonProps) {
  const { label, onPress, disabled = false, busy = false, style, icon, testID, tone = "default" } = props
  const buttonTheme = tone === "entry" ? blumiEntryTheme : uiTheme
  const scaleAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()

  const handlePressIn = () => {
    if (reduceMotion) return
    Animated.spring(scaleAnim, {
      toValue: uiTheme.animation.scalePress,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handlePressOut = () => {
    if (reduceMotion) {
      scaleAnim.stopAnimation()
      scaleAnim.setValue(1)
      return
    }
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        disabled={disabled || busy}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.buttonBase,
          styles.primaryButton,
          !disabled ? buttonTheme.shadow.glowSubtle : null,
          pressed && !disabled ? styles.primaryButtonPressed : null,
          disabled ? styles.primaryButtonDisabled : null,
          style
        ]}
        testID={testID}
      >
        <LinearGradient
          colors={disabled
            ? [buttonTheme.colors.primaryDisabled, buttonTheme.colors.primaryDisabled]
            : tone === "entry"
              ? [buttonTheme.colors.actionDark, buttonTheme.colors.actionDark]
              : buttonTheme.gradients.primary as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.buttonGradient}
        >
          {busy ? <ActivityIndicator color={uiTheme.colors.textInverted} /> : <>
            {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
            <Text style={styles.primaryButtonText}>{label}</Text>
          </>}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  )
}

/* ── Secondary Button ───────────────────────────────────────── */

export function SecondaryButton(props: SharedButtonProps) {
  const { label, onPress, disabled = false, busy = false, style, icon, testID, tone = "default" } = props
  const buttonTheme = tone === "entry" ? blumiEntryTheme : uiTheme
  const scaleAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()

  const handlePressIn = () => {
    if (reduceMotion) return
    Animated.spring(scaleAnim, {
      toValue: uiTheme.animation.scalePress,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handlePressOut = () => {
    if (reduceMotion) {
      scaleAnim.stopAnimation()
      scaleAnim.setValue(1)
      return
    }
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        disabled={disabled || busy}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.buttonBase,
          styles.secondaryButton,
          tone === "entry" ? {
            backgroundColor: buttonTheme.colors.glassStrong,
            borderColor: buttonTheme.colors.borderStrong
          } : null,
          pressed && !disabled ? styles.secondaryButtonPressed : null,
          disabled ? styles.secondaryButtonDisabled : null,
          style
        ]}
        testID={testID}
      >
        {busy ? <ActivityIndicator color={buttonTheme.colors.primaryDeep} /> : <>
          {icon ? <View style={styles.secondaryButtonIcon}>{icon}</View> : null}
          <Text style={[
            styles.secondaryButtonText,
            tone === "entry" ? { color: buttonTheme.colors.primaryDeep } : null
          ]}>{label}</Text>
        </>}
      </Pressable>
    </Animated.View>
  )
}

/* ── Tag Chip ───────────────────────────────────────────────── */

interface TagChipProps {
  label: string
  variant?: "default" | "accent" | "success" | "muted"
  style?: StyleProp<ViewStyle>
}

export function TagChip(props: TagChipProps) {
  const { label, variant = "default", style } = props
  const variantStyle =
    variant === "accent" ? styles.tagChipAccent :
    variant === "success" ? styles.tagChipSuccess :
    variant === "muted" ? styles.tagChipMuted :
    null
  const textVariantStyle =
    variant === "accent" ? styles.tagChipTextAccent :
    variant === "success" ? styles.tagChipTextSuccess :
    variant === "muted" ? styles.tagChipTextMuted :
    null

  return (
    <View style={[styles.tagChip, variantStyle, style]}>
      <Text style={[styles.tagChipText, textVariantStyle]}>{label}</Text>
    </View>
  )
}

/* ── Avatar Placeholder Block ───────────────────────────────── */

interface AvatarPlaceholderBlockProps {
  title?: string
  subtitle?: string
  height?: number
  style?: StyleProp<ViewStyle>
}

export function AvatarPlaceholderBlock(props: AvatarPlaceholderBlockProps) {
  const { title = "Profile visual", subtitle, height = 320, style } = props

  return (
    <View style={[styles.avatarBlock, { height }, style]}>
      <LinearGradient
        colors={uiTheme.gradients.heroBackground as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.avatarGlow} />
      <View style={styles.avatarGlowSecondary} />
      <Text style={styles.avatarTitle}>{title}</Text>
      {subtitle ? <Text style={styles.avatarSubtitle}>{subtitle}</Text> : null}
    </View>
  )
}

/* ── Top Bar ────────────────────────────────────────────────── */

interface TopBarProps {
  title: string
  subtitle?: string
  leftSlot?: ReactNode
  rightSlot?: ReactNode
  titleAlign?: "center" | "start"
  style?: StyleProp<ViewStyle>
}

export function TopBar(props: TopBarProps) {
  const { title, subtitle, leftSlot, rightSlot, titleAlign = "center", style } = props
  const isStartAligned = titleAlign === "start"
  return (
    <View style={[styles.topBar, style]}>
      <View style={styles.topBarSide}>{leftSlot}</View>
      <View style={[styles.topBarCenter, isStartAligned ? styles.topBarCenterStart : null]}>
        <Text style={styles.topBarTitle}>{title}</Text>
        {subtitle ? <Text style={styles.topBarSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.topBarSide, styles.topBarRight]}>{rightSlot}</View>
    </View>
  )
}

/* ── Action Button Circle ───────────────────────────────────── */

interface ActionButtonCircleProps {
  children: ReactNode
  onPress: (event: GestureResponderEvent) => void
  disabled?: boolean
  variant?: "primary" | "soft" | "danger" | "glass"
  size?: number
  style?: StyleProp<ViewStyle>
  accessibilityLabel: string
  accessibilityState?: AccessibilityState
}

export function ActionButtonCircle(props: ActionButtonCircleProps) {
  const {
    children,
    onPress,
    disabled = false,
    variant = "soft",
    size = 56,
    style,
    accessibilityLabel,
    accessibilityState
  } = props

  const scaleAnim = useRef(new Animated.Value(1)).current
  const isPrimary = variant === "primary"
  const isDanger = variant === "danger"
  const isGlass = variant === "glass"

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
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
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, ...accessibilityState }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.circleButton,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: isPrimary
              ? uiTheme.colors.primary
              : isDanger
                ? uiTheme.colors.dangerSoft
                : isGlass
                  ? "rgba(255, 255, 255, 0.08)"
                  : uiTheme.colors.surface,
            borderColor: isPrimary
              ? "transparent"
              : isDanger
                ? uiTheme.colors.danger
                : isGlass
                  ? "rgba(255, 255, 255, 0.16)"
                  : uiTheme.colors.border,
          },
          isPrimary
            ? uiTheme.shadow.glowSubtle
            : isGlass
              ? null
              : uiTheme.shadow.float,
          pressed && !disabled
            ? {
                backgroundColor: isPrimary
                  ? uiTheme.colors.primaryPressed
                  : isDanger
                    ? uiTheme.colors.danger
                    : isGlass
                      ? "rgba(255, 255, 255, 0.18)"
                      : uiTheme.colors.surfaceMuted,
              }
            : null,
          disabled ? { opacity: 0.45 } : null,
          style
        ]}
      >
        {typeof children === "string" ? (
          <Text
            style={[
              styles.circleButtonText,
              isPrimary ? styles.circleButtonTextPrimary : null,
              isDanger ? styles.circleButtonTextDanger : null,
              isGlass ? styles.circleButtonTextGlass : null,
            ]}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </Pressable>
    </Animated.View>
  )
}

/* ── Styles ─────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  screenContent: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.xl,
    gap: uiTheme.spacing.lg
  },
  card: {
    borderRadius: uiTheme.radius.lg,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    padding: uiTheme.spacing.lg,
    gap: uiTheme.spacing.sm,
    ...uiTheme.shadow.card
  },
  cardElevated: {
    ...uiTheme.shadow.deep,
    borderColor: "transparent",
  },
  cardGlass: {
    backgroundColor: uiTheme.colors.glass,
    borderColor: uiTheme.colors.glassBorder,
  },
  cardAccent: {
    borderColor: uiTheme.colors.primarySoft,
    backgroundColor: uiTheme.colors.surfaceSoft,
  },
  /* ── Gradient Card ───────────────────────────────── */
  gradientCardOuter: {
    borderRadius: uiTheme.radius.xl,
    overflow: "hidden",
    ...uiTheme.shadow.card,
  },
  gradientCardInner: {
    padding: uiTheme.spacing.lg,
    gap: uiTheme.spacing.sm,
  },
  /* ── Section Card ────────────────────────────────── */
  sectionCard: {
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    padding: uiTheme.spacing.lg,
    gap: uiTheme.spacing.md,
    ...uiTheme.shadow.soft,
  },
  sectionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
  },
  sectionCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: uiTheme.colors.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCardIconText: {
    fontSize: 16,
  },
  sectionCardTitle: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
  },
  /* ── Buttons ─────────────────────────────────────── */
  buttonBase: {
    minHeight: 54,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.xl,
    overflow: "hidden",
  },
  buttonGradient: {
    flex: 1,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
    borderRadius: uiTheme.radius.full,
    paddingHorizontal: uiTheme.spacing.xl,
  },
  buttonIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    padding: 0,
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    ...uiTheme.font.bodyBold,
    letterSpacing: 0.3,
  },
  secondaryButton: {
    backgroundColor: uiTheme.colors.secondary,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
  },
  secondaryButtonPressed: {
    backgroundColor: uiTheme.colors.secondaryPressed,
  },
  secondaryButtonDisabled: {
    opacity: 0.55
  },
  secondaryButtonText: {
    color: uiTheme.colors.secondaryText,
    ...uiTheme.font.bodyMedium,
  },
  secondaryButtonIcon: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  /* ── Tag Chips ───────────────────────────────────── */
  tagChip: {
    alignSelf: "flex-start",
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.chipBackground,
    borderWidth: 1,
    borderColor: "#FAD0E3",
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: 7
  },
  tagChipAccent: {
    backgroundColor: uiTheme.colors.primarySoft,
    borderColor: uiTheme.colors.primary,
  },
  tagChipSuccess: {
    backgroundColor: uiTheme.colors.successSoft,
    borderColor: uiTheme.colors.success,
  },
  tagChipMuted: {
    backgroundColor: uiTheme.colors.surfaceMuted,
    borderColor: uiTheme.colors.border,
  },
  tagChipText: {
    color: uiTheme.colors.chipText,
    fontSize: 11,
    fontWeight: "700"
  },
  tagChipTextAccent: {
    color: uiTheme.colors.primaryDeep,
  },
  tagChipTextSuccess: {
    color: uiTheme.colors.successInk,
  },
  tagChipTextMuted: {
    color: uiTheme.colors.textMuted,
  },
  /* ── Avatar Block ────────────────────────────────── */
  avatarBlock: {
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.avatarBackground,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.lg
  },
  avatarGlow: {
    position: "absolute",
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundColor: uiTheme.colors.avatarAccent,
    top: -26
  },
  avatarGlowSecondary: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: uiTheme.colors.primarySoft,
    right: -22,
    top: 74
  },
  avatarTitle: {
    fontSize: 28,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800",
    zIndex: 1
  },
  avatarSubtitle: {
    marginTop: uiTheme.spacing.xs,
    fontSize: 13,
    color: uiTheme.colors.textSecondary,
    zIndex: 1
  },
  /* ── Top Bar ─────────────────────────────────────── */
  topBar: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center"
  },
  topBarSide: {
    minWidth: 56,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  topBarRight: {
    alignItems: "flex-end"
  },
  topBarCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2
  },
  topBarCenterStart: {
    alignItems: "flex-start",
    paddingHorizontal: uiTheme.spacing.sm
  },
  topBarTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
  },
  topBarSubtitle: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
  },
  /* ── Circle Button ───────────────────────────────── */
  circleButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  circleButtonText: {
    fontSize: 19,
    color: uiTheme.colors.secondaryText,
    fontWeight: "700"
  },
  circleButtonTextPrimary: {
    color: "#FFFFFF"
  },
  circleButtonTextDanger: {
    color: uiTheme.colors.danger,
  },
  circleButtonTextGlass: {
    color: "#FFFFFF",
  },
})
