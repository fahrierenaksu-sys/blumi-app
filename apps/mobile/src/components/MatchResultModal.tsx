import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useRef, type ComponentProps } from "react"
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View
} from "react-native"
import { MyAvatar } from "../ui/myAvatar"
import {
  CandidateAvatarPreview,
  createCandidateAvatarSnapshot,
  type CandidateAvatarSnapshot
} from "./DiscoverCard"
import { PrimaryButton, SecondaryButton } from "../ui/primitives"
import { useReducedMotion } from "../ui/animations"
import { uiTheme } from "../ui/theme"

interface MatchResultModalProps {
  visible: boolean
  currentUserName: string
  matchedUserName: string
  matchedUserId?: string
  matchedAvatarSnapshot?: CandidateAvatarSnapshot
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

function ConfettiOverlay(props: { playing: boolean }) {
  const particles = useRef(buildParticles()).current
  const anims = useRef(particles.map(() => new Animated.Value(0))).current
  const confettiAnimationRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    confettiAnimationRef.current?.stop()
    confettiAnimationRef.current = null
    if (!props.playing) {
      anims.forEach((a) => a.setValue(0))
      return undefined
    }

    const animations = anims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 900 + i * 60,
        delay: i * 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    )

    const animation = Animated.stagger(35, animations)
    confettiAnimationRef.current = animation
    animation.start()
    return () => {
      animation.stop()
      if (confettiAnimationRef.current === animation) {
        confettiAnimationRef.current = null
      }
    }
  }, [anims, props.playing])

  if (!props.playing) return null

  return (
    <View style={confettiStyles.container} pointerEvents="none">
      {particles.map((p, i) => (
        <AnimatedIonicons
          accessible={false}
          key={i}
          name={p.icon}
          color={p.color}
          size={p.size}
          style={[
            confettiStyles.particle,
            {
              opacity: anims[i].interpolate({
                inputRange: [0, 0.3, 1],
                outputRange: [0, 1, 0]
              }),
              transform: [
                {
                  translateX: anims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, p.startX]
                  })
                },
                {
                  translateY: anims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, p.endY]
                  })
                },
                {
                  rotate: anims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", p.rotation]
                  })
                },
                {
                  scale: anims[i].interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0, 1.2, 0.6]
                  })
                }
              ]
            }
          ]}
        />
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

// ── Main modal ──────────────────────────────────────────────

export function MatchResultModal(props: MatchResultModalProps) {
  const {
    visible,
    currentUserName,
    matchedUserName,
    matchedUserId,
    matchedAvatarSnapshot,
    onClose,
    onKeepDiscovering,
    onSendMessage
  } = props

  const scaleAnim = useRef(new Animated.Value(0)).current
  const heartPulse = useRef(new Animated.Value(1)).current
  const entranceAnimationRef = useRef<Animated.CompositeAnimation | null>(null)
  const reduceMotion = useReducedMotion()
  const resolvedMatchedAvatarSnapshot = createCandidateAvatarSnapshot({
    userId: matchedUserId ?? matchedUserName,
    displayName: matchedUserName,
    avatarSnapshot: matchedAvatarSnapshot
  })

  const stopEntrance = useCallback(() => {
    entranceAnimationRef.current?.stop()
    entranceAnimationRef.current = null
    scaleAnim.stopAnimation()
    heartPulse.stopAnimation()
    Vibration.cancel()
  }, [heartPulse, scaleAnim])

  const runEntrance = useCallback(() => {
    stopEntrance()
    scaleAnim.setValue(0)
    heartPulse.setValue(1)

    if (reduceMotion) {
      scaleAnim.setValue(1)
      return
    }

    const animation = Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(heartPulse, {
            toValue: 1.18,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(heartPulse, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      )
    ])
    entranceAnimationRef.current = animation
    animation.start()

    // Haptic burst
    if (Platform.OS !== "web") {
      Vibration.vibrate([0, 40, 60, 40, 60, 80])
    }
  }, [heartPulse, reduceMotion, scaleAnim, stopEntrance])

  useEffect(() => {
    if (visible) {
      runEntrance()
      return stopEntrance
    }
    stopEntrance()
    return undefined
  }, [runEntrance, stopEntrance, visible])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close match result"
          style={styles.backdrop}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.modalCard,
            {
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <ConfettiOverlay playing={visible && !reduceMotion} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close match result"
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons accessible={false} name="close" size={20} color={uiTheme.colors.secondaryText} />
          </Pressable>

          <Text style={styles.headline}>It&apos;s a vibe.</Text>
          <Text style={styles.supportText}>
            You and {matchedUserName} both felt it. Start with a message when you are ready.
          </Text>

          <View style={styles.confirmedPill}>
            <View style={styles.confirmedDot} />
            <Text style={styles.confirmedText}>Mutual match</Text>
          </View>

          <View style={styles.connectionRow}>
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
              <Animated.View
                style={[
                  styles.heartBadge,
                  { transform: [{ scale: heartPulse }] }
                ]}
              >
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
              <Text style={styles.avatarSourceText}>
                {resolvedMatchedAvatarSnapshot.label}
              </Text>
              <Text style={styles.avatarName}>{matchedUserName}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <PrimaryButton
              label="Start chatting"
              onPress={onSendMessage}
            />
            <SecondaryButton
              label="Keep exploring"
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
  avatarSourceText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textMuted,
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
