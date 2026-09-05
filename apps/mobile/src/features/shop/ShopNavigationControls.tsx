import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native"
import type { ShopPresentationState } from "./shopPresentationModel"
import type { AppLocale } from "../session/appLocale"
import { getShopCopy } from "./shopCopy"
import { useReducedMotion } from "../../ui/animations"
import { uiTheme } from "../../ui/theme"

export type ShopMode = "avatar" | "home"

const SHOP_MODE_OPTIONS: {
  mode: ShopMode
  copyKey: "avatar" | "home"
  icon: keyof typeof Ionicons.glyphMap
}[] = [
  { mode: "avatar", copyKey: "avatar", icon: "shirt" },
  { mode: "home", copyKey: "home", icon: "home" }
]

export function ShopStatusCard(props: {
  state: Exclude<ShopPresentationState, "ready">
  isRetrying: boolean
  onRetry: () => void
  locale: AppLocale
}) {
  const copy = getShopCopy(props.locale)
  const details = (() => {
    switch (props.state) {
      case "loading":
        return {
          ...copy.loading,
          testID: "shop-status-loading"
        }
      case "offline":
        return {
          ...copy.offline,
          testID: "shop-status-offline"
        }
      case "empty":
        return {
          ...copy.empty,
          testID: "shop-status-empty"
        }
      case "error":
        return {
          ...copy.error,
          testID: "shop-status-error"
        }
    }
  })()
  const canRetry = props.state !== "loading"

  return (
    <View
      testID={details.testID}
      accessibilityRole={props.state === "loading" ? "progressbar" : "alert"}
      accessibilityLabel={`${details.title}. ${details.body}`}
      accessibilityLiveRegion="polite"
      style={styles.shopStatusCard}
    >
      {props.state === "loading" ? (
        <ActivityIndicator color={uiTheme.colors.primary} size="small" />
      ) : (
        <View style={styles.shopStatusIcon}>
          <Ionicons
            name={props.state === "offline" ? "cloud-offline-outline" : "sparkles-outline"}
            size={22}
            color={uiTheme.colors.primary}
          />
        </View>
      )}
      <Text maxFontSizeMultiplier={1.25} style={styles.shopStatusTitle}>{details.title}</Text>
      <Text maxFontSizeMultiplier={1.25} style={styles.shopStatusBody}>{details.body}</Text>
      {canRetry ? (
        <Pressable
          testID="shop-status-retry"
          accessibilityRole="button"
          accessibilityLabel={copy.retryAccessibility}
          accessibilityState={{ disabled: props.isRetrying }}
          disabled={props.isRetrying}
          onPress={props.onRetry}
          style={({ pressed }) => [
            styles.shopStatusRetry,
            pressed && !props.isRetrying ? styles.shopStatusRetryPressed : null,
            props.isRetrying ? styles.shopStatusRetryDisabled : null
          ]}
        >
          <Text maxFontSizeMultiplier={1.2} style={styles.shopStatusRetryText}>{copy.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function ShopOfflineNotice(props: { locale: AppLocale }) {
  const copy = getShopCopy(props.locale)
  return (
    <View
      testID="shop-offline-read-only"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${copy.offline.title}. ${copy.offline.body}`}
      style={styles.shopOfflineNotice}
    >
      <Ionicons name="cloud-offline-outline" size={17} color={uiTheme.colors.primary} />
      <Text maxFontSizeMultiplier={1.25} style={styles.shopOfflineNoticeText}>
        {copy.offline.body}
      </Text>
    </View>
  )
}

export const ShopModeDock = memo(function ShopModeDock(props: {
  activeMode: ShopMode
  counts: Record<ShopMode, number>
  onSelectMode: (mode: ShopMode) => void
  locale: AppLocale
}) {
  const copy = getShopCopy(props.locale)
  const slideAnim = useRef(new Animated.Value(props.activeMode === "avatar" ? 0 : 1)).current
  const reduceMotion = useReducedMotion()
  const [dockWidth, setDockWidth] = useState(0)
  const segmentWidth = dockWidth > 0 ? (dockWidth - 8) / 2 : 0

  useEffect(() => {
    const nextValue = props.activeMode === "avatar" ? 0 : 1
    if (reduceMotion) {
      slideAnim.stopAnimation()
      slideAnim.setValue(nextValue)
      return
    }
    const animation = Animated.spring(slideAnim, {
      toValue: nextValue,
      useNativeDriver: true,
      damping: 18,
      stiffness: 210,
      mass: 0.7
    })
    animation.start()
    return () => animation.stop()
  }, [props.activeMode, reduceMotion, slideAnim])

  const indicatorTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segmentWidth]
  })

  return (
    <View
      style={styles.modeDock}
      onLayout={(event) => setDockWidth(event.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.modeIndicator,
            {
              width: segmentWidth,
              transform: [{ translateX: indicatorTranslateX }]
            }
          ]}
        />
      ) : null}
      {SHOP_MODE_OPTIONS.map((option) => {
        const active = option.mode === props.activeMode
        const label = copy[option.copyKey]
        const accessibilityLabel = option.mode === "avatar"
          ? copy.avatarShopAccessibility
          : copy.homeShopAccessibility
        return (
          <Pressable
            key={option.mode}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ selected: active }}
            onPress={() => props.onSelectMode(option.mode)}
            style={({ pressed }) => [
              styles.modePill,
              active ? styles.modePillActive : null,
              pressed ? styles.modePillPressed : null
            ]}
          >
            <Ionicons
              name={option.icon}
              size={16}
              color={active ? "#FFFFFF" : "rgba(45, 31, 58, 0.62)"}
            />
            <Text style={[styles.modePillText, active ? styles.modePillTextActive : null]}>
              {label}
            </Text>
            <Text style={[styles.modeCount, active ? styles.modeCountActive : null]}>
              {props.counts[option.mode]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}, (previous, next) =>
  previous.activeMode === next.activeMode &&
  previous.counts.avatar === next.counts.avatar &&
  previous.counts.home === next.counts.home &&
  previous.locale === next.locale &&
  previous.onSelectMode === next.onSelectMode
)

const styles = StyleSheet.create({
  shopOfflineNotice: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.lg,
    backgroundColor: "rgba(255, 242, 249, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255, 79, 152, 0.26)"
  },
  shopOfflineNoticeText: {
    ...uiTheme.font.caption,
    flex: 1,
    color: uiTheme.colors.textSecondary
  },
  shopStatusCard: {
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.xl,
    paddingVertical: uiTheme.spacing.xxl,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: "rgba(255, 250, 253, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
    ...uiTheme.shadow.deep,
  },
  shopStatusIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: uiTheme.colors.primarySoft,
  },
  shopStatusTitle: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center",
  },
  shopStatusBody: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
  },
  shopStatusRetry: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.primary,
  },
  shopStatusRetryPressed: {
    backgroundColor: uiTheme.colors.primaryPressed,
    transform: [{ scale: 0.99 }],
  },
  shopStatusRetryDisabled: {
    opacity: 0.56,
  },
  shopStatusRetryText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
  },
  modeDock: {
    position: "relative",
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.44)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    overflow: "hidden",
    ...uiTheme.shadow.soft,
  },
  modeIndicator: {
    position: "absolute",
    left: 5,
    top: 5,
    bottom: 5,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 72, 151, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)",
    shadowColor: "#D85AA0",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  modePill: {
    zIndex: 1,
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: uiTheme.radius.full,
  },
  modePillActive: {},
  modePillPressed: {
    transform: [{ scale: 0.98 }],
  },
  modePillText: {
    ...uiTheme.font.bodyBold,
    color: "rgba(45, 31, 58, 0.66)",
    fontWeight: "900",
  },
  modePillTextActive: {
    color: "#FFFFFF",
  },
  modeCount: {
    ...uiTheme.font.captionBold,
    minWidth: 28,
    textAlign: "center",
    color: "rgba(45, 31, 58, 0.58)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.50)",
  },
  modeCountActive: {
    color: "#FFFFFF",
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  }
})
