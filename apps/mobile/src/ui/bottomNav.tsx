import { useEffect, useMemo, useRef, useState } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { uiTheme } from "./theme"
import { hapticLight } from "./haptics"
import { getAppNavigationCopy } from "../features/session/appNavigationCopy"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import {
  BOTTOM_NAV_BORDER_WIDTH,
  BOTTOM_NAV_HORIZONTAL_PADDING,
  BOTTOM_NAV_ITEM_HEIGHT,
  BOTTOM_NAV_VERTICAL_PADDING,
  resolveBottomNavLayout,
} from "./layout/bottomNavLayout"
import {
  BOTTOM_NAV_PRESSED_SCALE,
  BOTTOM_NAV_PRESS_DURATION_MS,
  getBottomNavAccessibilityLabel,
  getBottomNavMotionDuration,
} from "./layout/bottomNavMotionModel"

export type BottomNavKey = "discover" | "chats" | "myroom" | "shop"

interface BottomNavItem {
  key: BottomNavKey
  icon: keyof typeof Ionicons.glyphMap
  activeIcon: keyof typeof Ionicons.glyphMap
}

type LocalizedBottomNavItem = BottomNavItem & { label: string }

const BOTTOM_NAV_ITEMS: readonly BottomNavItem[] = [
  {
    key: "discover",
    icon: "compass-outline",
    activeIcon: "compass"
  },
  {
    key: "chats",
    icon: "chatbubble-ellipses-outline",
    activeIcon: "chatbubble-ellipses"
  },
  { key: "myroom", icon: "home-outline", activeIcon: "home" },
  { key: "shop", icon: "bag-outline", activeIcon: "bag" }
]

export interface BottomNavProps {
  currentKey: BottomNavKey
  chatCount: number
  onPress: (key: BottomNavKey) => void
  appearance?: "default" | "ambient"
}

function NavTab(props: {
  item: LocalizedBottomNavItem
  isCurrent: boolean
  showBadge: boolean
  chatCount: number
  onPress: () => void
  ambient: boolean
  accessibilityLabel: string
  reduceMotion: boolean
}) {
  const {
    item,
    isCurrent,
    showBadge,
    chatCount,
    onPress,
    ambient,
    accessibilityLabel,
    reduceMotion,
  } = props
  const scaleAnim = useRef(new Animated.Value(1)).current
  const iconName = isCurrent ? item.activeIcon : item.icon

  const handlePressIn = () => {
    scaleAnim.stopAnimation()
    if (reduceMotion) {
      scaleAnim.setValue(1)
      return
    }
    Animated.timing(scaleAnim, {
      toValue: BOTTOM_NAV_PRESSED_SCALE,
      useNativeDriver: true,
      duration: BOTTOM_NAV_PRESS_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    }).start()
  }

  const handlePressOut = () => {
    scaleAnim.stopAnimation()
    if (reduceMotion) {
      scaleAnim.setValue(1)
      return
    }
    Animated.timing(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      duration: BOTTOM_NAV_PRESS_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    }).start()
  }

  useEffect(() => {
    if (reduceMotion) {
      scaleAnim.stopAnimation()
      scaleAnim.setValue(1)
    }
    return () => scaleAnim.stopAnimation()
  }, [reduceMotion, scaleAnim])

  return (
    <Animated.View style={[styles.bottomNavItemOuter, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: isCurrent }}
        style={[
          styles.bottomNavItem,
          isCurrent ? styles.bottomNavItemActive : null,
        ]}
        disabled={isCurrent}
        onPress={() => {
          hapticLight()
          onPress()
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={6}
      >
        {isCurrent ? (
          <View style={styles.activeIconWrap}>
            <Ionicons
              name={iconName}
              size={22}
              color={uiTheme.colors.primary}
              style={styles.iconZ}
            />
          </View>
        ) : (
          <View style={styles.bottomNavIconWrap}>
            <Ionicons
              name={iconName}
              size={22}
              color={uiTheme.colors.textMuted}
            />
          </View>
        )}
        {showBadge ? (
          <View
            style={[
              styles.bottomNavBadge,
              ambient ? styles.bottomNavBadgeAmbient : null
            ]}
          >
            <Text style={styles.bottomNavBadgeText}>
              {chatCount > 99 ? "99+" : chatCount}
            </Text>
          </View>
        ) : null}
        <View pointerEvents="none" style={styles.bottomNavLabelFrame}>
          <Text
            accessible={false}
            style={[
              styles.bottomNavLabel,
              isCurrent ? styles.bottomNavLabelActive : styles.bottomNavLabelHidden,
            ]}
          >
            {item.label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

export function BottomNav(props: BottomNavProps) {
  const { currentKey, chatCount, onPress, appearance = "default" } = props
  const ambient = appearance === "ambient"
  const [reduceMotion, setReduceMotion] = useState(false)
  const locale = useMemo(
    () => resolveAccountRecoveryLocale(
      getNativeAppLocale(),
      Intl.DateTimeFormat().resolvedOptions().locale
    ),
    []
  )
  const copy = useMemo(() => getAppNavigationCopy(locale), [locale])
  const localizedItems = useMemo(
    () => BOTTOM_NAV_ITEMS.map((item) => ({
      ...item,
      label: copy[item.key === "myroom" ? "myRoom" : item.key]
    })),
    [copy]
  )
  const insets = useSafeAreaInsets()
  const windowSize = useWindowDimensions()
  const activeIndex = Math.max(
    0,
    localizedItems.findIndex((item) => item.key === currentKey)
  )
  const activeIndexAnim = useRef(new Animated.Value(activeIndex)).current
  const navLayout = resolveBottomNavLayout({
    viewportWidth: windowSize.width,
    safeAreaBottom: insets.bottom,
    visible: true,
  })

  useEffect(() => {
    let mounted = true
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    )
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled)
    }).catch(() => undefined)

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    activeIndexAnim.stopAnimation()
    const duration = getBottomNavMotionDuration(reduceMotion)
    if (duration === 0) {
      activeIndexAnim.setValue(activeIndex)
      return () => activeIndexAnim.stopAnimation()
    }
    Animated.timing(activeIndexAnim, {
      toValue: activeIndex,
      useNativeDriver: true,
      duration,
      easing: Easing.out(Easing.cubic),
    }).start()
    return () => activeIndexAnim.stopAnimation()
  }, [activeIndex, activeIndexAnim, reduceMotion])

  const activeTranslateX = activeIndexAnim.interpolate({
    inputRange: localizedItems.map((_, index) => index),
    outputRange: localizedItems.map((_, index) => index * navLayout.tabWidth)
  })

  return (
    <View
      style={[
        styles.bottomNav,
        {
          bottom: navLayout.bottomOffset,
          height: navLayout.height,
          left: navLayout.horizontalInset,
          right: navLayout.horizontalInset
        },
        ambient ? styles.bottomNavAmbient : null
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.navTint, ambient ? styles.navTintAmbient : null]}
      />
      <View pointerEvents="none" style={styles.navSheen} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activeGlassPill,
          ambient ? styles.activeGlassPillAmbient : null,
          {
            width: navLayout.tabWidth,
            transform: [{ translateX: activeTranslateX }]
          }
        ]}
      >
        <View pointerEvents="none" style={styles.activeGlassTint} />
      </Animated.View>
      {localizedItems.map((item) => {
        const isCurrent = item.key === currentKey
        const showBadge = item.key === "chats" && chatCount > 0
        return (
          <NavTab
            key={item.key}
            item={item}
            isCurrent={isCurrent}
            showBadge={showBadge}
            chatCount={chatCount}
            onPress={() => onPress(item.key)}
            ambient={ambient}
            accessibilityLabel={getBottomNavAccessibilityLabel(
              locale,
              item.label,
              isCurrent
            )}
            reduceMotion={reduceMotion}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    zIndex: 80,
    borderWidth: BOTTOM_NAV_BORDER_WIDTH,
    borderColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    paddingHorizontal: BOTTOM_NAV_HORIZONTAL_PADDING,
    paddingVertical: BOTTOM_NAV_VERTICAL_PADDING,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  bottomNavAmbient: {
    borderColor: uiTheme.ambientGlass.edgeLight,
    backgroundColor: uiTheme.ambientGlass.surfaceStrong,
  },
  navTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(240, 230, 255, 0.2)",
  },
  navTintAmbient: {
    backgroundColor: uiTheme.ambientGlass.surfaceQuiet,
  },
  navSheen: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 0,
    height: 1.5,
    backgroundColor: uiTheme.ambientGlass.sheen
  },
  activeGlassPill: {
    position: "absolute",
    left: BOTTOM_NAV_HORIZONTAL_PADDING,
    top: BOTTOM_NAV_VERTICAL_PADDING,
    bottom: BOTTOM_NAV_VERTICAL_PADDING,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.6)",
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  activeGlassPillAmbient: {
    borderColor: uiTheme.ambientGlass.edgeLight,
    backgroundColor: uiTheme.ambientGlass.surface,
  },
  activeGlassTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
  bottomNavItemOuter: {
    flex: 1,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: BOTTOM_NAV_ITEM_HEIGHT,
    paddingVertical: 3,
    borderRadius: 22,
    position: "relative",
  },
  bottomNavItemActive: {
    backgroundColor: "transparent",
  },
  activeIconWrap: {
    position: "relative",
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  iconZ: {
    zIndex: 1,
  },
  bottomNavIconWrap: {
    position: "relative",
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: uiTheme.colors.textMuted,
    letterSpacing: 0,
  },
  bottomNavLabelFrame: {
    alignItems: "center",
    height: 12,
    justifyContent: "center",
    width: "100%",
  },
  bottomNavLabelActive: {
    color: uiTheme.colors.primaryDeep,
    fontWeight: "800"
  },
  bottomNavLabelHidden: {
    opacity: 0,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: uiTheme.colors.primary,
  },
  bottomNavBadge: {
    position: "absolute",
    top: 2,
    right: "22%",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: uiTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: uiTheme.colors.surface,
    zIndex: 5,
    ...uiTheme.shadow.glowSubtle,
  },
  bottomNavBadgeAmbient: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  bottomNavBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900"
  }
})
