import { useIsFocusedBeneathSheets } from "../navigation/nativeSheets/useIsFocusedBeneathSheets"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useChatInboxStore, type ThreadListState } from "../features/chat/chatStore"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import { getInboxCopy, type InboxCopy } from "../features/chat/inboxCopy"
import Reanimated, {
  Easing,
  ReduceMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"
import { ConversationCard, INBOX_ROW_ESTIMATED_HEIGHT } from "../features/inbox/InboxConversationRow"
import { INBOX_ROW_LAYOUT } from "../features/inbox/inboxMotion"
import {
  buildInboxRowAccessibilityLabel,
  buildInboxRowPreview,
  createInboxTimeFormatter,
  formatInboxTimestamp,
  formatInboxUnreadBadge,
  resolveInboxDateLocale
} from "../features/inbox/inboxRowModel"
import { useInboxClock } from "../features/inbox/useInboxClock"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import { MyAvatar } from "../ui/myAvatar"
import { uiTheme } from "../ui/theme"
import { useEntranceAnimation, useReducedMotion } from "../ui/animations"
import { PressableScale } from "../ui/PressableScale"
import { InboxLoadingSkeleton } from "../features/inbox/InboxLoadingSkeleton"
import { shouldShowInboxSkeleton } from "../features/inbox/inboxEntranceModel"
import { useInboxRowEntrance } from "../features/inbox/useInboxRowEntrance"
import { getInboxUnreadPulse } from "../features/inbox/inboxUnreadPulseModel"
import { useInboxPullToRefresh } from "../features/inbox/useInboxPullToRefresh"
import { useInboxThreadWarmup } from "../features/inbox/useInboxThreadWarmup"
import { useMainTabReselect } from "../ui/layout/useMainTabReselect"
import { useMessageAlertSuppression } from "../features/notifications/useFocusedConversation"
import { InboxConversationActionsSheet } from "../features/inbox/InboxConversationActionsSheet"
import { getInboxConversationActionsCopy } from "../features/inbox/inboxConversationActionsCopy"
import {
  arrangeInboxThreads,
  deleteConversationForMe,
  isConversationPinned,
  pinConversation,
  unpinConversation
} from "../features/inbox/inboxConversationPrefsModel"
import { useInboxConversationPrefs } from "../features/inbox/inboxConversationPrefsStore"
import type { SessionActor } from "../features/session/sessionModel"

type InboxScreenProps = NativeStackScreenProps<RootStackParamList, "Inbox"> & {
  sessionActor: SessionActor
  onRetryThreads: () => Promise<void>
  onWarmThread: (threadId: string) => Promise<void>
  /** Marks a conversation read up to a partner message (delete for me clears its unread). */
  onMarkThreadRead?: (threadId: string, upToMessageId?: string) => void
  /**
   * Delete for me on the server too (every device; history after a newer
   * message). Best effort: the on-device hide below applies either way.
   */
  onHideThreadForMe?: (threadId: string, throughMessageId?: string) => void
}

const CONVERSATION_ROW_GAP = uiTheme.spacing.sm + 2
const ItemSpacer = () => <View style={styles.itemSpacer} />

/* ── Main InboxScreen ───────────────────────────────────────── */

export function InboxScreen(props: InboxScreenProps) {
  const { navigation, sessionActor } = props
  const { onWarmThread, onRetryThreads } = props
  const { threads: storeThreads, threadListState, getThreadUnreadCount } = useChatInboxStore()
  const currentUserId = sessionActor.profile.userId
  // Pinned first, deleted-for-me hidden; kept per account on this phone.
  const { prefs: conversationPrefs, update: updateConversationPrefs } = useInboxConversationPrefs(currentUserId)
  const threads = useMemo(
    () => arrangeInboxThreads(storeThreads, conversationPrefs),
    [conversationPrefs, storeThreads]
  )
  const lastFocusRefreshAtRef = useRef(0)
  // The list shows each new message in its row: no message banner on top.
  const isFocused = useIsFocusedBeneathSheets()
  useMessageAlertSuppression(isFocused)

  useEffect(() => {
    if (sessionActor.session.mode !== "production") return
    const refresh = (): void => {
      if (!navigation.isFocused()) return
      const now = Date.now()
      if (now - lastFocusRefreshAtRef.current < 5_000) return
      lastFocusRefreshAtRef.current = now
      void onRetryThreads().catch(() => undefined)
    }
    const unsubscribe = navigation.addListener("focus", refresh)
    refresh()
    return unsubscribe
  }, [navigation, onRetryThreads, sessionActor.session.mode])
  const locale = useMemo(
    () => resolveAccountRecoveryLocale(
      getNativeAppLocale(),
      Intl.DateTimeFormat().resolvedOptions().locale
    ),
    []
  )
  const copy = useMemo(() => getInboxCopy(locale), [locale])
  const actionsCopy = useMemo(() => getInboxConversationActionsCopy(locale), [locale])
  const timeFormatter = useMemo(
    () => createInboxTimeFormatter(resolveInboxDateLocale(locale, Intl.DateTimeFormat().resolvedOptions().locale)),
    [locale]
  )
  const now = useInboxClock(navigation)

  const headerAnim = useEntranceAnimation({ delay: 0, translateY: 16 })
  // One UI-thread pulse shared by every unread row's glow.
  const unreadPulse = useSharedValue(1)
  const reduceMotion = useReducedMotion()
  // Keyed on the joined ids, not the thread objects: a store update that
  // keeps the same conversations keeps getItemAnim and renderThreadRow.
  const threadKeySignature = threads.map((thread) => thread.threadId).join("\u0000")
  const threadKeys = useMemo(
    () => (threadKeySignature === "" ? [] : threadKeySignature.split("\u0000")),
    [threadKeySignature]
  )
  // Keyed by thread id and stable across renders: a new thread enters alone.
  const getItemAnim = useInboxRowEntrance(threadKeys, reduceMotion)
  const isOpeningThreads = shouldShowInboxSkeleton(threadListState.status, threads.length)
  // The store keeps one thread snapshot per list change, so `threads` alone
  // does not change when only a badge does; the rows follow the counts too.
  const unreadSignature = threads.map((thread) => getThreadUnreadCount(thread.threadId)).join(",")

  const threadRows = useMemo(() => {
    const unreadCounts = unreadSignature.split(",")
    return threads.map((thread, index) => {
      const partnerSummary = thread.participants.find(
        (p) => p.userId !== currentUserId
      ) ?? thread.participants[0]
      const partnerName = partnerSummary?.displayName ?? copy.unknownPartner
      const partnerUserId = partnerSummary?.userId ?? ""
      const partnerAvatar = partnerSummary?.avatar
      const preview = buildInboxRowPreview({ lastMessage: thread.lastMessage, currentUserId, copy })
      const time = formatInboxTimestamp(thread.lastMessage?.sentAt, now, copy, timeFormatter)
      const unreadCount = Number(unreadCounts[index]) || 0
      const isPinned = isConversationPinned(conversationPrefs, thread.threadId)
      const rowLabel = buildInboxRowAccessibilityLabel(copy, {
        partnerName, unreadCount, preview, timeSpoken: time.spoken
      })
      return {
        thread,
        partnerName,
        partnerUserId,
        partnerAvatar,
        previewPrefix: preview.prefix,
        lastBody: preview.body,
        lastTime: time.label,
        unreadBadge: formatInboxUnreadBadge(unreadCount),
        accessibilityLabel: isPinned ? `${actionsCopy.pinned}, ${rowLabel}` : rowLabel,
        hasUnread: unreadCount > 0,
        isPinned
      }
    })
  }, [actionsCopy, conversationPrefs, copy, currentUserId, now, threads, timeFormatter, unreadSignature])
  const listRef = useRef<FlatList<(typeof threadRows)[number]>>(null)
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })
  }, [reduceMotion])
  useMainTabReselect("chats", scrollToTop)
  const { refreshing, onRefresh } = useInboxPullToRefresh(onRetryThreads)

  const warmThreadIds = useMemo(
    () => threads
      .filter((thread) => thread.participantUserIds.includes(currentUserId) && thread.lastMessage)
      .slice(0, 6)
      .map((thread) => thread.threadId)
      .join("|"),
    [currentUserId, threads]
  )

  useInboxThreadWarmup({
    navigation,
    enabled: sessionActor.session.mode === "production",
    threadIds: warmThreadIds,
    warmThread: onWarmThread
  })

  const hasUnreadThread = useMemo(
    () => threadRows.some((thread) => thread.hasUnread),
    [threadRows]
  )

  useEffect(() => {
    const pulse = getInboxUnreadPulse(reduceMotion)
    if (!hasUnreadThread || pulse.iterations === 0) {
      unreadPulse.value = 1
      return
    }
    const half = { duration: 1000, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }
    unreadPulse.value = withRepeat(
      withSequence(withTiming(pulse.maxScale, half), withTiming(1, half)),
      pulse.iterations
    )
  }, [hasUnreadThread, reduceMotion, unreadPulse])

  // A tap navigates and nothing else: the row's press-in already warmed the
  // thread, and the chat screen requests its history itself (deduplicated).
  const openThread = useCallback(
    (threadId: string) => {
      navigation.navigate("ChatThread", { threadId })
    },
    [navigation]
  )
  const warmThread = useCallback((threadId: string) => {
    if (sessionActor.session.mode === "production") void onWarmThread(threadId)
  }, [onWarmThread, sessionActor.session.mode])
  const [actionsThreadId, setActionsThreadId] = useState<string | null>(null)
  const openConversationActions = useCallback((threadId: string) => {
    setActionsThreadId(threadId)
  }, [])
  const closeConversationActions = useCallback(() => setActionsThreadId(null), [])
  const actionsTarget = useMemo(() => {
    const row = actionsThreadId ? threadRows.find((candidate) => candidate.thread.threadId === actionsThreadId) : undefined
    return row ? {
      threadId: row.thread.threadId,
      partnerName: row.partnerName,
      partnerUserId: row.partnerUserId,
      partnerAvatar: row.partnerAvatar,
      isPinned: row.isPinned
    } : null
  }, [actionsThreadId, threadRows])
  const togglePinnedConversation = useCallback((threadId: string) => {
    updateConversationPrefs((prefs) => isConversationPinned(prefs, threadId)
      ? unpinConversation(prefs, threadId)
      : pinConversation(prefs, threadId, new Date()))
    setActionsThreadId(null)
  }, [updateConversationPrefs])
  const { onMarkThreadRead, onHideThreadForMe } = props
  const deleteConversation = useCallback((threadId: string) => {
    const thread = storeThreads.find((candidate) => candidate.threadId === threadId)
    setActionsThreadId(null)
    if (!thread) return
    // A deleted chat must not keep counting in the tab and app-icon badges.
    const last = thread.lastMessage
    if (getThreadUnreadCount(threadId) > 0 && last && last.senderUserId !== currentUserId) {
      onMarkThreadRead?.(threadId, last.messageId)
    }
    updateConversationPrefs((prefs) => deleteConversationForMe(prefs, thread))
    // Through the newest message this list showed, never one it did not.
    onHideThreadForMe?.(threadId, last?.messageId)
  }, [currentUserId, getThreadUnreadCount, onHideThreadForMe, onMarkThreadRead, storeThreads, updateConversationPrefs])
  const handleGoDiscover = useCallback(() => {
    navigation.navigate("Lobby")
  }, [navigation])
  const renderThreadRow = useCallback(({ item }: {
    item: (typeof threadRows)[number]
  }) => (
    <Reanimated.View entering={getItemAnim(item.thread.threadId)}>
      <ConversationCard
        threadId={item.thread.threadId}
        copy={copy}
        partnerName={item.partnerName}
        partnerUserId={item.partnerUserId}
        partnerAvatar={item.partnerAvatar}
        previewPrefix={item.previewPrefix}
        lastBody={item.lastBody}
        lastTime={item.lastTime}
        unreadBadge={item.unreadBadge}
        accessibilityLabel={item.accessibilityLabel}
        unreadPulse={unreadPulse}
        onPress={openThread}
        onWarm={warmThread}
        isPinned={item.isPinned}
        actionsCopy={actionsCopy}
        onLongPress={openConversationActions}
      />
    </Reanimated.View>
  ), [actionsCopy, copy, getItemAnim, openConversationActions, openThread, unreadPulse, warmThread])

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        {/* A main tab: no back button (the tab bar leaves it), and the
            title sits on the content's leading edge. */}
        <View style={styles.titleBar}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.titleBarText}>{copy.title}</Text>
        </View>

        <Reanimated.View style={[styles.header, headerAnim]}>
          {/* The count has its own reserved slot, so the header keeps one
              height and one title before and after conversations arrive. */}
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text
              accessibilityElementsHidden={threads.length === 0}
              importantForAccessibility={threads.length === 0 ? "no" : "auto"}
              numberOfLines={1}
              style={[styles.headerCount, threads.length === 0 ? styles.headerCountHidden : null]}
            >
              {copy.conversationCount(threads.length)}
            </Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {copy.inboxTitle}
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
        </Reanimated.View>

        <View style={styles.listArea}>
          {/* Rows are 88–99 pt (one or two preview lines, Dynamic Type), so
              FlatList measures them instead of assuming a fixed height. A
              thread moving to the top slides there without a jump. */}
          <Reanimated.FlatList
            ref={listRef}
            data={threadRows}
            keyExtractor={(row) => row.thread.threadId}
            itemLayoutAnimation={reduceMotion ? undefined : INBOX_ROW_LAYOUT}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={uiTheme.colors.primary}
                colors={[uiTheme.colors.primary]}
              />
            }
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
          <InboxLoadingSkeleton
            isVisible={isOpeningThreads}
            label={copy.opening}
            reduceMotion={reduceMotion}
            rowHeight={INBOX_ROW_ESTIMATED_HEIGHT}
            rowGap={CONVERSATION_ROW_GAP}
          />
        </View>
      </SafeAreaView>
      <InboxConversationActionsSheet
        target={actionsTarget}
        copy={actionsCopy}
        onTogglePin={togglePinnedConversation}
        onDelete={deleteConversation}
        onClose={closeConversationActions}
      />
    </View>
  )
}

/* ── Empty Inbox ────────────────────────────────────────────── */

interface EmptyInboxProps {
  copy: InboxCopy
  threadListState: ThreadListState
  myDisplayName?: string
  myUserId?: string
  onGoDiscover?: () => void
  onRetryThreads?: () => Promise<void>
}

function EmptyInbox(props: EmptyInboxProps) {
  const entranceStyle = useEntranceAnimation({ translateY: 24 })

  if (
    props.threadListState.status === "idle" ||
    props.threadListState.status === "loading"
  ) {
    // InboxLoadingSkeleton stands in for the list while it opens.
    return null
  }
  if (props.threadListState.status === "failed") {
    return (
      <Reanimated.View
        accessibilityRole="alert"
        style={[
          emptyStyles.card,
          entranceStyle
        ]}
      >
        <Text style={emptyStyles.title}>{props.copy.failedTitle}</Text>
        <Text style={emptyStyles.body}>
          {props.threadListState.errorMessage}
        </Text>
        {props.onRetryThreads ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={props.copy.retryOpeningChats}
            onPress={() => {
              void props.onRetryThreads?.().catch(() => undefined)
            }}
            style={emptyStyles.ctaOuter}
          >
            <LinearGradient
              colors={uiTheme.gradients.warm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={emptyStyles.ctaGradient}
            >
              <Text style={emptyStyles.ctaText}>{props.copy.tryAgain}</Text>
            </LinearGradient>
          </PressableScale>
        ) : null}
      </Reanimated.View>
    )
  }
  return (
    <Reanimated.View
      style={[
        emptyStyles.card,
        entranceStyle
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
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={props.copy.goToDiscover}
          onPress={props.onGoDiscover}
          style={emptyStyles.ctaOuter}
        >
          <LinearGradient
            colors={uiTheme.gradients.warm}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={emptyStyles.ctaGradient}
          >
            <Text style={emptyStyles.ctaText}>{props.copy.discoverPeople}</Text>
          </LinearGradient>
        </PressableScale>
      ) : null}
    </Reanimated.View>
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
  titleBar: {
    minHeight: 60,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  titleBarText: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary
  },
  header: {
    gap: uiTheme.spacing.xxs,
    paddingHorizontal: 2,
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.md
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm
  },
  eyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary
  },
  headerCount: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted
  },
  headerCountHidden: {
    opacity: 0
  },
  listArea: {
    flex: 1
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
    height: CONVERSATION_ROW_GAP
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
