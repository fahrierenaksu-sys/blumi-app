import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { useEffect, useRef, useState, type ComponentProps } from "react"
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
import {
  getMatchCelebrationMotion,
  getMatchResultPresentation,
  shouldPlayMatchHaptic
} from "../features/matches/matchResultPresentation"
import { getAppLocale } from "../features/session/appLocale"
import { uiTheme } from "../ui/theme"
import { PressableScale } from "../ui/PressableScale"

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
const PARTICLE_COUNT = 12
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
  avatarsReveal: SharedValue<number>
  heartPulse: SharedValue<number>
  fromScale: number
  fromOpacity: number
  opacityDurationMs: number
  spring: { duration: number; dampingRatio: number } | null
  contentStaggerMs: number
  heartPulseIterations: number
}): void {
  const never = ReduceMotion.Never
  input.cardOpacity.value = withSequence(
    withTiming(input.fromOpacity, { duration: 0, reduceMotion: never }),
    withTiming(1, { duration: input.opacityDurationMs, easing: ENTRANCE_EASING, reduceMotion: never })
  )
  if (!input.spring) {
    // Reduce Motion: a short crossfade only; no scale, stagger, or pulse.
    input.cardScale.value = 1
    input.avatarsReveal.value = 1
    input.heartPulse.value = 1
    return
  }
  input.cardScale.value = withSequence(
    withTiming(input.fromScale, { duration: 0, reduceMotion: never }),
    withSpring(1, { ...input.spring, reduceMotion: never })
  )
  input.avatarsReveal.value = withSequence(
    withTiming(0, { duration: 0, reduceMotion: never }),
    withDelay(
      input.contentStaggerMs,
      withTiming(1, { duration: input.opacityDurationMs, easing: ENTRANCE_EASING, reduceMotion: never }),
      never
    )
  )
  // A bounded heartbeat after the card settles; the heart then rests at full size.
  const half = { duration: HEART_BEAT_HALF_MS, easing: Easing.inOut(Easing.ease), reduceMotion: never }
  input.heartPulse.value = withSequence(
    withTiming(1, { duration: 0, reduceMotion: never }),
    withDelay(
      input.opacityDurationMs,
      withRepeat(withSequence(withTiming(HEART_BEAT_PEAK, half), withTiming(1, half)), input.heartPulseIterations),
      never
    )
  )
}

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
  const avatarsReveal = useSharedValue(0)
  const heartPulse = useSharedValue(1)
  const previousVisibleRef = useRef(false)
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

  useEffect(() => {
    if (!visible) return
    // Every value is reset and restarted on the UI thread; assigning a new
    // animation interrupts any entrance still running.
    runMatchEntrance({
      cardScale,
      cardOpacity,
      avatarsReveal,
      heartPulse,
      fromScale: entranceFromScale,
      fromOpacity: entranceFromOpacity,
      opacityDurationMs: entranceOpacityDurationMs,
      spring: entranceSpringConfig,
      contentStaggerMs,
      heartPulseIterations
    })
  }, [
    avatarsReveal,
    cardOpacity,
    cardScale,
    contentStaggerMs,
    entranceFromOpacity,
    entranceFromScale,
    entranceOpacityDurationMs,
    entranceSpringConfig,
    heartPulse,
    heartPulseIterations,
    visible
  ])

  const cardMotionStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }]
  }))
  const avatarsMotionStyle = useAnimatedStyle(() => ({ opacity: avatarsReveal.value }))
  const heartMotionStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartPulse.value }] }))

  useEffect(() => {
    // Haptics are not motion, so Reduce Motion keeps this one success tap.
    if (shouldPlayMatchHaptic(previousVisibleRef.current, visible)) hapticSuccess()
    previousVisibleRef.current = visible
  }, [visible])

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
          <ConfettiOverlay playing={visible && motion.confetti} />

          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={presentation.closeLabel}
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons accessible={false} name="close" size={20} color={uiTheme.colors.secondaryText} />
          </PressableScale>

          <Text style={styles.headline}>{presentation.headline}</Text>
          <Text style={styles.supportText}>{presentation.body}</Text>

          <View style={styles.confirmedPill}>
            <View style={styles.confirmedDot} />
            <Text style={styles.confirmedText}>{presentation.badgeLabel}</Text>
          </View>

          <Animated.View style={[styles.connectionRow, avatarsMotionStyle]}>
            <View style={styles.avatarColumn}>
              <MyAvatar
                name={currentUserName}
                seed={currentUserName}
                size={84}
                ring="strong"
              />
              <Text style={styles.avatarName}>{currentUserName}</Text>
            </View>

            <View style={styles.heartConnector}>
              <View style={styles.connectorLine} />
              <Animated.View style={[styles.heartBadge, heartMotionStyle]}>
                <Ionicons
                  accessible={false}
                  name="heart"
                  size={20}
                  color={uiTheme.colors.primary}
                />
              </Animated.View>
              <View style={styles.connectorLine} />
            </View>

            <View style={styles.avatarColumn}>
              <CandidateAvatarPreview
                snapshot={resolvedMatchedAvatarSnapshot}
                size={96}
                stage="match"
              />
              <Text style={styles.avatarName}>{matchedUserName}</Text>
            </View>
          </Animated.View>

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
    flex: 1,
    marginHorizontal: uiTheme.spacing.xs,
  },
  connectorLine: {
    flex: 1,
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
