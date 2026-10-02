import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { useEffect, useEffectEvent, useRef, useState, type ComponentProps } from "react"
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { MyAvatar } from "../ui/myAvatar"
import {
  CandidateAvatarPreview,
  createCandidateAvatarSnapshot,
  type CandidateAvatarSnapshot
} from "./DiscoverCard"
import { PrimaryButton, SecondaryButton } from "../ui/primitives"
import { useReducedMotion } from "../ui/animations"
import { hapticSuccess } from "../ui/haptics"
import { FlightLayer, FlightTargetView } from "../ui/flight/FlightLayer"
import { isFlightFrameUsable } from "../ui/flight/flightModel"
import { matchFlightSources } from "../features/matches/matchFlightSource"
import { launchMatchChibiFlight } from "../features/matches/matchChibiFlight"
import { MATCH_CONFETTI_PIECES, planMatchMeeting } from "../features/matches/matchMeetingModel"
import { useMatchMeeting } from "../features/matches/useMatchMeeting"
import {
  getMatchCelebrationMotion,
  getMatchResultPresentation,
  shouldPlayMatchHaptic
} from "../features/matches/matchResultPresentation"
import { getAppLocale } from "../features/session/appLocale"
import { uiTheme } from "../ui/theme"

interface MatchResultModalProps {
  visible: boolean
  currentUserName: string
  matchedUserName: string
  matchedUserId?: string
  matchedAvatarSnapshot?: CandidateAvatarSnapshot
  /** The partner's real avatar; without it a preview outfit is shown (DSC-3). */
  matchedAvatarSelection?: AvatarSelection
  onClose: () => void
  onKeepDiscovering: () => void
  onSendMessage: () => void
}

// ── Confetti particle config ─────────────────────────────────
// A light celebration: a few pieces, burst on the chibis' contact.
const PARTICLE_COUNT = MATCH_CONFETTI_PIECES
const PARTICLE_COLORS = [
  "#FF6B9D", "#C084FC", "#FF9A76", "#FACC15",
  "#4ADE80", "#60A5FA", "#F472B6", "#A78BFA",
  "#FB923C", "#34D399", "#818CF8", "#F87171"
]

interface ParticleConfig {
  color: string
  startX: number
  endY: number
  rotation: string
  size: number
  icon: ComponentProps<typeof Ionicons>["name"]
}

const PARTICLE_ICONS: readonly ComponentProps<typeof Ionicons>["name"][] = [
  "sparkles",
  "heart",
  "diamond",
  "ellipse",
  "star",
  "heart-outline"
]
const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons)

function buildParticles(): ParticleConfig[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    startX: -120 + Math.random() * 240,
    endY: -180 - Math.random() * 60,
    rotation: `${-180 + Math.random() * 360}deg`,
    size: 8 + Math.random() * 10,
    icon: PARTICLE_ICONS[i % PARTICLE_ICONS.length]
  }))
}

/** One confetti piece: its own UI-thread progress, from the burst centre outwards. */
function ConfettiParticle(props: { particle: ParticleConfig; index: number }) {
  const { particle, index } = props
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withDelay(
      index * 85,
      withTiming(1, {
        duration: 900 + index * 60,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never
      })
    )
  }, [index, progress])
  const rotation = parseFloat(particle.rotation)
  const style = useAnimatedStyle(() => {
    const t = progress.value
    return {
      opacity: t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7,
      transform: [
        { translateX: particle.startX * t },
        { translateY: particle.endY * t },
        { rotate: `${rotation * t}deg` },
        { scale: t < 0.4 ? (t / 0.4) * 1.2 : 1.2 - ((t - 0.4) / 0.6) * 0.6 }
      ]
    }
  })
  return (
    <AnimatedIonicons
      accessible={false}
      name={particle.icon}
      color={particle.color}
      size={particle.size}
      style={[confettiStyles.particle, style]}
    />
  )
}

/** Mounted only while playing, so every burst starts from the centre. */
function ConfettiOverlay(props: { playing: boolean }) {
  const particles = useRef(buildParticles()).current
  if (!props.playing) return null
  return (
    <View style={confettiStyles.container} pointerEvents="none">
      {particles.map((particle, index) => (
        <ConfettiParticle key={index} particle={particle} index={index} />
      ))}
    </View>
  )
}

const confettiStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    zIndex: 10
  },
  particle: {
    position: "absolute",
    fontWeight: "800"
  }
})

// ── Entrance ────────────────────────────────────────────────

const ENTRANCE_EASING = Easing.out(Easing.cubic)
const HEART_BEAT_PEAK = 1.18
const HEART_BEAT_HALF_MS = 500

function runMatchEntrance(input: {
  cardScale: SharedValue<number>
  cardOpacity: SharedValue<number>
  fromScale: number
  fromOpacity: number
  opacityDurationMs: number
  spring: { duration: number; dampingRatio: number } | null
}): void {
  const never = ReduceMotion.Never
  input.cardOpacity.value = withSequence(
    withTiming(input.fromOpacity, { duration: 0, reduceMotion: never }),
    withTiming(1, { duration: input.opacityDurationMs, easing: ENTRANCE_EASING, reduceMotion: never })
  )
  if (!input.spring) {
    // Reduce Motion: a short crossfade only; no scale.
    input.cardScale.value = 1
    return
  }
  input.cardScale.value = withSequence(
    withTiming(input.fromScale, { duration: 0, reduceMotion: never }),
    withSpring(1, { ...input.spring, reduceMotion: never })
  )
}

/** A bounded heartbeat after the contact; the heart then rests at full size. */
function runHeartBeat(heartPulse: SharedValue<number>, iterations: number): void {
  if (iterations <= 0) return
  const never = ReduceMotion.Never
  const half = { duration: HEART_BEAT_HALF_MS, easing: Easing.inOut(Easing.ease), reduceMotion: never }
  heartPulse.value = withSequence(
    withTiming(1, { duration: 0, reduceMotion: never }),
    withDelay(
      HEART_BEAT_HALF_MS / 2,
      withRepeat(withSequence(withTiming(HEART_BEAT_PEAK, half), withTiming(1, half)), iterations),
      never
    )
  )
}

/** The modal is its own native window, above the root FlightLayer. */
const MATCH_MODAL_FLIGHT_LAYER = "match-modal"

// ── Main modal ──────────────────────────────────────────────

export function MatchResultModal(props: MatchResultModalProps) {
  const {
    visible,
    currentUserName,
    matchedUserName,
    matchedUserId,
    matchedAvatarSnapshot,
    matchedAvatarSelection,
    onClose,
    onKeepDiscovering,
    onSendMessage
  } = props

  const reduceMotion = useReducedMotion()
  const motion = getMatchCelebrationMotion(reduceMotion)
  const cardScale = useSharedValue(motion.entranceFromScale)
  const cardOpacity = useSharedValue(motion.entranceFromOpacity)
  const heartPulse = useSharedValue(1)
  const previousVisibleRef = useRef(false)
  const meeting = useMatchMeeting()
  const [partnerFlightId, setPartnerFlightId] = useState<string | null>(null)
  const [confettiPlaying, setConfettiPlaying] = useState(false)
  const [locale] = useState(getAppLocale)
  const presentation = getMatchResultPresentation({
    entry: "connection_modal",
    matchedUserName,
    canStartConversation: true,
    locale
  })
  const [sendMessageAction, keepDiscoveringAction] = presentation.actions
  const resolvedMatchedAvatarSnapshot = {
    ...createCandidateAvatarSnapshot({
      userId: matchedUserId ?? matchedUserName,
      displayName: matchedUserName,
      avatarSnapshot: matchedAvatarSnapshot,
      avatarSelection: matchedAvatarSelection
    }),
    // VoiceOver reads "<name> <label>": localized with the moment (DSC-1).
    label: presentation.avatarLabel
  }

  const {
    contentStaggerMs,
    entranceFromOpacity,
    entranceFromScale,
    entranceOpacityDurationMs,
    entranceSpringConfig,
    heartPulseIterations
  } = motion

  // Each time the modal opens: the card enters, and the two chibis meet in
  // it. The partner flies from the liked card when Discover just left one
  // (the modal is its own window, so the flight uses the modal's layer),
  // otherwise it slides in. Their contact plays the one success tap and the
  // light confetti; Reduce Motion crossfades and keeps the tap.
  const openMoment = useEffectEvent(() => {
    runMatchEntrance({
      cardScale,
      cardOpacity,
      fromScale: entranceFromScale,
      fromOpacity: entranceFromOpacity,
      opacityDurationMs: entranceOpacityDurationMs,
      spring: entranceSpringConfig
    })
    const source = matchedUserId ? matchFlightSources.take(matchedUserId) : null
    const plan = planMatchMeeting({ reduceMotion, hasFlightSource: isFlightFrameUsable(source) })
    let contactPlayed = false
    meeting.start({
      plan,
      delayMs: contentStaggerMs,
      onContact: () => {
        if (contactPlayed) return
        contactPlayed = true
        // Haptics are not motion, so Reduce Motion keeps this one success tap.
        hapticSuccess()
        setConfettiPlaying(true)
        runHeartBeat(heartPulse, heartPulseIterations)
      }
    })
    if (plan.partnerArrival === "flight" && source && matchedUserId) {
      const flightId = launchMatchChibiFlight({
        partnerUserId: matchedUserId,
        source,
        snapshot: resolvedMatchedAvatarSnapshot,
        layer: MATCH_MODAL_FLIGHT_LAYER,
        onSettled: meeting.partnerArrived
      })
      if (flightId) setPartnerFlightId(flightId)
      else meeting.partnerArrived()
    }
  })
  useEffect(() => {
    const opened = shouldPlayMatchHaptic(previousVisibleRef.current, visible)
    previousVisibleRef.current = visible
    if (!visible) {
      setPartnerFlightId(null)
      setConfettiPlaying(false)
      return
    }
    if (opened) openMoment()
  }, [visible])

  const cardMotionStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }]
  }))
  const heartMotionStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartPulse.value }] }))

  return (
    <Modal visible={visible} transparent animationType={motion.modalAnimationType} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={presentation.closeLabel}
          style={styles.backdrop}
          onPress={onClose}
        />
        <Animated.View style={[styles.modalCard, cardMotionStyle]}>
          <ConfettiOverlay playing={visible && confettiPlaying && motion.confetti} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={presentation.closeLabel}
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons accessible={false} name="close" size={20} color={uiTheme.colors.secondaryText} />
          </Pressable>

          <Text style={styles.headline}>{presentation.headline}</Text>
          <Text style={styles.supportText}>{presentation.body}</Text>

          <View style={styles.confirmedPill}>
            <View style={styles.confirmedDot} />
            <Text style={styles.confirmedText}>{presentation.badgeLabel}</Text>
          </View>

          <View style={styles.connectionRow}>
            <Animated.View style={[styles.avatarColumn, meeting.meStyle]}>
              <MyAvatar
                name={currentUserName}
                seed={currentUserName}
                size={84}
                ring="strong"
              />
              <Text style={styles.avatarName}>{currentUserName}</Text>
            </Animated.View>

            <View style={styles.heartConnector}>
              {/* Drawn outwards from the heart once both chibis are in. */}
              <Animated.View style={[styles.connectorLine, meeting.lineStyle]} />
              <Animated.View style={meeting.heartStyle}>
                <Animated.View style={[styles.heartBadge, heartMotionStyle]}>
                  <Ionicons
                    accessible={false}
                    name="heart"
                    size={20}
                    color={uiTheme.colors.primary}
                  />
                </Animated.View>
              </Animated.View>
            </View>

            <Animated.View style={[styles.avatarColumn, meeting.partnerStyle]}>
              {partnerFlightId ? (
                <FlightTargetView flightId={partnerFlightId}>
                  <CandidateAvatarPreview
                    snapshot={resolvedMatchedAvatarSnapshot}
                    size={96}
                    stage="match"
                  />
                </FlightTargetView>
              ) : (
                <CandidateAvatarPreview
                  snapshot={resolvedMatchedAvatarSnapshot}
                  size={96}
                  stage="match"
                />
              )}
              <Text style={styles.avatarName}>{matchedUserName}</Text>
            </Animated.View>
          </View>

          <View style={styles.actions}>
            <PrimaryButton
              label={sendMessageAction.label}
              onPress={onSendMessage}
            />
            <SecondaryButton
              label={keepDiscoveringAction.label}
              onPress={onKeepDiscovering}
            />
          </View>
        </Animated.View>
        <FlightLayer layer={MATCH_MODAL_FLIGHT_LAYER} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(28, 16, 34, 0.62)",
  },
  modalCard: {
    width: "100%",
    borderRadius: uiTheme.radius.xxl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    paddingHorizontal: uiTheme.spacing.xl,
    paddingTop: uiTheme.spacing.xxl,
    paddingBottom: uiTheme.spacing.xl,
    gap: uiTheme.spacing.md,
    overflow: "visible",
    ...uiTheme.shadow.deep,
  },
  closeButton: {
    position: "absolute",
    right: uiTheme.spacing.md,
    top: uiTheme.spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    zIndex: 20,
  },
  headline: {
    ...uiTheme.font.display,
    color: uiTheme.colors.textPrimary,
    textAlign: "center",
    fontSize: 34,
  },
  supportText: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: uiTheme.spacing.sm,
  },
  confirmedPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.xs,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.successSoft,
    borderWidth: 1,
    borderColor: "rgba(58, 192, 138, 0.28)",
  },
  confirmedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: uiTheme.colors.success,
  },
  confirmedText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.successInk,
    letterSpacing: 0.2,
  },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.sm,
  },
  avatarColumn: {
    alignItems: "center",
    width: 96,
    gap: uiTheme.spacing.xs,
  },
  avatarName: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    fontWeight: "600",
    textAlign: "center",
  },
  heartConnector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    marginHorizontal: uiTheme.spacing.xs,
  },
  connectorLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "#F1D7E6",
  },
  heartBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFE7F3",
    borderWidth: 1.5,
    borderColor: "#F7BCD8",
    alignItems: "center",
    justifyContent: "center",
    ...uiTheme.shadow.glow,
  },
  actions: {
    gap: uiTheme.spacing.sm,
    marginTop: uiTheme.spacing.md,
  },
})
