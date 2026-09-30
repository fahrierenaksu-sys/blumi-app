import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  StyleSheet,
  Text,
  View
} from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { SwipeableDiscoverCard, type SwipeableDiscoverProfile } from "../demo/SwipeableDiscoverCard"
import { useReducedMotion } from "../../ui/animations"
import { ActionButtonCircle } from "../../ui/primitives"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import { useAppViewportMetrics } from "../../ui/layout/useAppViewportMetrics"
import { resolveDiscoveryLayoutMetrics } from "./discoveryLayoutMetrics"
import { getDiscoverySurfaceCopy } from "./discoverySurfaceCopy"
import { getAppLocale } from "../session/appLocale"
import type { DiscoveryRoomShowcaseQueryInput } from "./discoveryApi"
import { DISCOVERY_ACTION_ROW_FADE_DURATION } from "./discoveryCardFlipModel"
import {
  DISCOVER_PROMOTION_SPRING,
  getDiscoverDeckDragMotion,
  getDiscoverDeckRoleMotion,
  getDiscoverDeckRoleProgress,
  getDiscoverSwipeTranslateX,
  type DiscoverDeckRole
} from "./discoverySwipeModel"
import type { DiscoverSwipeValues } from "./useDiscoverSwipeValues"

const ACTION_SWIPE_DURATION = 190

interface DiscoveryDeckViewProps {
  profiles: readonly SwipeableDiscoverProfile[]
  swipeAnim: DiscoverSwipeValues
  onSwipeRight: (userId: string) => void
  onSwipeLeft: (userId: string) => void
  progressLabel: string
  likeDisabled?: boolean
  actionsDisabled?: boolean
  emptyContent?: React.ReactNode
  onFrontDisplay?: (part: "layout" | "surface" | "avatar") => void
  onFrontImageError?: () => void
  deferSecondaryImages?: boolean
  showcaseRequest?: Pick<
    DiscoveryRoomShowcaseQueryInput,
    "baseHttpUrl" | "viewerUserId" | "sessionToken"
  >
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
    emptyContent,
    showcaseRequest
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
  const actionRowOpacity = useSharedValue(1)
  const visibleProfiles = useMemo(
    () => [profiles[2], profiles[1], featured].filter(isProfile),
    [featured, profiles]
  )

  const finishActionSwipe = useCallback((
    direction: "left" | "right",
    finished: boolean,
    userId: string
  ): void => {
    actionSwipeInFlightRef.current = false
    setActionSwipeInFlight(false)
    if (!finished) {
      swipeAnim.x.value = 0
      return
    }
    if (direction === "right") {
      onSwipeRight(userId)
    } else {
      onSwipeLeft(userId)
    }
  }, [onSwipeLeft, onSwipeRight, swipeAnim])
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
      const userId = featured.userId
      // The exit runs on the UI thread; JS hears once when it ends.
      swipeAnim.ownerId.value = userId
      swipeAnim.x.value = withTiming(direction === "right" ? distance : -distance, {
        duration: ACTION_SWIPE_DURATION,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never
      }, (finished) => {
        "worklet"
        scheduleOnRN(finishActionSwipe, direction, finished === true, userId)
      })
    },
    [
      actionsDisabled,
      featured,
      finishActionSwipe,
      likeDisabled,
      screenWidth,
      swipeAnim
    ]
  )

  useLayoutEffect(() => {
    // A new top card starts at rest and nothing owns the drag yet. A card that
    // comes back after a refused decision already owns it (see
    // returnDiscoverSwipeCard) and keeps its return spring.
    if (swipeAnim.ownerId.value !== featured?.userId) {
      swipeAnim.x.value = 0
      swipeAnim.ownerId.value = ""
    }
    actionSwipeInFlightRef.current = false
    setActionSwipeInFlight(false)
    setIsFeaturedFlipped(false)
  }, [featured?.userId, swipeAnim])

  // The actions dissolve while the card shows its back. A dissolve is the
  // Reduce Motion substitute itself, so it runs in both modes.
  useEffect(() => {
    actionRowOpacity.value = withTiming(isFeaturedFlipped ? 0 : 1, {
      duration: DISCOVERY_ACTION_ROW_FADE_DURATION,
      reduceMotion: ReduceMotion.Never
    })
  }, [actionRowOpacity, isFeaturedFlipped])
  const actionRowFadeStyle = useAnimatedStyle(() => ({ opacity: actionRowOpacity.value }))

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

            return (
              <DeckCardContainer
                key={profile.userId}
                role={isTop ? "top" : isMiddle ? "middle" : "bottom"}
                featuredUserId={featured.userId}
                swipe={swipeAnim}
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
                  showcaseRequest={isTop ? showcaseRequest : undefined}
                  imagePriority={isTop ? "high" : "low"}
                  onFrontDisplay={isTop ? props.onFrontDisplay : undefined}
                  onFrontImageError={isTop ? props.onFrontImageError : undefined}
                  deferFrontAvatar={!isTop && props.deferSecondaryImages}
                  deferBackAvatar={props.deferSecondaryImages}
                />
              </DeckCardContainer>
            )
          })}

          <Animated.View
            style={[
              styles.actionRow,
              {
                bottom: viewportLayout.action.bottom,
                paddingHorizontal: viewportLayout.action.horizontalPadding,
                paddingVertical: viewportLayout.action.verticalPadding
              },
              actionRowFadeStyle
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
          </Animated.View>
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

/**
 * One stack slot. Every role goes through the same animated style so a card
 * keeps one style shape as it moves bottom -> middle -> top. The role is a
 * shared progress (bottom 0, middle 1, top 2) that springs to the new slot
 * when the card above leaves or comes back, so a promoted card moves instead
 * of jumping; under Reduce Motion it takes the new slot at once. The top card
 * is at rest (it moves inside SwipeableDiscoverCard), the middle card
 * advances with the featured card's drag on the UI thread, the bottom card
 * fans out, and the frosted overlay fades out as a card reaches the top.
 */
function DeckCardContainer(props: {
  role: DiscoverDeckRole
  featuredUserId: string
  swipe: DiscoverSwipeValues
  children: ReactNode
}) {
  const { role, featuredUserId, swipe } = props
  const swipeX = swipe.x
  const swipeOwnerId = swipe.ownerId
  const reduceMotion = useReducedMotion()
  // A card mounts in its slot; only later role changes move it.
  const roleProgress = useSharedValue(getDiscoverDeckRoleProgress(role))
  useEffect(() => {
    const target = getDiscoverDeckRoleProgress(role)
    roleProgress.value = reduceMotion
      ? target
      : withSpring(target, { ...DISCOVER_PROMOTION_SPRING, reduceMotion: ReduceMotion.Never })
  }, [reduceMotion, role, roleProgress])
  const motionStyle = useAnimatedStyle(() => {
    const dragX = role === "middle"
      ? getDiscoverSwipeTranslateX(swipeOwnerId.value, featuredUserId, swipeX.value)
      : 0
    const motion = getDiscoverDeckRoleMotion(roleProgress.value, getDiscoverDeckDragMotion(role, dragX))
    return {
      opacity: motion.opacity,
      transform: [
        { translateX: motion.translateX },
        { translateY: motion.translateY },
        { rotate: `${motion.rotateDeg}deg` },
        { scale: motion.scale }
      ]
    }
  })
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: getDiscoverDeckRoleMotion(roleProgress.value, getDiscoverDeckDragMotion(role, 0)).overlayOpacity
  }))
  return (
    <Animated.View
      style={[
        role === "top"
          ? styles.topCardContainer
          : role === "middle"
            ? styles.middleCardContainer
            : styles.bottomCardContainer,
        motionStyle
      ]}
      pointerEvents={role === "top" ? "auto" : "none"}
    >
      {props.children}
      <GlassDeckOverlay style={overlayStyle} />
    </Animated.View>
  )
}

/** Frosts cards behind the top card; never takes a touch, even when faded out on top. */
function GlassDeckOverlay(props: { style: ReturnType<typeof useAnimatedStyle> }) {
  return (
    <Animated.View pointerEvents="none" style={[styles.glassOverlay, props.style]}>
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
    </Animated.View>
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
  // Transforms and opacity per role live in DeckCardContainer's animated style.
  topCardContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 3
  },
  middleCardContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1
  },
  bottomCardContainer: {
    ...StyleSheet.absoluteFill,
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
