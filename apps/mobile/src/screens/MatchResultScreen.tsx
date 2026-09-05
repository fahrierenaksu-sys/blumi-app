import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useMemo, useRef, useState } from "react"
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { AvatarPreview2D } from "../features/avatarV2/components/AvatarPreview2D"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import {
  canOpenMatchExperience
} from "../features/matches/matchRoomModel"
import {
  createStableMatchedUserAvatar,
  resolveLatestMatchRoomAvatar
} from "../features/matches/matchRoomResolvers"
import type { SessionActor } from "../features/session/sessionModel"
import { createThread } from "../features/chat/chatApi"
import { applyChatThreadCreated } from "../features/chat/chatStore"
import { openMatchedChat } from "../features/chat/matchChatOpening"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import type { RootStackParamList } from "../navigation/RootNavigator"
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
import { useEntranceAnimation, useScaleBounce, usePulse } from "../ui/animations"
import { AvatarFrame, type AvatarFrameVariant } from "../ui/AvatarFrame"
import { ReportModal } from "../components/ReportModal"

type MatchResultScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "MatchResult"
> & {
  sessionActor: SessionActor
}

export function MatchResultScreen(props: MatchResultScreenProps) {
  const { navigation, route, sessionActor } = props
  const { avatar } = useAvatarV2()
  const match = route.params.match
  const currentAvatar = useMemo(
    () => resolveLatestMatchRoomAvatar(avatar),
    [avatar]
  )
  const matchedAvatar = useMemo(
    () => createStableMatchedUserAvatar(match.matchedUser),
    [match.matchedUser]
  )
  const canStartConversation = canOpenMatchExperience(sessionActor)
  const [isOpeningChat, setIsOpeningChat] = useState(false)
  const [chatOpenError, setChatOpenError] = useState<string | null>(null)
  const [reportVisible, setReportVisible] = useState(false)
  const openingChatRef = useRef(false)

  const headerAnim = useEntranceAnimation({ delay: 0, translateY: 20 })
  const heroAnim = useScaleBounce({ delay: 200, tension: 60, friction: 7 })
  const haloAnim = usePulse({ minScale: 0.9, maxScale: 1.15, duration: 2000 })
  const dockAnim = useEntranceAnimation({ delay: 600, translateY: 40 })

  const handleStartChat = async (): Promise<void> => {
    if (!canStartConversation || openingChatRef.current) return
    if (sessionActor.session.mode !== "production") {
      navigation.navigate("ChatThread", {
        partnerId: match.matchedUser.userId,
        partnerName: match.matchedUser.displayName
      })
      return
    }

    openingChatRef.current = true
    setIsOpeningChat(true)
    setChatOpenError(null)
    const result = await openMatchedChat({
      createThread: () => createThread(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        {
          participantUserIds: [
            sessionActor.profile.userId,
            match.matchedUser.userId
          ]
        }
      ),
      onThreadReady: (thread) => {
        applyChatThreadCreated(thread)
        navigation.navigate("ChatThread", { threadId: thread.threadId })
      }
    })
    openingChatRef.current = false
    setIsOpeningChat(false)
    if (result.status === "failed") {
      setChatOpenError(result.errorMessage)
    }
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <Animated.View style={headerAnim}>
          <GlassHeader
            title="It’s a vibe."
            eyebrow="New match"
            leftSlot={
              <ActionButtonCircle
                accessibilityLabel="Return to Discover"
                variant="soft"
                size={42}
                onPress={() => navigation.navigate("Lobby")}
              >
                <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
              </ActionButtonCircle>
            }
            rightSlot={
              <ActionButtonCircle
                accessibilityLabel={`Safety options for ${match.matchedUser.displayName}`}
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
          <Animated.View style={heroAnim}>
            <GlassCard tone="accent" style={styles.heroCard}>
              <Animated.View style={[styles.matchHaloContainer, haloAnim]} pointerEvents="none">
                <Ionicons name="heart" size={260} color="rgba(255, 79, 152, 0.16)" />
              </Animated.View>
              <Text style={styles.heroTitle}>You two just matched.</Text>
              <Text style={styles.heroBody}>
                Start with a message and get to know each other at your pace.
              </Text>
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
          </Animated.View>

          <GlassCard style={styles.nextCard}>
            <Text style={styles.nextTitle}>Make the first move feel natural.</Text>
            <Text style={styles.nextBody}>
              A thoughtful hello is enough to get the conversation going.
            </Text>
          </GlassCard>
        </ScrollView>

        <Animated.View style={dockAnim}>
          <FloatingGlassDock style={styles.actionDock}>
            <GlassCTA
              label={
                isOpeningChat
                  ? "Opening chat…"
                  : chatOpenError
                    ? "Try Say Hi again"
                    : "Say Hi"
              }
              onPress={() => {
                void handleStartChat()
              }}
              disabled={!canStartConversation || isOpeningChat}
            />
            {chatOpenError ? (
              <Text accessibilityRole="alert" style={styles.chatOpenError}>
                {chatOpenError}
              </Text>
            ) : null}
            <View style={styles.secondaryActions}>
              <GlassCTA
                label="Keep Exploring"
                variant="secondary"
                onPress={() => navigation.navigate("Lobby")}
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
  chatOpenError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.danger,
    textAlign: "center"
  },
  secondaryActions: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm
  },
  secondaryAction: {
    flex: 1
  }
})
