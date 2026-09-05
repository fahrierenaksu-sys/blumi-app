import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useChatStore } from "../features/chat/chatStore"
import type { AccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import { getInboxCopy, type InboxCopy } from "../features/chat/inboxCopy"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { ParticipantAvatar } from "../ui/participantAvatar"
import { areChatParticipantAvatarsEquivalent } from "../features/chat/chatParticipantAvatar"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import { MyAvatar } from "../ui/myAvatar"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { useEntranceAnimation, useReducedMotion, useStaggeredEntrance } from "../ui/animations"
import type { SessionActor } from "../features/session/sessionModel"

type InboxScreenProps = NativeStackScreenProps<RootStackParamList, "Inbox"> & {
  sessionActor: SessionActor
  onRetryThreads: () => Promise<void>
}

const CONVERSATION_ROW_HEIGHT = 80
const ItemSpacer = () => <View style={styles.itemSpacer} />

function formatTimeAgo(
  isoDate: string | undefined,
  locale: AccountRecoveryLocale
): string {
  if (!isoDate) return ""
  const ts = Date.parse(isoDate)
  if (!Number.isFinite(ts)) return ""
  const deltaMs = Math.max(0, Date.now() - ts)
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) return locale === "tr" ? "Şimdi" : "Just now"
  if (minutes < 60) return locale === "tr" ? `${minutes} dk` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === "tr" ? `${hours} sa` : `${hours}h`
  const days = Math.floor(hours / 24)
  return locale === "tr"
    ? `${days} ${days === 1 ? "gün" : "gün"}`
    : days === 1 ? "1d" : `${days}d`
}

/* ── Animated conversation card ─────────────────────────────── */

interface ConversationCardProps {
  copy: InboxCopy
  partnerName: string
  partnerUserId: string
  partnerAvatar?: AvatarSelection
  lastBody: string | undefined
  lastTime: string
  hasUnread: boolean
  unreadPulseAnim: Animated.Value
  onPress: () => void
}

const ConversationCard = memo(function ConversationCard(props: ConversationCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4
    }).start()
  }, [scaleAnim])

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4
    }).start()
  }, [scaleAnim])

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.copy.openChatWith(props.partnerName, props.hasUnread)}
        style={cardStyles.card}
        onPress={props.onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Gradient left accent */}
        <LinearGradient
          colors={uiTheme.gradients.primary}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={cardStyles.leftAccent}
        />

        {/* The chat thread carries no verified presence state. */}
        <View style={cardStyles.avatarWrap}>
          <ParticipantAvatar
            name={props.partnerName}
            seed={props.partnerUserId}
            avatar={props.partnerAvatar}
            size={56}
            ring="soft"
          />
        </View>

        <View style={cardStyles.body}>
          <View style={cardStyles.nameRow}>
            <Text style={cardStyles.name} numberOfLines={1}>
              {props.partnerName}
            </Text>
            {props.lastTime ? (
              <Text style={cardStyles.time}>{props.lastTime}</Text>
            ) : null}
          </View>
          {props.lastBody ? (
            <Text style={cardStyles.preview} numberOfLines={2}>
              {props.lastBody}
            </Text>
          ) : (
            <Text style={cardStyles.previewEmpty}>
              {props.copy.startWithSpark}
            </Text>
          )}
        </View>

        <View style={cardStyles.chevronWrap}>
          {props.hasUnread ? (
            <View style={cardStyles.unreadWrap}>
              <Animated.View
                style={[
                  cardStyles.unreadGlow,
                  { transform: [{ scale: props.unreadPulseAnim }] }
                ]}
              />
              <LinearGradient
                colors={uiTheme.gradients.primary}
                style={cardStyles.unreadDot}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            </View>
          ) : (
            <Ionicons
              name="chevron-forward"
              size={20}
              color={uiTheme.colors.textMuted}
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  )
}, (previous, next) =>
  previous.copy === next.copy &&
  previous.partnerName === next.partnerName &&
  previous.partnerUserId === next.partnerUserId &&
  areChatParticipantAvatarsEquivalent(
    previous.partnerAvatar,
    next.partnerAvatar
  ) &&
  previous.lastBody === next.lastBody &&
  previous.lastTime === next.lastTime &&
  previous.hasUnread === next.hasUnread &&
  previous.unreadPulseAnim === next.unreadPulseAnim &&
  previous.onPress === next.onPress
)

/* ── Main InboxScreen ───────────────────────────────────────── */

export function InboxScreen(props: InboxScreenProps) {
  const { navigation, sessionActor } = props
  const { threads, threadListState, getThreadUnreadCount } = useChatStore()
  const currentUserId = sessionActor.profile.userId
  const locale = useMemo(
    () => resolveAccountRecoveryLocale(
      getNativeAppLocale(),
      Intl.DateTimeFormat().resolvedOptions().locale
    ),
    []
  )
  const copy = useMemo(() => getInboxCopy(locale), [locale])

  const headerAnim = useEntranceAnimation({ delay: 0, translateY: 16 })
  const getItemAnim = useStaggeredEntrance(threads.length)
  const unreadPulseAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()

  const threadRows = useMemo(() => {
    return threads.map((thread) => {
      const partnerSummary = thread.participants.find(
        (p) => p.userId !== currentUserId
      ) ?? thread.participants[0]
      const partnerName = partnerSummary?.displayName ?? "Someone"
      const partnerUserId = partnerSummary?.userId ?? ""
      const partnerAvatar = partnerSummary?.avatar
      const rawLastBody = thread.lastMessage?.body
      const lastBody =
        rawLastBody?.trim() === "__room_invite__"
          ? copy.roomInvitation
          : rawLastBody
      return {
        thread,
        partnerName,
        partnerUserId,
        partnerAvatar,
        lastBody,
        lastTime: formatTimeAgo(thread.lastMessage?.sentAt, locale),
        hasUnread: getThreadUnreadCount(thread.threadId) > 0
      }
    })
  }, [copy.roomInvitation, currentUserId, getThreadUnreadCount, locale, threads])

  const hasUnreadThread = useMemo(
    () => threadRows.some((thread) => thread.hasUnread),
    [threadRows]
  )

  useEffect(() => {
    if (!hasUnreadThread || reduceMotion) {
      unreadPulseAnim.stopAnimation()
      unreadPulseAnim.setValue(1)
      return undefined
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(unreadPulseAnim, {
          toValue: 1.45,
          duration: 1000,
          useNativeDriver: true
        }),
        Animated.timing(unreadPulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true
        })
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [hasUnreadThread, reduceMotion, unreadPulseAnim])

  const openThread = useCallback(
    (threadId: string) => {
      navigation.navigate("ChatThread", { threadId })
    },
    [navigation]
  )
  const handleGoBack = useCallback(() => {
    navigation.goBack()
  }, [navigation])
  const handleGoDiscover = useCallback(() => {
    navigation.navigate("Lobby")
  }, [navigation])
  const renderThreadRow = useCallback(({ item, index }: {
    item: (typeof threadRows)[number]
    index: number
  }) => (
    <Animated.View style={getItemAnim(index)}>
      <ConversationCard
        copy={copy}
        partnerName={item.partnerName}
        partnerUserId={item.partnerUserId}
        partnerAvatar={item.partnerAvatar}
        lastBody={item.lastBody}
        lastTime={item.lastTime}
        hasUnread={item.hasUnread}
        unreadPulseAnim={unreadPulseAnim}
        onPress={() => openThread(item.thread.threadId)}
      />
    </Animated.View>
  ), [copy, getItemAnim, openThread, unreadPulseAnim])

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <TopBar
          title={copy.title}
          titleAlign="start"
          leftSlot={
            <ActionButtonCircle accessibilityLabel={copy.back} onPress={handleGoBack} size={40}>
              <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
            </ActionButtonCircle>
          }
          rightSlot={<View style={styles.topRightSpacer} />}
        />

        <Animated.View style={[styles.header, headerAnim]}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.headerTitle}>
            {threads.length === 0
              ? copy.inboxTitle
              : copy.conversationCount(threads.length)}
          </Text>
          <Text style={styles.headerSubhead}>
            {copy.headerSubhead}
          </Text>
          {/* Gradient underline */}
          <LinearGradient
            colors={[uiTheme.colors.primary, uiTheme.colors.primarySoft, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerUnderline}
          />
        </Animated.View>

        <FlatList
          data={threadRows}
          keyExtractor={(row) => row.thread.threadId}
          getItemLayout={(_, index) => ({
            length: CONVERSATION_ROW_HEIGHT,
            offset: CONVERSATION_ROW_HEIGHT * index,
            index
          })}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyInbox
              threadListState={threadListState}
              myDisplayName={sessionActor.profile.displayName}
              myUserId={sessionActor.profile.userId}
              copy={copy}
              onGoDiscover={handleGoDiscover}
              onRetryThreads={props.onRetryThreads}
            />
          }
          ItemSeparatorComponent={ItemSpacer}
          renderItem={renderThreadRow}
        />
      </SafeAreaView>
    </View>
  )
}

/* ── Empty Inbox ────────────────────────────────────────────── */

interface EmptyInboxProps {
  copy: InboxCopy
  threadListState: ReturnType<typeof useChatStore>["threadListState"]
  myDisplayName?: string
  myUserId?: string
  onGoDiscover?: () => void
  onRetryThreads?: () => Promise<void>
}

function EmptyInbox(props: EmptyInboxProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(24)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: uiTheme.animation.durationEntrance,
        useNativeDriver: true
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: uiTheme.animation.durationEntrance,
        useNativeDriver: true
      })
    ]).start()
  }, [fadeAnim, slideAnim])

  if (
    props.threadListState.status === "idle" ||
    props.threadListState.status === "loading"
  ) {
    return (
      <Animated.View
        style={[
          emptyStyles.card,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}
      >
        <Text style={emptyStyles.body}>{props.copy.opening}</Text>
      </Animated.View>
    )
  }
  if (props.threadListState.status === "failed") {
    return (
      <Animated.View
        accessibilityRole="alert"
        style={[
          emptyStyles.card,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}
      >
        <Text style={emptyStyles.title}>{props.copy.failedTitle}</Text>
        <Text style={emptyStyles.body}>
          {props.threadListState.errorMessage}
        </Text>
        {props.onRetryThreads ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.copy.retryOpeningChats}
            onPress={() => {
              void props.onRetryThreads?.().catch(() => undefined)
            }}
            style={({ pressed }) => [
              emptyStyles.ctaOuter,
              pressed ? { opacity: 0.85 } : null
            ]}
          >
            <LinearGradient
              colors={uiTheme.gradients.warm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={emptyStyles.ctaGradient}
            >
              <Text style={emptyStyles.ctaText}>{props.copy.tryAgain}</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
      </Animated.View>
    )
  }
  return (
    <Animated.View
      style={[
        emptyStyles.card,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      {/* Gradient glow orb */}
      <LinearGradient
        colors={[uiTheme.colors.accentGlowStrong, uiTheme.colors.primarySoft, "transparent"]}
        style={emptyStyles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      {props.myDisplayName ? (
        <MyAvatar
          name={props.myDisplayName}
          seed={props.myUserId ?? props.myDisplayName}
          size={80}
          ring="soft"
        />
      ) : null}
      <Text style={emptyStyles.title}>{props.copy.emptyTitle}</Text>
      <Text style={emptyStyles.body}>
        {props.copy.emptyBody}
      </Text>
      {props.onGoDiscover ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.copy.goToDiscover}
          onPress={props.onGoDiscover}
          style={({ pressed }) => [
            emptyStyles.ctaOuter,
            pressed ? { opacity: 0.85 } : null
          ]}
        >
          <LinearGradient
            colors={uiTheme.gradients.warm}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={emptyStyles.ctaGradient}
          >
            <Text style={emptyStyles.ctaText}>{props.copy.discoverPeople}</Text>
          </LinearGradient>
        </Pressable>
      ) : null}
    </Animated.View>
  )
}

/* ── Styles ─────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  safe: {
    flex: 1,
    paddingTop: uiTheme.spacing.sm
  },
  topRightSpacer: {
    width: 40
  },
  header: {
    gap: uiTheme.spacing.xxs,
    paddingHorizontal: 2,
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.md
  },
  eyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary
  },
  headerTitle: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary
  },
  headerSubhead: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    marginTop: 2
  },
  headerUnderline: {
    height: 3,
    borderRadius: 2,
    width: "40%",
    marginTop: uiTheme.spacing.xs
  },
  scroll: {
    paddingBottom: uiTheme.spacing.xxl
  },
  itemSpacer: {
    height: uiTheme.spacing.sm + 2
  }
})

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.md,
    padding: uiTheme.spacing.md,
    paddingLeft: uiTheme.spacing.md + 4,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    overflow: "hidden",
    position: "relative",
    ...uiTheme.shadow.float
  },
  leftAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 2.5,
    borderRadius: 2
  },
  avatarWrap: {
    position: "relative"
  },
  body: {
    flex: 1,
    gap: 3
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.xs
  },
  name: {
    flex: 1,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.subheading
  },
  time: {
    color: uiTheme.colors.textMuted,
    ...uiTheme.font.caption
  },
  preview: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.bodySmall
  },
  previewEmpty: {
    color: uiTheme.colors.textMuted,
    ...uiTheme.font.bodySmall,
    fontStyle: "italic"
  },
  chevronWrap: {
    width: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadWrap: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadGlow: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: uiTheme.colors.accentGlow
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  }
})

const emptyStyles = StyleSheet.create({
  card: {
    marginTop: uiTheme.spacing.md,
    padding: uiTheme.spacing.xl,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    gap: uiTheme.spacing.sm,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
    ...uiTheme.shadow.float
  },
  glow: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -100,
    right: -80,
    opacity: 0.6
  },
  title: {
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.subheading,
    fontWeight: "800",
    textAlign: "center"
  },
  body: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.bodySmall,
    textAlign: "center",
    paddingHorizontal: uiTheme.spacing.sm
  },
  ctaOuter: {
    marginTop: uiTheme.spacing.xs,
    borderRadius: uiTheme.radius.full,
    overflow: "hidden"
  },
  ctaGradient: {
    paddingHorizontal: uiTheme.spacing.xl,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center"
  },
  ctaText: {
    color: "#FFFFFF",
    ...uiTheme.font.bodySmall,
    fontWeight: "800"
  }
})
