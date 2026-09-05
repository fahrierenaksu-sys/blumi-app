import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { ServerEvent } from "@blumi/contracts"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useRef, useState } from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { CandidateAvatarPreview } from "../components/DiscoverCard"
import { LinearGradient } from "../ui/linearGradient"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import {
  passConnection,
  removeSavedConnection,
  saveConnection,
  undoPassConnection,
  updateSavedConnectionStatus
} from "../features/connections/savedConnectionsStore"
import {
  useGlobalRealtimeEvents
} from "../features/realtime/globalRealtimeProvider"
import type { SessionActor } from "../features/session/sessionApi"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { Avatar } from "../ui/avatar"
import { SoftBlobBackground } from "../ui/backgrounds"
import { uiTheme } from "../ui/theme"
import { getNativeAppLocale } from "../features/session/authLocale"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getRoomDebriefCopy } from "../features/miniRoom/roomDebriefCopy"
import {
  discardQueuedConnectionDecision,
  flushAuthenticatedConnectionDecisionOutbox,
  queueConnectionDecisionForDelivery
} from "../features/connections/connectionDecisionRuntime"
import type { ConnectionDecisionDeliveryDependencies } from "../features/connections/connectionDecisionDelivery"

type RoomDebriefScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "RoomDebrief"
> & {
  sessionActor: SessionActor
  onDecisionDelivered: NonNullable<ConnectionDecisionDeliveryDependencies["onDelivered"]>
}

type DecisionState = "idle" | "saving" | "passing" | "saved" | "passed"

const SERVER_DECISION_WINDOW_MS = 1600

export function RoomDebriefScreen(props: RoomDebriefScreenProps) {
  const { navigation, onDecisionDelivered, route, sessionActor } = props
  const { miniRoomId, partner, durationSeconds, connected } = route.params
  const copy = getRoomDebriefCopy(
    resolveAccountRecoveryLocale(
      getNativeAppLocale(),
      Intl.DateTimeFormat().resolvedOptions().locale
    )
  )
  const [decision, setDecision] = useState<DecisionState>("idle")
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const heroAnim = useRef(new Animated.Value(0)).current
  const saveScaleAnim = useRef(new Animated.Value(1)).current
  const passScaleAnim = useRef(new Animated.Value(1)).current

  // Entrance animation
  useEffect(() => {
    Animated.spring(heroAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springGentle,
    }).start()
  }, [heroAnim])

  const clearFallbackTimer = useCallback((): void => {
    if (!fallbackTimerRef.current) return
    clearTimeout(fallbackTimerRef.current)
    fallbackTimerRef.current = null
  }, [])

  const goLobby = useCallback((): void => {
    clearFallbackTimer()
    navigation.navigate("Lobby")
  }, [clearFallbackTimer, navigation])

  const scheduleLobbyReturn = useCallback((): void => {
    clearFallbackTimer()
    fallbackTimerRef.current = setTimeout(() => {
      goLobby()
    }, SERVER_DECISION_WINDOW_MS)
  }, [clearFallbackTimer, goLobby])

  const handleServerEvent = useCallback(
    (event: ServerEvent): void => {
      if (
        event.type === "connection.decision_recorded" &&
        event.payload.miniRoomId === miniRoomId &&
        event.payload.actorUserId === sessionActor.profile.userId &&
        event.payload.partnerUserId === partner.userId
      ) {
        void updateSavedConnectionStatus({
          ownerUserId: sessionActor.profile.userId,
          userId: partner.userId,
          status: event.payload.status === "saved" ? "pending" : "unmatched"
        })
        return
      }

      if (
        event.type === "connection.matched" &&
        event.payload.miniRoomId === miniRoomId &&
        event.payload.participantUserIds.includes(sessionActor.profile.userId) &&
        event.payload.participantUserIds.includes(partner.userId)
      ) {
        clearFallbackTimer()
        void updateSavedConnectionStatus({
          ownerUserId: sessionActor.profile.userId,
          userId: partner.userId,
          status: "mutual"
        })
      }
    },
    [clearFallbackTimer, miniRoomId, partner.userId, sessionActor.profile.userId]
  )

  useGlobalRealtimeEvents(handleServerEvent)

  const onSave = async (): Promise<void> => {
    if (decision !== "idle") return
    setDecisionError(null)
    setDecision("saving")
    let queued = false
    let localApplied = false
    try {
      await queueConnectionDecisionForDelivery({
        actorUserId: sessionActor.profile.userId,
        miniRoomId,
        partnerUserId: partner.userId,
        status: "saved"
      })
      queued = true
      await saveConnection({
        ownerUserId: sessionActor.profile.userId,
        userId: partner.userId,
        displayName: partner.displayName,
        connected,
        durationSeconds,
        status: "pending"
      })
      localApplied = true
      const delivery = await flushAuthenticatedConnectionDecisionOutbox({
        actorUserId: sessionActor.profile.userId,
        sessionToken: sessionActor.session.sessionToken,
        onDelivered: onDecisionDelivered
      })
      if (delivery.rejectedMiniRoomIds.includes(miniRoomId)) {
        await removeSavedConnection({
          ownerUserId: sessionActor.profile.userId,
          userId: partner.userId
        }).catch((error: unknown) => {
          console.warn("Rejected connection decision could not be removed from the local shelf.", error)
        })
        setDecision("idle")
        setDecisionError(copy.decisionUnavailable)
        return
      }
      setDecision("saved")
      scheduleLobbyReturn()
    } catch (error) {
      if (queued && !localApplied) {
        await discardQueuedConnectionDecision({
          actorUserId: sessionActor.profile.userId,
          miniRoomId
        }).catch((discardError: unknown) => {
          console.warn("Failed connection decision queue cleanup.", discardError)
        })
      }
      if (localApplied) {
        console.warn("Connection decision is queued, but the local shelf could not refresh.", error)
        setDecision("saved")
        scheduleLobbyReturn()
        return
      }
      setDecision("idle")
      setDecisionError(copy.decisionError)
    }
  }

  const onPass = async (): Promise<void> => {
    if (decision !== "idle") return
    setDecisionError(null)
    setDecision("passing")
    let queued = false
    let localApplied = false
    try {
      await queueConnectionDecisionForDelivery({
        actorUserId: sessionActor.profile.userId,
        miniRoomId,
        partnerUserId: partner.userId,
        status: "passed"
      })
      queued = true
      await passConnection({
        ownerUserId: sessionActor.profile.userId,
        userId: partner.userId
      })
      localApplied = true
      const delivery = await flushAuthenticatedConnectionDecisionOutbox({
        actorUserId: sessionActor.profile.userId,
        sessionToken: sessionActor.session.sessionToken,
        onDelivered: onDecisionDelivered
      })
      if (delivery.rejectedMiniRoomIds.includes(miniRoomId)) {
        await undoPassConnection({
          ownerUserId: sessionActor.profile.userId,
          userId: partner.userId
        }).catch((error: unknown) => {
          console.warn("Rejected connection decision could not be removed from local skips.", error)
        })
        setDecision("idle")
        setDecisionError(copy.decisionUnavailable)
        return
      }
      setDecision("passed")
      scheduleLobbyReturn()
    } catch (error) {
      if (queued && !localApplied) {
        await discardQueuedConnectionDecision({
          actorUserId: sessionActor.profile.userId,
          miniRoomId
        }).catch((discardError: unknown) => {
          console.warn("Failed connection decision queue cleanup.", discardError)
        })
      }
      if (localApplied) {
        console.warn("Connection decision is queued, but local skips could not refresh.", error)
        setDecision("passed")
        scheduleLobbyReturn()
        return
      }
      setDecision("idle")
      setDecisionError(copy.decisionError)
    }
  }

  const meta = connected
    ? copy.duration(durationSeconds)
    : copy.notConnectedMeta
  const momentLine = copy.momentLine(connected, durationSeconds)
  const title = copy.title(partner.displayName, connected)

  const buttonsLocked = decision !== "idle"

  const handleSavePressIn = () => {
    Animated.spring(saveScaleAnim, {
      toValue: uiTheme.animation.scalePress,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handleSavePressOut = () => {
    Animated.spring(saveScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springBouncy,
    }).start()
  }

  const handlePassPressIn = () => {
    Animated.spring(passScaleAnim, {
      toValue: uiTheme.animation.scalePress,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handlePassPressOut = () => {
    Animated.spring(passScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springBouncy,
    }).start()
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        </View>

        <Animated.View
          style={[
            styles.hero,
            {
              opacity: heroAnim,
              transform: [
                {
                  translateY: heroAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  })
                },
                {
                  scale: heroAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  })
                }
              ],
            }
          ]}
        >
          <View style={styles.avatarGlow}>
            {partner.avatarSnapshot ? (
              <CandidateAvatarPreview
                snapshot={partner.avatarSnapshot}
                size={180}
                stage="match"
              />
            ) : (
              <Avatar
                name={partner.displayName}
                seed={partner.userId}
                size={180}
                ring="strong"
              />
            )}
          </View>
          <View style={styles.metaPill}>
            <View style={[styles.metaDot, connected ? null : styles.metaDotSoft]} />
            <Text style={styles.metaPillText}>{meta}</Text>
          </View>
        </Animated.View>

        <View style={styles.copyBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subhead}>
            {copy.subhead}
          </Text>
        </View>

        <View style={styles.momentCard}>
          <LinearGradient
            colors={["#FFFFFF", "#FFF8FB", "#FFF2F8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.momentIconCircle}>
            <Ionicons
              accessible={false}
              name="sparkles"
              size={20}
              color={uiTheme.colors.primary}
            />
          </View>
          <View style={styles.momentCopy}>
            <Text style={styles.momentLabel}>{copy.keptMemory}</Text>
            <Text style={styles.momentText}>{momentLine}</Text>
          </View>
        </View>

        <View style={styles.choices}>
          <Animated.View style={[styles.choiceFlex, { transform: [{ scale: passScaleAnim }] }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.passAccessibilityLabel}
              accessibilityState={{ disabled: buttonsLocked }}
              disabled={buttonsLocked}
              onPress={() => {
                void onPass()
              }}
              onPressIn={handlePassPressIn}
              onPressOut={handlePassPressOut}
              style={[
                styles.choiceButton,
                styles.passButton,
                buttonsLocked ? styles.choiceButtonLocked : null
              ]}
            >
              <Ionicons
                accessible={false}
                name="hand-left-outline"
                size={38}
                color={uiTheme.colors.textPrimary}
              />
              <Text style={styles.passLabel}>{copy.passLabel}</Text>
              <Text style={styles.choiceHint}>{copy.passHint}</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={[styles.choiceFlex, { transform: [{ scale: saveScaleAnim }] }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.keepAccessibilityLabel}
              accessibilityState={{ disabled: buttonsLocked }}
              disabled={buttonsLocked}
              onPress={() => {
                void onSave()
              }}
              onPressIn={handleSavePressIn}
              onPressOut={handleSavePressOut}
              style={[
                styles.choiceButton,
                buttonsLocked ? styles.choiceButtonLocked : null
              ]}
            >
              <LinearGradient
                colors={uiTheme.gradients.primary as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: uiTheme.radius.xl }]}
              />
              <Ionicons
                accessible={false}
                name="heart"
                size={38}
                color="#FFFFFF"
              />
              <Text style={styles.saveLabel}>{copy.keepLabel}</Text>
              <Text style={[styles.choiceHint, styles.saveHint]}>
                {copy.keepHint}
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.decideLaterAccessibilityLabel}
          accessibilityState={{ disabled: buttonsLocked }}
          onPress={goLobby}
          hitSlop={10}
          style={styles.laterButton}
          disabled={buttonsLocked}
        >
          <Text style={styles.laterText}>{copy.decideLater}</Text>
        </Pressable>
        {decisionError ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.decisionError}>
            {decisionError}
          </Text>
        ) : null}
        {decision === "saving" || decision === "passing" ? (
          <Text accessibilityLiveRegion="polite" style={styles.decisionPending}>
            {copy.decisionPending}
          </Text>
        ) : null}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background,
  },
  safe: {
    flex: 1,
    paddingTop: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.lg,
  },
  eyebrowRow: {
    alignItems: "center",
    paddingVertical: uiTheme.spacing.sm,
  },
  eyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
  },
  hero: {
    alignItems: "center",
    gap: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.lg,
  },
  avatarGlow: {
    ...uiTheme.shadow.glow,
    borderRadius: 90,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.xs,
    backgroundColor: uiTheme.colors.glass,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
  },
  metaDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: uiTheme.colors.success,
  },
  metaDotSoft: {
    backgroundColor: uiTheme.colors.warning,
  },
  metaPillText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary,
    letterSpacing: 0.4,
  },
  copyBlock: {
    gap: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.xs,
    paddingTop: uiTheme.spacing.sm,
    alignItems: "center",
  },
  title: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center",
  },
  subhead: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    lineHeight: 21,
    textAlign: "center",
    paddingHorizontal: uiTheme.spacing.md,
  },
  momentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.md,
    marginTop: uiTheme.spacing.lg,
    padding: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.xl,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    overflow: "hidden",
    position: "relative",
    ...uiTheme.shadow.float,
  },
  momentIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: uiTheme.colors.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  momentCopy: {
    flex: 1,
    gap: 3,
  },
  momentLabel: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
  },
  momentText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    lineHeight: 20,
    fontWeight: "600",
  },
  choices: {
    flex: 1,
    flexDirection: "row",
    gap: uiTheme.spacing.md,
    marginTop: uiTheme.spacing.xl,
    marginBottom: uiTheme.spacing.md,
  },
  choiceFlex: {
    flex: 1,
  },
  choiceButton: {
    flex: 1,
    borderRadius: uiTheme.radius.xl,
    paddingVertical: uiTheme.spacing.xl,
    paddingHorizontal: uiTheme.spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
    borderWidth: 1,
    overflow: "hidden",
  },
  choiceButtonLocked: {
    opacity: 0.6,
  },
  passButton: {
    backgroundColor: uiTheme.colors.glass,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft,
  },
  passLabel: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
  },
  saveLabel: {
    ...uiTheme.font.subheading,
    color: "#FFFFFF",
    textAlign: "center",
  },
  choiceHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    letterSpacing: 0.3,
  },
  saveHint: {
    color: "rgba(255, 255, 255, 0.85)",
  },
  laterButton: {
    alignSelf: "center",
    paddingVertical: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
  },
  laterText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textMuted,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  decisionError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.danger,
    marginTop: uiTheme.spacing.sm,
    textAlign: "center"
  },
  decisionPending: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    marginTop: uiTheme.spacing.sm,
    textAlign: "center"
  },
})
