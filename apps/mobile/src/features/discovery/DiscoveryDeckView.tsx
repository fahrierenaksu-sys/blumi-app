import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View
} from "react-native"
import { SwipeableDiscoverCard, type SwipeableDiscoverProfile } from "../demo/SwipeableDiscoverCard"
import { ActionButtonCircle } from "../../ui/primitives"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import { useAppViewportMetrics } from "../../ui/layout/useAppViewportMetrics"
import { resolveDiscoveryLayoutMetrics } from "./discoveryLayoutMetrics"
import { getDiscoverySurfaceCopy } from "./discoverySurfaceCopy"
import { getAppLocale } from "../session/appLocale"

const ACTION_SWIPE_DURATION = 190

interface DiscoveryDeckViewProps {
  profiles: readonly SwipeableDiscoverProfile[]
  swipeAnim: Animated.ValueXY
  onSwipeRight: (userId: string) => void
  onSwipeLeft: (userId: string) => void
  progressLabel: string
  likeDisabled?: boolean
  actionsDisabled?: boolean
  emptyContent?: React.ReactNode
}

export function DiscoveryDeckView(props: DiscoveryDeckViewProps) {
  const {
    profiles,
    swipeAnim,
    onSwipeRight,
    onSwipeLeft,
    progressLabel,
    likeDisabled = false,
    actionsDisabled = false,
    emptyContent
  } = props
  const featured = profiles[0]
  const copy = getDiscoverySurfaceCopy(getAppLocale())
  const { width: screenWidth, height: screenHeight } = useAppViewportMetrics({
    bottomNavVisible: true
  })
  const viewportLayout = resolveDiscoveryLayoutMetrics(screenWidth, screenHeight)
  const actionSwipeInFlightRef = useRef(false)
  const [actionSwipeInFlight, setActionSwipeInFlight] = useState(false)
  const [isFeaturedFlipped, setIsFeaturedFlipped] = useState(false)
  const visibleProfiles = useMemo(
    () => [profiles[2], profiles[1], featured].filter(isProfile),
    [featured, profiles]
  )

  const middleCardScale = swipeAnim.x.interpolate({
    inputRange: [-400, 0, 400],
    outputRange: [1, 0.98, 1],
    extrapolate: "clamp"
  })
  const middleCardTranslateX = swipeAnim.x.interpolate({
    inputRange: [-400, 0, 400],
    outputRange: [0, -8, 0],
    extrapolate: "clamp"
  })
  const middleCardTranslateY = swipeAnim.x.interpolate({
    inputRange: [-400, 0, 400],
    outputRange: [0, -12, 0],
    extrapolate: "clamp"
  })
  const runActionSwipe = useCallback(
    (direction: "left" | "right"): void => {
      if (
        !featured ||
        actionSwipeInFlightRef.current ||
        actionsDisabled ||
        (direction === "right" && likeDisabled)
      ) {
        return
      }

      actionSwipeInFlightRef.current = true
      setActionSwipeInFlight(true)
      const distance = screenWidth * 1.2
      Animated.timing(swipeAnim, {
        toValue: {
          x: direction === "right" ? distance : -distance,
          y: 0
        },
        duration: ACTION_SWIPE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(({ finished }) => {
        actionSwipeInFlightRef.current = false
        setActionSwipeInFlight(false)
        if (!finished) {
          swipeAnim.setValue({ x: 0, y: 0 })
          return
        }
        if (direction === "right") {
          onSwipeRight(featured.userId)
        } else {
          onSwipeLeft(featured.userId)
        }
      })
    },
    [
      actionsDisabled,
      featured,
      likeDisabled,
      onSwipeLeft,
      onSwipeRight,
      screenWidth,
      swipeAnim
    ]
  )

  useLayoutEffect(() => {
    swipeAnim.setValue({ x: 0, y: 0 })
    actionSwipeInFlightRef.current = false
    setActionSwipeInFlight(false)
    setIsFeaturedFlipped(false)
  }, [featured?.userId, swipeAnim])

  return (
    <View style={styles.container}>
      {featured ? (
        <View
          style={[
            styles.deckWrapper,
            { height: viewportLayout.deckHeight }
          ]}
        >
          {visibleProfiles.map((profile) => {
            const isTop = profile.userId === featured.userId
            const isMiddle = profile.userId === profiles[1]?.userId
            const containerStyle = isTop
              ? styles.topCardContainer
              : isMiddle
                ? [
                    styles.middleCardContainer,
                    {
                      transform: [
                        { translateX: middleCardTranslateX },
                        { translateY: middleCardTranslateY },
                        { rotate: "0deg" },
                        { scale: middleCardScale }
                      ]
                    }
                  ]
                : styles.bottomCardContainer

            return (
              <Animated.View
                key={profile.userId}
                style={containerStyle}
                pointerEvents={isTop ? "auto" : "none"}
              >
                <SwipeableDiscoverCard
                  profile={profile}
                  onSwipeRight={isTop ? onSwipeRight : noopSwipe}
                  onSwipeLeft={isTop ? onSwipeLeft : noopSwipe}
                  swipeAnim={isTop ? swipeAnim : undefined}
                  disabled={!isTop || actionsDisabled || actionSwipeInFlight}
                  canSwipeRight={!likeDisabled}
                  disableEntryAnim
                  layoutMetrics={viewportLayout.card}
                  onFlipChange={isTop ? setIsFeaturedFlipped : undefined}
                />
                {!isTop ? <GlassDeckOverlay /> : null}
              </Animated.View>
            )
          })}

          <View
            style={[
              styles.actionRow,
              {
                opacity: isFeaturedFlipped ? 0 : 1,
                bottom: viewportLayout.action.bottom,
                paddingHorizontal: viewportLayout.action.horizontalPadding,
                paddingVertical: viewportLayout.action.verticalPadding
              }
            ]}
            pointerEvents={isFeaturedFlipped ? "none" : "box-none"}
          >
            <View style={styles.actionItem}>
              <ActionButtonCircle
                accessibilityLabel={copy.actions.passAccessibilityLabel}
                onPress={() => runActionSwipe("left")}
                size={viewportLayout.action.secondarySize}
                variant="glass"
                disabled={actionsDisabled || actionSwipeInFlight}
                style={styles.secondaryActionButton}
              >
                <Ionicons name="close" size={26} color={styles.icon.color} />
              </ActionButtonCircle>
              <Text style={styles.actionLabel}>{copy.actions.pass}</Text>
            </View>
            <View style={styles.actionItem}>
              <ActionButtonCircle
                accessibilityLabel={copy.actions.likeAccessibilityLabel}
                onPress={() => runActionSwipe("right")}
                size={viewportLayout.action.primarySize}
                variant="primary"
                disabled={actionsDisabled || likeDisabled || actionSwipeInFlight}
                style={styles.primaryLikeButton}
              >
                <Ionicons name="heart" size={27} color={uiTheme.colors.textInverted} />
              </ActionButtonCircle>
              <Text style={[styles.actionLabel, styles.primaryActionLabel]}>{copy.actions.like}</Text>
            </View>
          </View>
        </View>
      ) : (
        emptyContent ?? null
      )}

      {featured && viewportLayout.showProgress ? (
        <View style={styles.progressRow}>
          <View style={styles.progressDot} />
          <Text style={styles.progressText}>{progressLabel}</Text>
        </View>
      ) : null}
    </View>
  )
}

function GlassDeckOverlay() {
  return (
    <View style={styles.glassOverlay}>
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 0.40)",
          "rgba(255, 255, 255, 0.05)",
          "rgba(255, 255, 255, 0.15)"
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

function isProfile(
  profile: SwipeableDiscoverProfile | undefined
): profile is SwipeableDiscoverProfile {
  return profile !== undefined
}


function noopSwipe(_userId: string): void {}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: uiTheme.spacing.md,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20
  },
  deckWrapper: {
    marginTop: 10,
    position: "relative"
  },
  topCardContainer: {
    ...StyleSheet.absoluteFill,
    transform: [
      { translateX: 0 },
      { translateY: 0 },
      { rotate: "0deg" },
      { scale: 1 }
    ],
    opacity: 1,
    zIndex: 3
  },
  middleCardContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1
  },
  bottomCardContainer: {
    ...StyleSheet.absoluteFill,
    transform: [
      { translateX: -10 },
      { translateY: -30 },
      { rotate: "-3deg" },
      { scale: 0.98 }
    ],
    opacity: 0.96,
    zIndex: 0
  },
  glassOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.92)",
    backgroundColor: uiTheme.ambientGlass.surfaceQuiet,
    overflow: "hidden"
  },
  actionRow: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: uiTheme.ambientGlass.surface,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight,
    zIndex: 20,
  },
  secondaryActionButton: {
    backgroundColor: uiTheme.ambientGlass.surfaceQuiet,
    borderColor: uiTheme.ambientGlass.edgeLight
  },
  primaryLikeButton: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0
  },
  actionItem: {
    alignItems: "center",
    gap: 3
  },
  actionLabel: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700"
  },
  primaryActionLabel: {
    color: uiTheme.colors.primaryDeep
  },
  icon: {
    color: "rgba(44, 31, 55, 0.76)"
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: -uiTheme.spacing.xs
  },
  progressDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: uiTheme.colors.success
  },
  progressText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3
  }
})
