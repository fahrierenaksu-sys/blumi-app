import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useIsFocused } from "@react-navigation/native"
import {
  StyleSheet,
  Text,
  View
} from "react-native"
import Animated, {
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"
import { SwipeableDiscoverCard, type SwipeableDiscoverProfile } from "../demo/SwipeableDiscoverCard"
import type { DiscoverCardExitRequest } from "../demo/useDiscoverCardSwipe"
import { useReducedMotion } from "../../ui/animations"
import { hapticLight } from "../../ui/haptics"
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
  DISCOVER_DECK_ENTRANCE_MS,
  DISCOVER_MIDDLE_CARD_TRAVEL,
  getDiscoverActionExitDuration,
  getDiscoverDeckCardProgress,
  getDiscoverDeckDragMotion,
  getDiscoverDeckEntrance,
  getDiscoverDeckRoleMotion,
  getDiscoverDeckRoleProgress,
  getDiscoverMiddleCardAdvance,
  getDiscoverSwipeTranslateX,
  isDiscoverDeckRoleOnScript,
  type DiscoverDeckAnchor,
  type DiscoverDeckRole
} from "./discoverySwipeModel"
import {
  advanceDiscoverDeck,
  reanchorDiscoverDeckCard,
  useDiscoverDeckAdvance,
  type DiscoverDeckAdvance,
  type DiscoverSwipeValues
} from "./useDiscoverSwipeValues"

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
  const viewportLayout = useMemo(
    () => resolveDiscoveryLayoutMetrics(screenWidth, screenHeight),
    [screenWidth, screenHeight]
  )
  const reduceMotion = useReducedMotion()
  // The deck's one live avatar (plan 2.2): only while this page is the focused, shown one.
  const isDiscoverFocused = useIsFocused()
  const [isFeaturedFlipped, setIsFeaturedFlipped] = useState(false)
  const actionRowOpacity = useSharedValue(1)
  const visibleProfiles = useMemo(
    () => [profiles[2], profiles[1], featured].filter(isProfile),
    [featured, profiles]
  )
  // A decided card leaves the deck at release (DSC-10): the next card is the
  // top card at once, while the decided one flies out above it untouchable
  // and is removed when its exit ends. Same key, so it is never remounted.
  const [leavingProfiles, setLeavingProfiles] = useState<readonly SwipeableDiscoverProfile[]>([])
  const leavingIdsRef = useRef(new Set<string>())
  const [exitRequest, setExitRequest] = useState<(DiscoverCardExitRequest & { userId: string }) | null>(null)
  const deckMountedRef = useRef(false)
  useEffect(() => { deckMountedRef.current = true }, [])
  const visibleIds = new Set(visibleProfiles.map((profile) => profile.userId))
  const flyingProfiles = leavingProfiles.filter((profile) => !visibleIds.has(profile.userId))
  // Decisions advance the deck on the UI thread at the release; React follows
  // with the roles. `deckCommits` is the same count on the JS side.
  const deckAdvance = useDiscoverDeckAdvance()
  const [deckCommits, setDeckCommits] = useState(0)
  const [settledCommits, setSettledCommits] = useState(-1)
  const handleDeckSettled = useCallback((commits: number) => {
    startTransition(() => setSettledCommits(commits))
  }, [])
  useAnimatedReaction(() => deckAdvance.settled.value, (settled, previous) => {
    if (settled !== previous) scheduleOnRN(handleDeckSettled, settled)
  })
  // The card after the bottom one mounts hidden once the deck is at rest, so
  // a decision only re-roles mounted cards and never mounts one mid-motion.
  const standbyCandidate = settledCommits === deckCommits ? profiles[3] : undefined
  const standbyProfile = standbyCandidate &&
    !visibleIds.has(standbyCandidate.userId) &&
    !leavingProfiles.some((profile) => profile.userId === standbyCandidate.userId)
    ? standbyCandidate
    : undefined

  const beginLeaving = useCallback((profile: SwipeableDiscoverProfile): boolean => {
    if (leavingIdsRef.current.has(profile.userId)) return false
    leavingIdsRef.current.add(profile.userId)
    setLeavingProfiles((current) => [...current.filter((entry) => entry.userId !== profile.userId), profile])
    return true
  }, [])
  const finishLeaving = useCallback((userId: string): void => {
    leavingIdsRef.current.delete(userId)
    setLeavingProfiles((current) => current.filter((entry) => entry.userId !== userId))
    setExitRequest((current) => current?.userId === userId ? null : current)
  }, [])
  const commitTopSwipe = useCallback((direction: "left" | "right", userId: string): void => {
    // Pairs with the UI-thread advance of this decision (release or press).
    setDeckCommits((current) => current + 1)
    if (featured?.userId === userId) beginLeaving(featured)
    if (direction === "right") {
      onSwipeRight(userId)
    } else {
      onSwipeLeft(userId)
    }
  }, [beginLeaving, featured, onSwipeLeft, onSwipeRight])
  const handleTopSwipeRight = useCallback((userId: string) => commitTopSwipe("right", userId), [commitTopSwipe])
  const handleTopSwipeLeft = useCallback((userId: string) => commitTopSwipe("left", userId), [commitTopSwipe])

  const runActionSwipe = useCallback(
    (direction: "left" | "right"): void => {
      if (
        !featured ||
        leavingIdsRef.current.has(featured.userId) ||
        actionsDisabled ||
        (direction === "right" && likeDisabled)
      ) {
        return
      }
      // The press is the commit: haptic, decision and the next card now; the
      // card flies out on the UI thread (instantly under Reduce Motion).
      hapticLight()
      scheduleOnUI(advanceDiscoverDeck, deckAdvance, reduceMotion)
      setExitRequest({
        userId: featured.userId,
        direction,
        durationMs: getDiscoverActionExitDuration(reduceMotion, screenWidth),
        thrown: true
      })
      commitTopSwipe(direction, featured.userId)
    },
    [actionsDisabled, commitTopSwipe, deckAdvance, featured, likeDisabled, reduceMotion, screenWidth]
  )

  useLayoutEffect(() => {
    // A new top card starts at rest and nothing owns the drag yet. A card that
    // comes back after a refused decision already owns it (see
    // returnDiscoverSwipeCard) and keeps its return spring.
    if (swipeAnim.ownerId.value !== featured?.userId) {
      swipeAnim.x.value = 0
      swipeAnim.ownerId.value = ""
    }
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
          {[...(standbyProfile ? [standbyProfile] : []), ...visibleProfiles, ...flyingProfiles].map((profile) => {
            const isStandby = profile.userId === standbyProfile?.userId
            const leaving = !isStandby && !visibleIds.has(profile.userId)
            const isTop = profile.userId === featured.userId
            const isMiddle = profile.userId === profiles[1]?.userId

            return (
              <DeckCardContainer
                key={profile.userId}
                role={isStandby ? "standby" : isTop || leaving ? "top" : isMiddle ? "middle" : "bottom"}
                leaving={leaving}
                entering={deckMountedRef.current}
                featuredUserId={featured.userId}
                swipe={swipeAnim}
                deck={deckAdvance}
                deckCommits={deckCommits}
              >
                <SwipeableDiscoverCard
                  profile={profile}
                  onSwipeRight={isTop ? handleTopSwipeRight : noopSwipe}
                  onSwipeLeft={isTop ? handleTopSwipeLeft : noopSwipe}
                  swipeAnim={isTop || leaving ? swipeAnim : undefined}
                  deckAdvance={isTop ? deckAdvance : undefined}
                  disabled={!isTop || actionsDisabled}
                  leaving={leaving}
                  exitRequest={exitRequest?.userId === profile.userId ? exitRequest : null}
                  onExitEnd={finishLeaving}
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
                  avatarLiveActive={isTop && !leaving && isDiscoverFocused}
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
                disabled={actionsDisabled}
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
                disabled={actionsDisabled || likeDisabled}
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
 * keeps one style shape as it moves standby -> bottom -> middle -> top. Its
 * slot is a progress (standby -1, bottom 0, middle 1, top 2) read from the
 * deck's UI-thread advance: a release moves every card toward its next slot
 * in that frame, before React hears of the decision, and React's new roles
 * only confirm where the cards already are. A role change no decision
 * explains (a refused decision coming back) re-anchors the card, which then
 * springs to its slot from where it is; under Reduce Motion slots are taken
 * at once. The top card is at rest (it moves inside SwipeableDiscoverCard),
 * the middle card advances with the featured card's drag on the UI thread,
 * the bottom card fans out, and the frosted overlay clears with that drag
 * (DSC-11). A promoted card continues from the drag it was promoted at. The
 * standby card is hidden; it fades in as it reaches the back of the deck, as
 * does a card mounted straight into the deck (DSC-11). A leaving card stays
 * above the deck and never takes a touch.
 */
function DeckCardContainer(props: {
  role: DiscoverDeckRole
  leaving: boolean
  entering: boolean
  featuredUserId: string
  swipe: DiscoverSwipeValues
  deck: DiscoverDeckAdvance
  deckCommits: number
  children: ReactNode
}) {
  const { role, leaving, featuredUserId, swipe, deck, deckCommits } = props
  const swipeX = swipe.x
  const swipeOwnerId = swipe.ownerId
  const deckStep = deck.step
  const deckTarget = deck.target
  const reduceMotion = useReducedMotion()
  const rank = getDiscoverDeckRoleProgress(role)
  // A card mounts in its slot, anchored at the decisions committed so far.
  const anchorRank = useSharedValue(rank)
  const anchorStep = useSharedValue(deckCommits)
  const anchorRef = useRef<DiscoverDeckAnchor>({ rank, commits: deckCommits })
  // A card that starts on top was carried fully forward.
  const promotedDragX = useSharedValue(DISCOVER_MIDDLE_CARD_TRAVEL)
  const entrance = useSharedValue(props.entering || role === "standby" ? 0 : 1)
  const previousRef = useRef({ role, featuredUserId })
  // Child layout effects run before the deck's, so the drag of the card that
  // just left is still readable here (the deck resets it for the new top).
  useLayoutEffect(() => {
    const previous = previousRef.current
    previousRef.current = { role, featuredUserId }
    if (role === "top" && previous.role === "middle") {
      promotedDragX.value = getDiscoverSwipeTranslateX(swipeOwnerId.value, previous.featuredUserId, swipeX.value)
    }
  }, [featuredUserId, promotedDragX, role, swipeOwnerId, swipeX])
  useLayoutEffect(() => {
    if (isDiscoverDeckRoleOnScript(anchorRef.current, role, deckCommits)) return
    anchorRef.current = { rank, commits: deckCommits }
    scheduleOnUI(reanchorDiscoverDeckCard, { rank: anchorRank, step: anchorStep }, deckStep, rank, deckCommits, reduceMotion)
  }, [anchorRank, anchorStep, deckCommits, deckStep, rank, reduceMotion, role])
  // A card fades in when the deck reveals it (at the release, before it has
  // moved) and out if it goes back to standby. A fade is the Reduce Motion
  // substitute itself, so it runs in both modes.
  useAnimatedReaction(
    () => getDiscoverDeckCardProgress(anchorRank.value, anchorStep.value, deckTarget.value) > STANDBY_PROGRESS,
    (revealed, previous) => {
      if (revealed === previous) return
      entrance.value = withTiming(revealed ? 1 : 0, { duration: DISCOVER_DECK_ENTRANCE_MS, reduceMotion: ReduceMotion.Never })
    }
  )
  const motionStyle = useAnimatedStyle(() => {
    const progress = getDiscoverDeckCardProgress(anchorRank.value, anchorStep.value, deckStep.value)
    const dragX = role === "middle"
      ? getDiscoverSwipeTranslateX(swipeOwnerId.value, featuredUserId, swipeX.value)
      : 0
    const motion = getDiscoverDeckRoleMotion(progress, getDiscoverDeckDragMotion(role, dragX, promotedDragX.value))
    const arrival = getDiscoverDeckEntrance(entrance.value, reduceMotion)
    return {
      opacity: motion.opacity * arrival.opacity,
      transform: [
        { translateX: motion.translateX },
        { translateY: motion.translateY },
        { rotate: `${motion.rotateDeg}deg` },
        { scale: motion.scale * arrival.scale }
      ]
    }
  })
  const overlayStyle = useAnimatedStyle(() => {
    const progress = getDiscoverDeckCardProgress(anchorRank.value, anchorStep.value, deckStep.value)
    const dragX = role === "middle"
      ? getDiscoverSwipeTranslateX(swipeOwnerId.value, featuredUserId, swipeX.value)
      : role === "top" ? promotedDragX.value : 0
    return {
      opacity: getDiscoverDeckRoleMotion(progress, getDiscoverDeckDragMotion(role, 0), getDiscoverMiddleCardAdvance(dragX)).overlayOpacity
    }
  })
  return (
    <Animated.View
      style={[
        leaving
          ? styles.leavingCardContainer
          : role === "top"
            ? styles.topCardContainer
            : role === "middle"
              ? styles.middleCardContainer
              : styles.bottomCardContainer,
        motionStyle
      ]}
      pointerEvents={role === "top" && !leaving ? "auto" : "none"}
    >
      {/* A card behind the top one is static: iOS keeps its content as one
          bitmap (the motion and frost around it do not invalidate it). */}
      <View style={styles.cardContent} shouldRasterizeIOS={role !== "top" && !leaving}>
        {props.children}
      </View>
      <GlassDeckOverlay style={overlayStyle} />
    </Animated.View>
  )
}

const STANDBY_PROGRESS = getDiscoverDeckRoleProgress("standby")

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
  leavingCardContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 4
  },
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
  cardContent: {
    flex: 1
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
