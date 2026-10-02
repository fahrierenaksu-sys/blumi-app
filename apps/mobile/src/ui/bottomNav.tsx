import { useEffect, useMemo, useRef, useState } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  ReduceMotion,
  type SharedValue
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useReducedMotion } from "./animations"
import { animateTo, useMotion } from "./motion"
import { PressableScale } from "./PressableScale"
import {
  BOTTOM_NAV_KEY_ORDER,
  getBottomNavIndicatorSpeed,
  getBottomNavItemEmphasis,
  getBottomNavLiquidStretch,
  readMainTabPagerIndicatorProgress,
  resolveBottomNavIndicatorIndex,
  shouldAnimateBottomNavSelectionFromJs
} from "./layout/bottomNavIndicatorModel"
import { mainTabPagerIndicator } from "./mainTabPagerIndicator"
import { usePublishToastBottomBarInset } from "./usePublishToastBottomBarInset"
import { uiTheme } from "./theme"
import { hapticSelection } from "./haptics"
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
import { BOTTOM_NAV_PRESSED_SCALE } from "./layout/bottomNavMotionModel"
import {
  formatBottomNavBadgeCount,
  getBadgeAppearMotion,
  getBadgeBumpMotion,
  getBadgeExitMotion,
  isBottomNavBadgeVisible,
  resolveBottomNavBadgeLabelCount,
  resolveBottomNavBadgeTransition,
  type BottomNavBadgeTransition,
} from "./layout/bottomNavBadgeModel"

export type BottomNavKey = "discover" | "chats" | "myroom" | "shop"

/** Share of the gap to the speed's stretch the pill closes per frame. */
const LIQUID_EASE = 0.45
/** After the last movement frame, the pill springs back to its shape. */
const LIQUID_RELEASE_DELAY_MS = 60

interface BottomNavItem {
  key: BottomNavKey
  icon: keyof typeof Ionicons.glyphMap
  activeIcon: keyof typeof Ionicons.glyphMap
}

type LocalizedBottomNavItem = BottomNavItem & { label: string }

const BOTTOM_NAV_ICONS: Readonly<Record<BottomNavKey, Omit<BottomNavItem, "key">>> = {
  discover: { icon: "compass-outline", activeIcon: "compass" },
  chats: { icon: "chatbubble-ellipses-outline", activeIcon: "chatbubble-ellipses" },
  myroom: { icon: "home-outline", activeIcon: "home" },
  shop: { icon: "bag-outline", activeIcon: "bag" }
}

// Same order as the main-page pager (MAIN_TAB_PAGES), whose fractional page
// index drives the selection indicator while a swipe moves the pages.
const BOTTOM_NAV_ITEMS: readonly BottomNavItem[] = BOTTOM_NAV_KEY_ORDER.map((key) => ({
  key,
  ...BOTTOM_NAV_ICONS[key]
}))

export interface BottomNavProps {
  currentKey: BottomNavKey
  chatCount: number
  onPress: (key: BottomNavKey) => void
  appearance?: "default" | "ambient"
  visible?: boolean
}

// Starts the badge's UI-thread animation for one count change. Reduce Motion
// snaps straight to the end state.
function playBadgeTransition(
  transition: BottomNavBadgeTransition,
  reduceMotion: boolean,
  scale: SharedValue<number>,
  opacity: SharedValue<number>
) {
  if (transition === "appear") {
    const motion = getBadgeAppearMotion(reduceMotion)
    opacity.value = motion.opacityDurationMs === 0
      ? 1
      : withTiming(1, { duration: motion.opacityDurationMs })
    scale.value = motion.spring === null
      ? 1
      : withSequence(withTiming(motion.fromScale, { duration: 0 }), withSpring(1, motion.spring))
    return
  }
  if (transition === "bump") {
    const motion = getBadgeBumpMotion(reduceMotion)
    if (motion === null) return
    scale.value = withSequence(
      withTiming(motion.peakScale, { duration: motion.peakDurationMs }),
      withSpring(1, motion.spring)
    )
    return
  }
  if (transition === "exit") {
    const motion = getBadgeExitMotion(reduceMotion)
    if (motion.durationMs === 0) {
      opacity.value = 0
      scale.value = motion.toScale
      return
    }
    opacity.value = withTiming(0, { duration: motion.durationMs })
    scale.value = withTiming(motion.toScale, { duration: motion.durationMs })
  }
}

// Always mounted so it can animate out; hidden from touch and from the
// accessibility tree while the count is zero.
function NavBadge(props: { count: number; ambient: boolean; reduceMotion: boolean }) {
  const { count, ambient, reduceMotion } = props
  const visible = isBottomNavBadgeVisible(count)
  const [labelCount, setLabelCount] = useState(count)
  const nextLabelCount = resolveBottomNavBadgeLabelCount(labelCount, count)
  if (nextLabelCount !== labelCount) setLabelCount(nextLabelCount)
  const scale = useSharedValue(visible ? 1 : 0)
  const opacity = useSharedValue(visible ? 1 : 0)
  const previousCount = useRef(count)

  useEffect(() => {
    const transition = resolveBottomNavBadgeTransition(previousCount.current, count)
    previousCount.current = count
    playBadgeTransition(transition, reduceMotion, scale, opacity)
  }, [count, opacity, reduceMotion, scale])

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }]
  }))

  return (
    <Reanimated.View
      pointerEvents="none"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[
        styles.bottomNavBadge,
        ambient ? styles.bottomNavBadgeAmbient : null,
        badgeStyle
      ]}
    >
      <Text style={styles.bottomNavBadgeText}>
        {formatBottomNavBadgeCount(nextLabelCount)}
      </Text>
    </Reanimated.View>
  )
}

function NavTab(props: {
  item: LocalizedBottomNavItem
  index: number
  indicator: SharedValue<number>
  isCurrent: boolean
  badgeCount: number | null
  onPress: () => void
  ambient: boolean
  reduceMotion: boolean
}) {
  const {
    item,
    index,
    indicator,
    isCurrent,
    badgeCount,
    onPress,
    ambient,
    reduceMotion,
  } = props
  // The selected icon and label fade in as the indicator arrives, so the
  // whole bar moves with a swipe instead of switching after it settles.
  const selectedLayerStyle = useAnimatedStyle(() => ({
    opacity: getBottomNavItemEmphasis(index, indicator.value)
  }))
  const restingLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - getBottomNavItemEmphasis(index, indicator.value)
  }))

  return (
    <View style={styles.bottomNavItemOuter}>
      {/* The selected tab stays pressable: a second tap is a reselect
          (scroll to top), which is silent, so only a tab change plays the
          selection haptic. */}
      <PressableScale
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isCurrent }}
        style={[
          styles.bottomNavItem,
          isCurrent ? styles.bottomNavItemActive : null,
        ]}
        onPress={() => {
          if (!isCurrent) hapticSelection()
          onPress()
        }}
        pressedScale={BOTTOM_NAV_PRESSED_SCALE}
        hitSlop={6}
      >
        <View style={styles.bottomNavIconWrap}>
          <Reanimated.View pointerEvents="none" style={[styles.iconLayer, restingLayerStyle]}>
            <Ionicons
              name={item.icon}
              size={22}
              color={uiTheme.colors.textMuted}
            />
          </Reanimated.View>
          <Reanimated.View pointerEvents="none" style={[styles.iconLayer, selectedLayerStyle]}>
            <Ionicons
              name={item.activeIcon}
              size={22}
              color={uiTheme.colors.primary}
              style={styles.iconZ}
            />
          </Reanimated.View>
        </View>
        {badgeCount === null ? null : (
          <NavBadge count={badgeCount} ambient={ambient} reduceMotion={reduceMotion} />
        )}
        <Reanimated.View pointerEvents="none" style={[styles.bottomNavLabelFrame, selectedLayerStyle]}>
          <Text
            accessible={false}
            style={[styles.bottomNavLabel, styles.bottomNavLabelActive]}
          >
            {item.label}
          </Text>
        </Reanimated.View>
      </PressableScale>
    </View>
  )
}

export function BottomNav(props: BottomNavProps) {
  const { currentKey, chatCount, onPress, appearance = "default", visible = true } = props
  const ambient = appearance === "ambient"
  const reduceMotion = useReducedMotion()
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
  const navLayout = resolveBottomNavLayout({
    viewportWidth: windowSize.width,
    safeAreaBottom: insets.bottom,
    visible: true,
  })
  const tabWidth = navLayout.tabWidth
  const itemCount = localizedItems.length
  usePublishToastBottomBarInset(navLayout.bottomOffset + navLayout.height, visible)

  // Indicator position in tab units. A committed selection change (tap,
  // navigation, end of a swipe) animates it on the UI thread; while the
  // main-page pager is dragged or settling, it follows the pages frame by
  // frame instead, so the bar never trails the page.
  const indicator = useSharedValue(activeIndex)
  // Selections settle on the snappy spring; Reduce Motion lands at once.
  const { snappy } = useMotion()
  useEffect(() => {
    // A pager tap already moved the pill on the UI thread (reaction below).
    if (!shouldAnimateBottomNavSelectionFromJs(mainTabPagerIndicator.selection.value, activeIndex)) return
    indicator.value = animateTo(activeIndex, snappy)
  }, [activeIndex, indicator, snappy])
  useAnimatedReaction(
    () => readMainTabPagerIndicatorProgress(mainTabPagerIndicator),
    (progress) => {
      if (progress === null) return
      indicator.value = resolveBottomNavIndicatorIndex(progress, itemCount)
    }
  )
  useAnimatedReaction(
    () => mainTabPagerIndicator.selection.value,
    (selection, previous) => {
      if (selection < 0 || selection === previous || mainTabPagerIndicator.tracking.value) return
      const target = resolveBottomNavIndicatorIndex(selection, itemCount)
      indicator.value = animateTo(target, snappy)
    },
    [itemCount, snappy]
  )
  // Liquid pill: it stretches with the speed it moves at (pager drag, settle
  // or a tap's spring) and springs back once it stops. All on the UI thread.
  const stretch = useSharedValue(1)
  const lastIndicatorSample = useSharedValue({ index: activeIndex, time: 0 })
  useAnimatedReaction(
    () => indicator.value,
    (index) => {
      const now = Date.now()
      const last = lastIndicatorSample.value
      lastIndicatorSample.value = { index, time: now }
      if (reduceMotion) return
      const speed = getBottomNavIndicatorSpeed(index - last.index, now - last.time)
      if (speed === null) return
      const eased = stretch.value + (getBottomNavLiquidStretch(speed) - stretch.value) * LIQUID_EASE
      stretch.value = withSequence(
        withTiming(eased, { duration: 0, reduceMotion: ReduceMotion.Never }),
        withDelay(LIQUID_RELEASE_DELAY_MS, animateTo(1, snappy), ReduceMotion.Never)
      )
    },
    [reduceMotion, snappy]
  )
  const activePillStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: indicator.value * tabWidth },
      { scaleX: stretch.value },
      // A touch thinner as it stretches, like a drop pulled along.
      { scaleY: 1 / Math.sqrt(stretch.value) }
    ]
  }))

  return (
    <View
      accessibilityRole="tablist"
      pointerEvents={visible ? "auto" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[
        styles.bottomNav,
        {
          bottom: navLayout.bottomOffset,
          height: navLayout.height,
          left: navLayout.horizontalInset,
          right: navLayout.horizontalInset,
          opacity: visible ? 1 : 0
        },
        ambient ? styles.bottomNavAmbient : null
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.navTint, ambient ? styles.navTintAmbient : null]}
      />
      <View pointerEvents="none" style={styles.navSheen} />
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.activeGlassPill,
          ambient ? styles.activeGlassPillAmbient : null,
          { width: tabWidth },
          activePillStyle
        ]}
      >
        <View pointerEvents="none" style={styles.activeGlassTint} />
      </Reanimated.View>
      {localizedItems.map((item, index) => {
        const isCurrent = item.key === currentKey
        return (
          <NavTab
            key={item.key}
            item={item}
            index={index}
            indicator={indicator}
            isCurrent={isCurrent}
            badgeCount={item.key === "chats" ? chatCount : null}
            onPress={() => onPress(item.key)}
            ambient={ambient}
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
  iconLayer: {
    ...StyleSheet.absoluteFill,
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
