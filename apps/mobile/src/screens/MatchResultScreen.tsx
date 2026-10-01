import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import Reanimated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { AvatarPreview2D } from "../features/avatarV2/components/AvatarPreview2D"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import {
  canOpenMatchExperience
} from "../features/matches/matchRoomModel"
import {
  getMatchCelebrationMotion,
  getMatchResultPresentation,
  getMatchResultRouteTimeline,
  shouldCelebrateMatchResult,
  shouldPlayMatchHaptic
} from "../features/matches/matchResultPresentation"
import {
  createStableMatchedUserAvatar,
  resolveLatestMatchRoomAvatar
} from "../features/matches/matchRoomResolvers"
import { getAppLocale } from "../features/session/appLocale"
import type { SessionActor } from "../features/session/sessionModel"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { createPostMatchChatNavigationState, getLobbyReturnStrategy } from "../navigation/rootNavigationModel"
import { SoftBlobBackground } from "../ui/backgrounds"
import {
  FloatingGlassDock,
  GlassCard,
  GlassCTA,
  GlassHeader,
  GlassPill
} from "../ui/glass"
import { uiTheme } from "../ui/theme"
import { ActionButtonCircle } from "../ui/primitives"
import { useEntranceAnimation, useReducedMotion, usePulse } from "../ui/animations"
import { hapticSuccess } from "../ui/haptics"
import { AvatarFrame, type AvatarFrameVariant } from "../ui/AvatarFrame"
import { ReportModal } from "../components/ReportModal"
import { useLiveMatchParticipant } from "../features/matches/useLiveMatchParticipant"

type MatchResultScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "MatchResult"
> & {
  sessionActor: SessionActor
}

export function MatchResultScreen(props: MatchResultScreenProps) {
  const { navigation, route, sessionActor } = props
  const { avatar } = useAvatarV2()
  const matchedUser = useLiveMatchParticipant(route.params.match.matchedUser) ?? route.params.match.matchedUser
  const match = { ...route.params.match, matchedUser }
  const currentAvatar = useMemo(
    () => resolveLatestMatchRoomAvatar(avatar),
    [avatar]
  )
  const matchedAvatar = useMemo(
    () => createStableMatchedUserAvatar(match.matchedUser),
    [match.matchedUser]
  )
  const canStartConversation = canOpenMatchExperience(sessionActor)
  const [locale] = useState(getAppLocale)
  const presentation = getMatchResultPresentation({
    entry: "discovery_route",
    matchedUserName: match.matchedUser.displayName,
    canStartConversation,
    locale
  })
  const [sendMessageAction, keepDiscoveringAction] = presentation.actions
  const [reportVisible, setReportVisible] = useState(false)
  const openingChatRef = useRef(false)

  const reduceMotion = useReducedMotion()
  const celebrationMotion = getMatchCelebrationMotion(reduceMotion)
  const timeline = getMatchResultRouteTimeline(reduceMotion)
  const headerAnim = useEntranceAnimation({ delay: 0, translateY: 20 })
  // DSC-2: the card settles from 0.92 with a fade on the UI thread (it used
  // to grow from scale 0); Reduce Motion crossfades without scale.
  const heroOpacity = useSharedValue(timeline.heroFromOpacity)
  const heroScale = useSharedValue(timeline.heroFromScale)
  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ scale: heroScale.value }]
  }))
  // usePulse itself stays still under Reduce Motion; otherwise the halo beats a bounded number of times.
  const haloAnim = usePulse({
    minScale: 0.9,
    maxScale: 1.15,
    duration: 2000,
    iterations: celebrationMotion.haloPulseIterations
  })
  const dockAnim = useEntranceAnimation({ delay: timeline.dockDelayMs, translateY: 40 })
  const matchHapticPlayedRef = useRef(false)
  const shouldCelebrate = shouldCelebrateMatchResult(route.params)
  const entranceSpring = celebrationMotion.entranceSpringConfig

  useEffect(() => {
    heroOpacity.value = withDelay(timeline.heroDelayMs, withTiming(1, {
      duration: timeline.heroOpacityDurationMs,
      reduceMotion: ReduceMotion.Never
    }))
    heroScale.value = entranceSpring
      ? withDelay(timeline.heroDelayMs, withSpring(1, {
        damping: entranceSpring.damping,
        stiffness: entranceSpring.stiffness,
        mass: entranceSpring.mass,
        reduceMotion: ReduceMotion.Never
      }))
      : 1
  }, [entranceSpring, heroOpacity, heroScale, timeline.heroDelayMs, timeline.heroOpacityDurationMs])

  useEffect(() => {
    // One success tap per fresh match (haptic map: match → success), as the
    // card appears; Reduce Motion keeps it.
    if (!shouldPlayMatchHaptic(matchHapticPlayedRef.current, shouldCelebrate)) return
    const timer = setTimeout(() => {
      if (matchHapticPlayedRef.current) return
      matchHapticPlayedRef.current = true
      hapticSuccess()
    }, timeline.hapticDelayMs)
    return () => clearTimeout(timer)
  }, [shouldCelebrate, timeline.hapticDelayMs])

  const handleStartChat = (): void => {
    if (!sendMessageAction.enabled || openingChatRef.current) return
    openingChatRef.current = true
    navigation.reset(createPostMatchChatNavigationState({
      partnerId: match.matchedUser.userId,
      partnerName: match.matchedUser.displayName
    }))
  }

  const handleKeepExploring = (): void => {
    const strategy = getLobbyReturnStrategy(navigation.getState().routes.map((item) => item.name))
    if (strategy === "popTo") {
      navigation.popTo("Lobby")
    } else {
      navigation.replace("Lobby")
    }
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <Animated.View style={headerAnim}>
          <GlassHeader
            title={presentation.headline}
            eyebrow={presentation.eyebrow}
            leftSlot={
              <ActionButtonCircle
                accessibilityLabel={presentation.backLabel}
                variant="soft"
                size={42}
                onPress={handleKeepExploring}
              >
                <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
              </ActionButtonCircle>
            }
            rightSlot={
              <ActionButtonCircle
                accessibilityLabel={presentation.safetyLabel}
                variant="soft"
                size={42}
                onPress={() => setReportVisible(true)}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={uiTheme.colors.textPrimary} />
              </ActionButtonCircle>
            }
          />
        </Animated.View>

        <ReportModal
          visible={reportVisible}
          targetUserId={match.matchedUser.userId}
          targetDisplayName={match.matchedUser.displayName}
          sessionActor={sessionActor}
          onClose={() => setReportVisible(false)}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Reanimated.View style={heroStyle}>
            <GlassCard tone="accent" style={styles.heroCard}>
              <Animated.View style={[styles.matchHaloContainer, haloAnim]} pointerEvents="none">
                <Ionicons name="heart" size={260} color="rgba(255, 79, 152, 0.16)" />
              </Animated.View>
              <Text style={styles.heroTitle}>{presentation.title}</Text>
              <Text style={styles.heroBody}>{presentation.body}</Text>
              <View style={styles.avatarRow}>
                <AvatarSpotlight
                  label={sessionActor.profile.displayName}
                  avatar={currentAvatar}
                  frameVariant="rose-quartz"
                  rotation="-3deg"
                />
                <GlassPill tone="dark" style={styles.connectionPill}>
                  <Ionicons
                    accessible={false}
                    name="heart"
                    size={20}
                    color={uiTheme.colors.textInverted}
                  />
                </GlassPill>
                <AvatarSpotlight
                  label={match.matchedUser.displayName}
                  avatar={matchedAvatar}
                  frameVariant="champagne-gold"
                  rotation="4deg"
                />
              </View>
            </GlassCard>
          </Reanimated.View>

          <GlassCard style={styles.nextCard}>
            <Text style={styles.nextTitle}>{presentation.nextStepTitle}</Text>
            <Text style={styles.nextBody}>{presentation.nextStepBody}</Text>
          </GlassCard>
        </ScrollView>

        <Animated.View style={dockAnim}>
          <FloatingGlassDock style={styles.actionDock}>
            <GlassCTA
              label={sendMessageAction.label}
              onPress={() => {
                handleStartChat()
              }}
              disabled={!sendMessageAction.enabled}
            />
            <View style={styles.secondaryActions}>
              <GlassCTA
                label={keepDiscoveringAction.label}
                variant="secondary"
                onPress={handleKeepExploring}
                style={styles.secondaryAction}
              />
            </View>
          </FloatingGlassDock>
        </Animated.View>
      </SafeAreaView>
    </View>
  )
}

function AvatarSpotlight(props: {
  label: string
  avatar: Parameters<typeof AvatarPreview2D>[0]["avatar"]
  frameVariant?: AvatarFrameVariant
  rotation?: string
}) {
  return (
    <View style={[styles.avatarSpotlight, { transform: [{ rotate: props.rotation || "0deg" }] }]}>
      <AvatarFrame variant={props.frameVariant || "rose-quartz"}>
        <AvatarPreview2D
          avatar={props.avatar}
          size={112}
          stageHeight={168}
          metaTone="light"
          label={props.label}
        />
      </AvatarFrame>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  safe: {
    flex: 1,
    paddingBottom: uiTheme.spacing.md
  },

  content: {
    flexGrow: 1,
    gap: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.md,
    paddingBottom: 150
  },
  heroCard: {
    minHeight: 430,
    justifyContent: "center",
    gap: uiTheme.spacing.lg
  },
  matchHaloContainer: {
    position: "absolute",
    top: 76,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center"
  },
  heroTitle: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  heroBody: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
    maxWidth: 290,
    alignSelf: "center"
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.sm
  },
  avatarSpotlight: {
    flex: 1,
    minWidth: 0
  },
  connectionPill: {
    width: 48,
    height: 48,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  nextCard: {
    gap: uiTheme.spacing.sm
  },
  nextTitle: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  nextBody: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary
  },
  actionDock: {
    position: "absolute",
    left: uiTheme.spacing.lg,
    right: uiTheme.spacing.lg,
    bottom: uiTheme.spacing.md,
    gap: uiTheme.spacing.sm
  },
  secondaryActions: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm
  },
  secondaryAction: {
    flex: 1
  }
})
