/**
 * SwipeableDiscoverCard – a swipeable card for the discover deck.
 *
 * Supports:
 * - PanResponder-based horizontal drag gestures
 * - Upright translation while dragging
 * - Stamp overlays (LIKE / NOPE) that fade in with swipe direction
 * - Animated spring exit on release (if threshold met)
 * - Snap-back on release (if threshold not met)
 * - Photo display from dummy profile photo URLs
 * - Age + bio display for richer profile cards
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AvatarSelection, UserProfilePrompt } from "@blumi/contracts"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  type GestureResponderEvent,
  type ImageSourcePropType,
  type PanResponderGestureState,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import {
  CandidateAvatarPreview,
  createCandidateAvatarSnapshot
} from "../../components/DiscoverCard"
import { useReducedMotion } from "../../ui/animations"
import { uiTheme } from "../../ui/theme"
import { formatDiscoveryCardBio } from "../discovery/discoveryCandidateModel"
import {
  DISCOVERY_CARD_FLIP_DURATION,
  normalizeDiscoveryCardBack
} from "../discovery/discoveryCardFlipModel"
import type { DiscoveryCardLayoutMetrics } from "../discovery/discoveryLayoutMetrics"
import { getDiscoverySurfaceCopy } from "../discovery/discoverySurfaceCopy"
import { getAppLocale } from "../session/appLocale"

const SWIPE_OUT_DURATION = 190
const SWIPE_CAPTURE_THRESHOLD = 4
const SWIPE_DIRECTION_DOMINANCE = 1.1
const SWIPE_DISTANCE_RATIO = 0.22
const SWIPE_FLICK_VELOCITY = 0.55
const discoverCardSurface = require("../../../assets/ui/discover-card-surface.png")

export interface SwipeableDiscoverProfile {
  userId: string
  displayName: string
  age?: number
  bio?: string
  distance?: number
  distanceLabel?: string
  photoUrls?: string[]
  avatarPresetId?: string
  avatar?: AvatarSelection
  signals?: string[]
  prompts?: readonly UserProfilePrompt[]
  badges?: readonly string[]
  roomSnapshot?: ImageSourcePropType
  roomSnapshotUrl?: string
  roomHeadline?: string | null
}

interface SwipeableDiscoverCardProps {
  profile: SwipeableDiscoverProfile
  onSwipeRight: (userId: string) => void
  onSwipeLeft: (userId: string) => void
  swipeAnim?: Animated.ValueXY
  disabled?: boolean
  canSwipeRight?: boolean
  disableEntryAnim?: boolean
  compact?: boolean
  layoutMetrics?: DiscoveryCardLayoutMetrics
  onFlipChange?: (flipped: boolean) => void
}

export function SwipeableDiscoverCard(props: SwipeableDiscoverCardProps) {
  const {
    profile,
    onSwipeRight,
    onSwipeLeft,
    swipeAnim,
    disabled = false,
    canSwipeRight = true,
    disableEntryAnim = false,
    compact = false,
    layoutMetrics,
    onFlipChange
  } = props
  const localPosition = useRef(new Animated.ValueXY()).current
  const position = swipeAnim || localPosition
  const entryAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(0.78)).current
  const flipProgress = useRef(new Animated.Value(0)).current
  const [isBackVisible, setIsBackVisible] = useState(false)
  const { width: screenWidth } = useWindowDimensions()
  const swipeThreshold = Math.min(screenWidth * SWIPE_DISTANCE_RATIO, 96)
  const reduceMotion = useReducedMotion()
  const copy = getDiscoverySurfaceCopy(getAppLocale())
  const cardBack = useMemo(
    () => normalizeDiscoveryCardBack({
      prompt: profile.prompts?.[0]?.answer ?? profile.bio,
      interests: profile.signals,
      badges: profile.badges
    }),
    [profile.badges, profile.bio, profile.prompts, profile.signals]
  )

  // Both faces stay mounted while the card turns so no blank swap frame can appear.
  const frontRotation = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
    extrapolate: "clamp"
  })
  const backRotation = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
    extrapolate: "clamp"
  })
  const sheenTranslateX = flipProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-310, 0, 310],
    extrapolate: "clamp"
  })
  const sheenOpacity = flipProgress.interpolate({
    inputRange: [0, 0.12, 0.5, 0.88, 1],
    outputRange: [0, 0.2, 0.34, 0.2, 0],
    extrapolate: "clamp"
  })

  const toggleFlip = useCallback(() => {
    if (disabled) return
    const nextVisible = !isBackVisible
    setIsBackVisible(nextVisible)
    onFlipChange?.(nextVisible)
    if (reduceMotion) {
      flipProgress.setValue(nextVisible ? 1 : 0)
      return
    }
    Animated.timing(flipProgress, {
      toValue: nextVisible ? 1 : 0,
      duration: DISCOVERY_CARD_FLIP_DURATION,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true
    }).start()
  }, [disabled, flipProgress, isBackVisible, onFlipChange, reduceMotion])

  useEffect(() => {
    flipProgress.stopAnimation()
    flipProgress.setValue(0)
    setIsBackVisible(false)
  }, [flipProgress, profile.userId])

  // Entry animation
  useEffect(() => {
    if (disableEntryAnim || reduceMotion) {
      entryAnim.setValue(1)
      return
    }
    entryAnim.setValue(0)
    Animated.spring(entryAnim, {
      toValue: 1,
      tension: 68,
      friction: 9,
      useNativeDriver: true
    }).start()
  }, [disableEntryAnim, entryAnim, profile.userId, reduceMotion])

  // A single arrival pulse keeps online state visible without a perpetual
  // decorative loop competing with the profile content.
  useEffect(() => {
    if (disabled || reduceMotion) {
      pulseAnim.stopAnimation()
      pulseAnim.setValue(0.78)
      return
    }

    pulseAnim.setValue(0.78)
    const arrivalPulse = Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(pulseAnim, {
        toValue: 0.78,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ])
    arrivalPulse.start()

    return () => {
      arrivalPulse.stop()
      pulseAnim.stopAnimation()
    }
  }, [disabled, profile.userId, pulseAnim, reduceMotion])

  const resetPosition = useCallback(() => {
    if (reduceMotion) {
      position.setValue({ x: 0, y: 0 })
      return
    }
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      tension: 120,
      friction: 7,
      useNativeDriver: true
    }).start()
  }, [position, reduceMotion])

  const forceSwipe = useCallback(
    (direction: "left" | "right") => {
      const x = direction === "right" ? screenWidth * 1.2 : -screenWidth * 1.2
      Animated.timing(position, {
        toValue: { x, y: 0 },
        duration: reduceMotion ? 0 : SWIPE_OUT_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(() => {
        if (direction === "right") {
          onSwipeRight(profile.userId)
        } else {
          onSwipeLeft(profile.userId)
        }
      })
    },
    [onSwipeLeft, onSwipeRight, position, profile.userId, reduceMotion, screenWidth]
  )

  const panResponder = useMemo(
    () => {
      const shouldClaimSwipe = (
        _: GestureResponderEvent,
        gesture: PanResponderGestureState
      ): boolean =>
        !disabled &&
        Math.abs(gesture.dx) > SWIPE_CAPTURE_THRESHOLD &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * SWIPE_DIRECTION_DOMINANCE

      return PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: shouldClaimSwipe,
        onMoveShouldSetPanResponderCapture: shouldClaimSwipe,
        onPanResponderGrant: () => position.stopAnimation(),
        // PanResponder move events stay on JS, but the mapper avoids creating a
        // new React callback for every frame and keeps vertical drift removed.
        onPanResponderMove: Animated.event(
          [null, { dx: position.x }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: (_, gesture) => {
          const isFlickRight =
            gesture.vx > SWIPE_FLICK_VELOCITY && gesture.dx > 0
          const isFlickLeft =
            gesture.vx < -SWIPE_FLICK_VELOCITY && gesture.dx < 0

          if ((gesture.dx > swipeThreshold || isFlickRight) && canSwipeRight) {
            forceSwipe("right")
          } else if (gesture.dx < -swipeThreshold || isFlickLeft) {
            forceSwipe("left")
          } else {
            resetPosition()
          }
        },
        onPanResponderTerminate: resetPosition,
        onPanResponderTerminationRequest: () => false
      })
    },
    [canSwipeRight, disabled, forceSwipe, position, resetPosition, swipeThreshold]
  )

  // Stamp opacity
  const likeOpacity = position.x.interpolate({
    inputRange: [0, swipeThreshold * 0.5, swipeThreshold],
    outputRange: [0, 0.5, 1],
    extrapolate: "clamp"
  })
  const nopeOpacity = position.x.interpolate({
    inputRange: [-swipeThreshold, -swipeThreshold * 0.5, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp"
  })

  const firstName = profile.displayName.trim().split(/\s+/)[0] || profile.displayName
  const bio = formatDiscoveryCardBio(profile.bio)
  const distanceLabel =
    profile.distanceLabel ?? (
    typeof profile.distance !== "number"
      ? copy.card.privateLocation
      : profile.distance < 100
      ? copy.card.veryClose
      : profile.distance < 500
        ? `${profile.distance}m`
        : copy.card.nearby)
  const photoCount = Math.max(3, Math.min(5, profile.photoUrls?.length ?? 4))
  const avatarSnapshot = createCandidateAvatarSnapshot({
    userId: profile.userId,
    displayName: profile.displayName,
    avatarPresetId: profile.avatarPresetId,
    avatarSelection: profile.avatar
  })
  const avatarSize = layoutMetrics?.avatarSize ?? (compact ? 224 : 268)
  const avatarBottomInset = layoutMetrics?.avatarBottomInset ?? (compact ? 128 : 152)
  const infoOverlayBottom = layoutMetrics?.infoOverlayBottom ?? (compact ? 96 : 120)
  const infoOverlayPaddingVertical =
    layoutMetrics?.infoOverlayPaddingVertical ?? (compact ? 9 : 12)
  const nameFontSize = layoutMetrics?.nameFontSize ?? (compact ? 25 : 29)
  const ageFontSize = layoutMetrics?.ageFontSize ?? (compact ? 18 : 20)

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: entryAnim,
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { rotate: "0deg" },
            {
              scale: entryAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.92, 1]
              })
            }
          ]
        }
      ]}
      {...(disabled ? {} : panResponder.panHandlers)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isBackVisible ? copy.card.showProfile : copy.card.flipProfile}
        onPress={toggleFlip}
        style={StyleSheet.absoluteFill}
        disabled={disabled}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={discoverCardSurface}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.flipViewport} pointerEvents="none">
        <Animated.View
          style={[
            styles.face,
            styles.frontFace,
            {
              backfaceVisibility: "hidden",
              transform: [
                { perspective: 1000 },
                { rotateY: frontRotation }
              ]
            }
          ]}
        >
          <Animated.View style={[styles.stampContainer, styles.stampRight, { opacity: likeOpacity }]}>
            <View style={styles.likeStamp}>
              <Text style={styles.likeStampText}>{copy.card.likeStamp}</Text>
            </View>
          </Animated.View>
          <Animated.View style={[styles.stampContainer, styles.stampLeft, { opacity: nopeOpacity }]}>
            <View style={styles.nopeStamp}>
              <Text style={styles.nopeStampText}>{copy.card.passStamp}</Text>
            </View>
          </Animated.View>
          <View style={styles.photoProgress} pointerEvents="none">
            {Array.from({ length: photoCount }).map((_, index) => (
              <View
                key={`photo-progress-${index}`}
                style={[
                  styles.photoProgressTrack,
                  index === 0 ? styles.photoProgressTrackActive : null
                ]}
              />
            ))}
          </View>
          <View
            style={[styles.avatarContainer, { marginBottom: avatarBottomInset }]}
            pointerEvents="none"
          >
            <CandidateAvatarPreview
              snapshot={avatarSnapshot}
              size={avatarSize}
              stage="discover"
            />
          </View>
          <View
            style={[
              styles.infoOverlay,
              {
                bottom: infoOverlayBottom,
                paddingVertical: infoOverlayPaddingVertical
              }
            ]}
            pointerEvents="none"
          >
            <View style={styles.infoContent}>
              <View style={styles.nameRow}>
                <Animated.View style={[styles.onlineDot, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]} />
                <Text style={[styles.nameText, { fontSize: nameFontSize }]}>{firstName}</Text>
                <Text style={[styles.ageText, { fontSize: ageFontSize }]}>{profile.age}</Text>
              </View>
              {bio ? <Text style={styles.bioText} numberOfLines={2}>{bio}</Text> : null}
              <View style={styles.tagsRow}>
                {profile.signals?.slice(0, 2).map((signal) => (
                  <View key={signal} style={styles.signalPill}>
                    <Text style={styles.signalText} numberOfLines={1}>{signal}</Text>
                  </View>
                ))}
                <View style={styles.distancePill}>
                  <View style={styles.distanceDot} />
                  <Text style={styles.distanceText}>{distanceLabel}</Text>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.face,
            styles.backFace,
            {
              backfaceVisibility: "hidden",
              transform: [
                { perspective: 1000 },
                { rotateY: backRotation }
              ]
            }
          ]}
        >
          <DiscoveryCardBack
            profile={profile}
            snapshot={avatarSnapshot}
            content={cardBack}
            firstName={firstName}
              roomSnapshot={profile.roomSnapshot ?? (
                profile.roomSnapshotUrl ? { uri: profile.roomSnapshotUrl } : undefined
              )}
            roomHeadline={profile.roomHeadline ?? undefined}
            />
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.flipSheen,
            {
              opacity: reduceMotion ? 0 : sheenOpacity,
              transform: [
                { translateX: sheenTranslateX },
                { rotate: "18deg" }
              ]
            }
          ]}
        />
        </View>
        </Pressable>
    </Animated.View>
  )
}

function DiscoveryCardBack(props: {
  profile: SwipeableDiscoverProfile
  snapshot: ReturnType<typeof createCandidateAvatarSnapshot>
  content: ReturnType<typeof normalizeDiscoveryCardBack>
  firstName: string
  roomSnapshot?: ImageSourcePropType
  roomHeadline?: string
}) {
  const copy = getDiscoverySurfaceCopy(getAppLocale())
  const {
    profile,
    snapshot,
    content,
    firstName,
    roomSnapshot,
    roomHeadline
  } = props
  const visiblePrompt = content.prompt ?? normalizeDiscoveryCardBack({ prompt: profile.bio }).prompt
  const visibleInterests = content.interests.length > 0
    ? content.interests
    : normalizeDiscoveryCardBack({ interests: profile.signals }).interests
  return (
    <View style={styles.backContent}>
      <View style={styles.backBlobOne} pointerEvents="none" />
      <View style={styles.backBlobTwo} pointerEvents="none" />
      <View style={styles.backOrbitOne} pointerEvents="none" />
      <View style={styles.backOrbitTwo} pointerEvents="none" />
      <View style={styles.backAccentDot} pointerEvents="none" />
      <View style={styles.backTopRow}>
        <View style={styles.backIdentity}>
          <View style={styles.backAvatarRing}>
            <CandidateAvatarPreview snapshot={snapshot} size={54} stage="discover" />
          </View>
          <View>
            <Text style={styles.backOverline}>{copy.card.overline}</Text>
            <Text style={styles.backName}>{firstName}{profile.age ? `, ${profile.age}` : ""}</Text>
          </View>
        </View>
        <View pointerEvents="none" style={styles.backCloseButton}>
          <Ionicons name="arrow-up-outline" size={19} color={uiTheme.colors.primaryDeep} />
        </View>
      </View>
      <View style={styles.backMainPanel}>
        <Text style={styles.backCardHint}>{copy.card.continuationHint}</Text>
        <View style={styles.promptPanel}>
          <View style={styles.promptLabelRow}>
            <View style={styles.promptLabelDot} />
            <Text style={styles.promptLabel}>{copy.card.detailLabel}</Text>
          </View>
          <Text style={styles.promptText} numberOfLines={3}>
            {visiblePrompt ?? copy.card.detailFallback}
          </Text>
        </View>
        {visibleInterests.length > 0 ? (
          <View style={styles.backSection}>
            <Text style={styles.backSectionLabel}>{copy.card.commonGroundLabel}</Text>
            <View style={styles.backPillRow}>
              {visibleInterests.map((interest) => (
                <View key={interest} style={styles.backPill}>
                  <Text style={styles.backPillText} numberOfLines={1}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {content.badges.length > 0 ? (
          <View style={styles.backSection}>
            <Text style={styles.backSectionLabel}>{copy.card.highlightsLabel}</Text>
            <View style={styles.badgeRow}>
              {content.badges.map((badge) => (
                <View key={badge} style={styles.badgeDot}>
                  <View style={styles.badgeStar}>
                    <Ionicons name="sparkles-outline" size={13} color="#A46A12" />
                  </View>
                  <Text style={styles.badgeText} numberOfLines={1}>{badge}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      {roomSnapshot ? (
        <View style={styles.roomShowcasePanel}>
          <Image source={roomSnapshot} resizeMode="contain" style={styles.roomShowcaseImage} />
          <View style={styles.roomShowcaseWash} />
          <View style={styles.roomShowcaseCopy}>
            <Text style={styles.roomShowcaseLabel}>{copy.card.roomShowcaseLabel}</Text>
            {roomHeadline ? (
              <Text style={styles.roomShowcaseHeadline} numberOfLines={1}>
                {roomHeadline}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {roomSnapshot ? null : (
        <View style={styles.backFooter}>
          <Text style={styles.backFooterText}>{copy.card.returnHint}</Text>
          <View style={styles.backFooterLine} />
        </View>
      )}
    </View>
  )
}

/** Programmatic swipe trigger — used by action buttons */
export function useSwipeRef() {
  const positionRef = useRef(new Animated.ValueXY())
  return positionRef
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: uiTheme.ambientGlass.edgeLight,
    backgroundColor: uiTheme.ambientGlass.surface,
    overflow: "hidden",
  },
  face: {
    ...StyleSheet.absoluteFill,
  },
  flipViewport: {
    ...StyleSheet.absoluteFill,
  },
  frontFace: {
    zIndex: 2,
  },
  backFace: {
    zIndex: 1,
  },
  backContent: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 18,
    overflow: "hidden",
    backgroundColor: "#F8F4FF",
  },
  backMainPanel: {
    position: "absolute",
    top: 112,
    left: 24,
    right: 24,
    height: 326,
    zIndex: 4,
    overflow: "hidden",
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.58)",
  },
  roomShowcasePanel: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 50,
    height: 72,
    zIndex: 8,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E9DDF4",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)",
  },
  roomShowcaseImage: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 104,
    backgroundColor: "#E9DDF4",
    opacity: 0.96,
  },
  roomShowcaseWash: {
    ...StyleSheet.absoluteFill,
    left: 104,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  roomShowcaseCopy: {
    position: "absolute",
    left: 117,
    right: 13,
    bottom: 10,
  },
  roomShowcaseLabel: {
    ...uiTheme.font.overline,
    color: "#816B96",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  roomShowcaseHeadline: {
    ...uiTheme.font.bodyMedium,
    color: "#33213E",
    fontSize: 14,
    fontWeight: "800",
  },
  backBlobOne: {
    position: "absolute",
    width: 290,
    height: 178,
    borderRadius: 100,
    backgroundColor: "rgba(221, 204, 255, 0.72)",
    top: -104,
    right: -86,
    transform: [{ rotate: "-16deg" }],
  },
  backBlobTwo: {
    position: "absolute",
    width: 240,
    height: 168,
    borderRadius: 96,
    backgroundColor: "rgba(255, 210, 202, 0.62)",
    bottom: -100,
    left: -112,
    transform: [{ rotate: "18deg" }],
  },
  backOrbitOne: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1,
    borderColor: "rgba(125, 99, 174, 0.12)",
    top: -122,
    right: -110,
  },
  backOrbitTwo: {
    position: "absolute",
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 1,
    borderColor: "rgba(255, 125, 151, 0.16)",
    bottom: -78,
    left: -62,
  },
  backAccentDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    top: 108,
    right: 42,
    backgroundColor: "#FF8BA6",
    opacity: 0.72,
  },
  backTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backAvatarRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.74)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.95)",
  },
  backOverline: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primaryDeep,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  backName: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 27,
  },
  backCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.95)",
  },
  backCloseText: {
    color: uiTheme.colors.primaryDeep,
    fontSize: 21,
    fontWeight: "800",
    transform: [{ rotate: "-45deg" }],
  },
  flipSheen: {
    position: "absolute",
    top: -120,
    bottom: -120,
    width: 44,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    zIndex: 20,
  },
  backRule: {
    height: 1,
    backgroundColor: "rgba(76, 53, 72, 0.10)",
    marginTop: 16,
    marginBottom: 12,
  },
  backCardHint: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 1,
    marginBottom: 11,
  },
  promptPanel: {
    minHeight: 92,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255, 255, 255, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.98)",
  },
  promptLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 6,
  },
  promptLabelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF7C9B",
  },
  promptLabel: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.3,
    marginBottom: 7,
  },
  promptText: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textPrimary,
    fontSize: 17,
    lineHeight: 23,
  },
  backSection: {
    marginTop: 13,
  },
  backSectionLabel: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.3,
    marginBottom: 9,
  },
  backPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  backPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
  },
  backPillText: {
    ...uiTheme.font.label,
    color: uiTheme.colors.primaryDeep,
    maxWidth: 132,
    fontSize: 12,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  badgeDot: {
    minHeight: 28,
    maxWidth: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  badgeStar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: "center",
    lineHeight: 24,
    color: "#A46A12",
    backgroundColor: "#FFF2C8",
    fontSize: 13,
  },
  badgeText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    fontWeight: "700",
    maxWidth: 220,
  },
  backFooter: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  backFooterText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
  },
  backFooterLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(76, 53, 72, 0.12)",
  },
  heroGlow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    top: -60,
    left: -60,
    opacity: 0.25,
  },
  heroGlowSecondary: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255, 79, 152, 0.12)",
    right: -80,
    bottom: -80,
    opacity: 0.36,
  },
  stampContainer: {
    position: "absolute",
    top: uiTheme.spacing.xl,
    zIndex: 10,
  },
  stampRight: {
    left: uiTheme.spacing.lg,
  },
  stampLeft: {
    right: uiTheme.spacing.lg,
  },
  likeStamp: {
    borderWidth: 3,
    borderColor: uiTheme.colors.success,
    borderRadius: uiTheme.radius.md,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.xs,
    transform: [{ rotate: "-18deg" }],
  },
  likeStampText: {
    color: uiTheme.colors.success,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 3,
  },
  nopeStamp: {
    borderWidth: 3,
    borderColor: uiTheme.colors.danger,
    borderRadius: uiTheme.radius.md,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.xs,
    transform: [{ rotate: "18deg" }],
  },
  nopeStampText: {
    color: uiTheme.colors.danger,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 3,
  },
  avatarContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
    marginBottom: 152,
  },
  photoProgress: {
    position: "absolute",
    top: 14,
    left: 18,
    right: 18,
    zIndex: 16,
    flexDirection: "row",
    gap: 6,
  },
  photoProgressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  photoProgressTrackActive: {
    backgroundColor: "rgba(255, 255, 255, 0.88)",
  },
  infoOverlay: {
    position: "absolute",
    bottom: 120,
    left: 24,
    right: 24,
    borderRadius: 26,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: uiTheme.ambientGlass.surfaceStrong,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight,
    zIndex: 10,
  },
  infoContent: {
    gap: 4,
    alignItems: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  nameText: {
    color: "rgba(39, 27, 50, 0.92)",
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  ageText: {
    color: "rgba(76, 57, 91, 0.82)",
    fontSize: 20,
    fontWeight: "700",
    opacity: 0.95,
  },
  bioText: {
    color: "rgba(55, 42, 70, 0.78)",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    maxWidth: 276,
    textAlign: "center",
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: uiTheme.colors.success,
    marginRight: 2,
    alignSelf: "center",
  },
  tagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.xs,
    marginTop: 6,
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.ambientGlass.surfaceStrong,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight,
  },
  signalPill: {
    maxWidth: 112,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.ambientGlass.blush,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight
  },
  signalText: {
    color: uiTheme.colors.primaryDeep,
    fontSize: 11,
    fontWeight: "800"
  },
  distanceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: uiTheme.colors.success,
  },
  distanceText: {
    color: "rgba(55, 42, 70, 0.86)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
})
