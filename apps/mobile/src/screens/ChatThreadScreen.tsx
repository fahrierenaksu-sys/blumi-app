import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useIsFocusedBeneathSheets } from "../navigation/nativeSheets/useIsFocusedBeneathSheets"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  type ListRenderItem,
  type ScrollViewProps,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { getMessageRenderKey, useChatThreadStore } from "../features/chat/chatStore"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { ReportModal } from "../components/ReportModal"
import { SoftBlobBackground } from "../ui/backgrounds"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import {
  ChatKeyboardScrollView,
  KeyboardCenteredView,
  KeyboardClippedView,
  KeyboardGluedFooter
} from "../ui/keyboard"
import type { SessionActor } from "../features/session/sessionModel"
import type { ChatThread } from "@blumi/contracts"
import { createMatchFromPersistedThread } from "../features/matches/matchRoomModel"
import { useRoomInviteExpiryClock } from "../features/chat/useRoomInviteExpiryClock"
import {
  applyRoomInviteExpiry,
  buildChatTimeline,
  getChatTimelineItemKey,
  getChatInitialRenderCount,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../features/chat/chatRoomInviteModel"
import {
  CHAT_COPY,
  resolveChatThreadLocale
} from "../features/chat/thread/chatThreadCopy"
import {
  isChatTimelineRowInviteBusy,
  selectChatPartnerSummary
} from "../features/chat/thread/chatThreadModel"
import { ChatScrollToLatestPill } from "../features/chat/thread/ChatScrollToLatestPill"
import { useChatScrollToLatest } from "../features/chat/thread/useChatScrollToLatest"
import type { ChatThreadBindings } from "../features/chat/thread/chatThreadBindings"
import { ChatComposer } from "../features/chat/thread/ChatComposer"
import { ChatLoadEarlierButton } from "../features/chat/thread/ChatLoadEarlierButton"
import { ChatThreadEmptyState } from "../features/chat/thread/ChatThreadEmptyState"
import { ChatThreadSkeleton } from "../features/chat/thread/ChatThreadSkeleton"
import { animateTo, CROSSFADE_ENTERING, useMotion } from "../ui/motion"
import { ChatThreadHeader } from "../features/chat/thread/ChatThreadHeader"
import { ChatTimelineRow } from "../features/chat/thread/ChatTimelineRow"
import { styles } from "../features/chat/thread/chatThreadStyles"
import { useChatMessageSending } from "../features/chat/thread/useChatMessageSending"
import { useChatRoomInviteActions } from "../features/chat/thread/useChatRoomInviteActions"
import { useRequestedRoomInvite } from "../features/chat/thread/useRequestedRoomInvite"
import { useChatThreadLifecycle } from "../features/chat/thread/useChatThreadLifecycle"
import { useChatThreadSync } from "../features/chat/thread/useChatThreadSync"
import { useFocusedConversation } from "../features/notifications/useFocusedConversation"
import { useChatTimelineEntrances } from "../features/chat/thread/useChatTimelineEntrances"
import { useIncomingArrivalHaptic } from "../features/chat/thread/useIncomingArrivalHaptic"
import { useChatTimelineRowModels } from "../features/chat/thread/useChatTimelineRowModels"
import { usePendingMatchedThread } from "../features/chat/thread/usePendingMatchedThread"
import { ChatNotificationPermissionCard, type ChatPushRegistration } from "../features/notifications/ChatNotificationPermissionCard"
import { ChatTypingBubble } from "../features/chat/typing/ChatTypingBubble"
import { useChatDraftTyping } from "../features/chat/typing/useChatDraftTyping"

type ChatThreadScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ChatThread"
> & {
  sessionActor: SessionActor
  onThreadCreated: (thread: ChatThread) => void
  bindings: ChatThreadBindings
  pushRegistration: ChatPushRegistration
}

const EMPTY_ROOM_INVITES: readonly ChatRoomInviteTimelineItem[] = []
const EMPTY_TIMELINE: readonly ChatTimelineItem[] = []

export function ChatThreadScreen(props: ChatThreadScreenProps) {
  const { navigation, route, sessionActor, onThreadCreated, bindings } = props
  const isFocused = useIsFocusedBeneathSheets()
  const { height: windowHeight } = useWindowDimensions()
  const initialMessageRenderCount = getChatInitialRenderCount(windowHeight)
  const { threadId, partnerId: pendingPartnerId, partnerName: pendingPartnerName } = route.params
  const {
    thread,
    messages,
    messageListState,
    historyReady,
    partnerReceipts,
    addOptimisticMessage,
    getMessageDeliveryState,
    getRetryableMessage,
    markOptimisticMessageSending,
    setActiveThread
  } = useChatThreadStore(threadId, pendingPartnerId)
  const [reportVisible, setReportVisible] = useState(false)
  const currentUserId = sessionActor.profile.userId
  const { screenMountedRef, activeUserIdRef } = useChatThreadLifecycle(currentUserId)

  const resolvedThreadId = thread?.threadId ?? threadId
  // Keep notification focus separate from read-receipt AppState transitions.
  useFocusedConversation(resolvedThreadId, isFocused)
  const isPendingThread = !thread && !!pendingPartnerId
  const roomInvites = bindings.roomInvites
  const roomInviteActionHandler = bindings.onRoomInviteAction
  const closeActiveRoomHandler = bindings.onCloseActiveRoom
  const chatLocale = resolveChatThreadLocale(bindings.locale)
  const chatCopy = CHAT_COPY[chatLocale]
  const storedThreadRoomInvites = useMemo(
    () =>
      resolvedThreadId
        ? roomInvites.filter((invite) => invite.threadId === resolvedThreadId)
        : EMPTY_ROOM_INVITES,
    [resolvedThreadId, roomInvites]
  )
  // Expiry has no server event: both phones flip the card at its expiresAt.
  const inviteClockMs = useRoomInviteExpiryClock(storedThreadRoomInvites)
  const threadRoomInvites = useMemo(
    () => applyRoomInviteExpiry(storedThreadRoomInvites, inviteClockMs),
    [inviteClockMs, storedThreadRoomInvites]
  )
  const timeline = useMemo(
    // Acknowledged messages keep their optimistic bubble's key (CHT-04).
    () => buildChatTimeline(messages, threadRoomInvites, getMessageRenderKey),
    [messages, threadRoomInvites]
  )
  // Inverted FlatList starts at offset zero with the newest message visible.
  // The chronological timeline remains the authority for grouping and dates.
  const newestFirstTimeline = useMemo(() => [...timeline].reverse(), [timeline])
  // Do not mount a one-invitation list before the first history page arrives:
  // otherwise FlatList has already spent its initial render on that lone row.
  const awaitingInitialHistory = sessionActor.session.mode === "production" &&
    !historyReady
  const showsTimelineEmptyState = timeline.length === 0 || isPendingThread || awaitingInitialHistory
  // UXO-03: while the first history page loads, a skeleton stands in for the
  // timeline; whatever replaces it (messages or the empty state) crossfades in.
  const showsHistorySkeleton = showsTimelineEmptyState &&
    !isPendingThread &&
    messageListState.status !== "failed" &&
    (awaitingInitialHistory || messageListState.status !== "ready")
  const [historySkeletonShown, setHistorySkeletonShown] = useState(showsHistorySkeleton)
  if (showsHistorySkeleton && !historySkeletonShown) setHistorySkeletonShown(true)
  const timelineEntering = historySkeletonShown ? CROSSFADE_ENTERING : undefined
  const isListPresented = !showsTimelineEmptyState
  // The always-mounted list crossfades in where it used to mount with
  // CROSSFADE_ENTERING: after the skeleton; otherwise it simply shows.
  const motion = useMotion()
  const listOpacity = useSharedValue(isListPresented ? 1 : 0)
  const listRevealStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }))
  useEffect(() => {
    if (!isListPresented) {
      listOpacity.value = 0
      return
    }
    listOpacity.value = historySkeletonShown ? animateTo(1, motion.crossfade) : 1
  }, [historySkeletonShown, isListPresented, listOpacity, motion])

  const {
    isCreatingPendingThread,
    pendingThreadCreationFailed,
    openPendingMatchedThread
  } = usePendingMatchedThread({
    currentUserId,
    pendingPartnerId,
    isPendingThread,
    sessionMode: sessionActor.session.mode,
    sessionToken: sessionActor.session.sessionToken,
    onThreadCreated,
    screenMountedRef,
    activeUserIdRef
  })

  const partnerSummary = useMemo(
    () => selectChatPartnerSummary(thread, currentUserId),
    [currentUserId, thread]
  )

  const partnerName = partnerSummary?.displayName ?? pendingPartnerName ?? chatCopy.unknownPartner
  const partnerUserId = partnerSummary?.userId ?? pendingPartnerId ?? ""
  const partnerAvatar = partnerSummary?.avatar
  const inviteYou = useMemo(() => ({
    userId: currentUserId, name: sessionActor.profile.displayName, avatar: sessionActor.profile.avatar
  }), [currentUserId, sessionActor.profile.displayName, sessionActor.profile.avatar])
  const invitePartner = useMemo(() => ({
    userId: partnerUserId, name: partnerName, avatar: partnerAvatar
  }), [partnerUserId, partnerName, partnerAvatar])
  const persistedMatch = useMemo(
    () => thread && sessionActor.session.mode === "production"
      ? createMatchFromPersistedThread(thread, currentUserId)
      : null,
    [currentUserId, sessionActor.session.mode, thread]
  )

  const { handleRetryMessages } = useChatThreadSync({
    resolvedThreadId,
    currentUserId,
    isFocused,
    latestIncomingMessageId: messages.filter((message) => message.senderUserId !== currentUserId).at(-1)?.messageId,
    requestMessages: bindings.requestMessages,
    refreshParticipants: bindings.refreshParticipants,
    markThreadRead: bindings.markThreadRead,
    setActiveThread
  })

  const {
    handleSend: sendMessage,
    handleRetry,
    handleLoadEarlier,
    isLoadingEarlier
  } = useChatMessageSending({
    resolvedThreadId,
    currentUserId,
    sessionMode: sessionActor.session.mode,
    messages,
    sendChatMessage: bindings.sendChatMessage,
    requestMessages: bindings.requestMessages,
    addOptimisticMessage,
    getRetryableMessage,
    markOptimisticMessageSending
  })

  const {
    activeRoomInviteAction,
    handleRoomInviteAction,
    canCreateRoomInvite,
    isCreatingRoomInvite,
    roomInviteDisabledReason,
    handleRoomInvitePress
  } = useChatRoomInviteActions({
    resolvedThreadId,
    isPendingThread,
    threadRoomInvites,
    roomInviteActionHandler,
    closeActiveRoomHandler,
    chatCopy,
    currentUserId,
    screenMountedRef,
    activeUserIdRef
  })
  // "Invite to room" on the partner's profile comes back here as a one-shot param.
  useRequestedRoomInvite({
    request: route.params.roomInviteRequest,
    isFocused,
    onInvite: handleRoomInvitePress,
    clearRequest: () => navigation.setParams({ roomInviteRequest: undefined })
  })

  // The composer pads itself by the bottom safe area; while the keyboard is
  // open that padding rests on the keyboard instead of leaving a gap (CHT-03).
  const composerBottomInset = useSafeAreaInsets().bottom
  const renderMessageScroll = useCallback(
    (scrollProps: ScrollViewProps) => (
      <ChatKeyboardScrollView {...scrollProps} bottomOffset={composerBottomInset} />
    ),
    [composerBottomInset]
  )
  const scrollToLatestState = useChatScrollToLatest({
    newestFirstTimeline,
    currentUserId,
    bottomOffset: composerBottomInset
  })
  const { scrollToLatest } = scrollToLatestState
  // CHT-05: my own message is always shown, even when I had scrolled up:
  // useChatScrollToLatest follows it once its row is in the list, where it
  // enters like every new row (no flight from the composer).

  const rowModels = useChatTimelineRowModels({
    timeline,
    currentUserId,
    locale: chatLocale,
    getMessageDeliveryState,
    partnerReceipts: bindings.receiptsEnabled ? partnerReceipts : undefined
  })

  const { enteringKeys: enteringRowKeys, arrivedKeys: arrivedRowKeys } = useChatTimelineEntrances({
    timeline,
    isListPresented: !showsTimelineEmptyState
  })
  useIncomingArrivalHaptic({ timeline, arrivedKeys: arrivedRowKeys, currentUserId, screenFocused: isFocused })

  const renderTimelineRow = useCallback<ListRenderItem<ChatTimelineItem>>(
    ({ item }) => {
      const entry = rowModels.get(getChatTimelineItemKey(item))
      if (!entry) return null
      return (
        <ChatTimelineRow
          item={entry.item}
          row={entry.row}
          chatCopy={chatCopy}
          chatLocale={chatLocale}
          currentUserId={currentUserId}
          partnerName={partnerName}
          you={inviteYou}
          partner={invitePartner}
          isEntering={enteringRowKeys.has(getChatTimelineItemKey(item))}
          isInviteBusy={isChatTimelineRowInviteBusy(entry.item, activeRoomInviteAction)}
          onRoomInviteAction={handleRoomInviteAction}
          onRetry={handleRetry}
        />
      )
    },
    [
      rowModels,
      chatCopy,
      chatLocale,
      currentUserId,
      partnerName,
      inviteYou,
      invitePartner,
      enteringRowKeys,
      activeRoomInviteAction,
      handleRoomInviteAction,
      handleRetry
    ]
  )

  const draftTyping = useChatDraftTyping(isPendingThread ? undefined : resolvedThreadId, isFocused)

  const handleGoBack = (): void => {
    goBackOrFallback(navigation, () => navigation.replace("Inbox"))
  }

  if (!thread && !pendingPartnerId) {
    return (
      <View style={styles.root}>
        <SoftBlobBackground variant="lobby" />
        <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right", "bottom"]}>
          <TopBar
            title={chatCopy.chat}
            titleAlign="start"
            leftSlot={
              <ActionButtonCircle accessibilityLabel={chatCopy.back} onPress={handleGoBack} size={40}>
                <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
              </ActionButtonCircle>
            }
          />
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {chatCopy.pendingConversation}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right"]}>
        <ChatThreadHeader
          chatCopy={chatCopy}
          chatLocale={chatLocale}
          partnerName={partnerName}
          partnerUserId={partnerUserId}
          partnerAvatar={partnerAvatar}
          onBack={handleGoBack}
          onViewMatch={persistedMatch
            ? () => navigation.navigate("MatchResult", { match: persistedMatch, celebrate: false })
            : null}
          onOpenSafety={() => setReportVisible(true)}
          onOpenProfile={partnerUserId
            ? () => navigation.navigate("ProfilePreview", { userId: partnerUserId, context: "matched" })
            : null}
        />

        <ReportModal
          visible={reportVisible}
          targetUserId={partnerUserId}
          targetDisplayName={partnerName}
          sessionActor={sessionActor}
          onClose={() => setReportVisible(false)}
        />

        {/* iOS: the list and the footer follow the keyboard frame on the UI
            thread, including an interactive drag-to-dismiss. Android keeps
            its window resize (ui/keyboard.tsx). */}
        <View style={styles.flex}>
          <ChatNotificationPermissionCard key={currentUserId} userId={currentUserId}
            mode={sessionActor.session.mode} isFocused={isFocused} locale={chatLocale}
            registration={props.pushRegistration} />
          <View style={styles.flex}>
            {/* The list stays mounted (empty while the skeleton or the empty
                state shows) so its keyboard inset has seen every keyboard
                event: a list mounted while the keyboard is already open, as
                when the first message of a new chat is sent, would start
                without one and put that message under the composer. */}
            <Animated.View
              pointerEvents={isListPresented ? "auto" : "none"}
              accessibilityElementsHidden={!isListPresented}
              importantForAccessibility={isListPresented ? "auto" : "no-hide-descendants"}
              style={[styles.flex, listRevealStyle]}
            >
            <KeyboardClippedView bottomInset={composerBottomInset} style={styles.flex}>
            <Animated.FlatList
              ref={scrollToLatestState.listRef}
              renderScrollComponent={renderMessageScroll}
              data={isListPresented ? newestFirstTimeline : EMPTY_TIMELINE}
              inverted
              onScroll={scrollToLatestState.scrollHandler}
              scrollEventThrottle={16}
              initialNumToRender={initialMessageRenderCount}
              keyExtractor={getChatTimelineItemKey}
              style={styles.messageListContainer}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              // No autoscrollToTopThreshold: React Native's autoscroll goes
              // to offset 0, under the keyboard inset. Following the newest
              // message is useChatScrollToLatest's job.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              ListFooterComponent={
                isListPresented && sessionActor.session.mode === "production" && messages.length > 0 ? (
                  <ChatLoadEarlierButton
                    chatCopy={chatCopy}
                    isLoadingEarlier={isLoadingEarlier}
                    onPress={handleLoadEarlier}
                  />
                ) : null
              }
              renderItem={renderTimelineRow}
            />
            </KeyboardClippedView>
            </Animated.View>
            {/* Always mounted, so the skeleton's own exit still plays. */}
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {showsHistorySkeleton ? (
              <ChatThreadSkeleton label={chatCopy.openingChat} />
            ) : showsTimelineEmptyState ? (
              <Animated.View entering={timelineEntering} style={styles.flex}>
              <KeyboardCenteredView bottomInset={composerBottomInset} style={styles.flex}>
              <ChatThreadEmptyState
                chatCopy={chatCopy}
                isPendingThread={isPendingThread}
                pendingThreadCreationFailed={pendingThreadCreationFailed}
                isCreatingPendingThread={isCreatingPendingThread}
                onRetryOpenChat={() => { void openPendingMatchedThread() }}
                messageListState={messageListState}
                onRetryMessages={handleRetryMessages}
                partnerName={partnerName}
                partnerUserId={partnerUserId}
                partnerAvatar={partnerAvatar}
              />
              </KeyboardCenteredView>
              </Animated.View>
            ) : null}
            </View>
          </View>

          <KeyboardGluedFooter bottomInset={composerBottomInset}>
          {showsTimelineEmptyState ? null : (
            // Rides with the composer so it never hides under the keyboard.
            <View pointerEvents="box-none" style={styles.scrollToLatestAnchor}>
              <ChatScrollToLatestPill
                visible={scrollToLatestState.isAway}
                count={scrollToLatestState.unseenCount}
                chatCopy={chatCopy}
                onPress={scrollToLatest}
              />
            </View>
          )}
          <ChatTypingBubble threadId={resolvedThreadId} partnerUserId={partnerUserId} partnerName={partnerName} locale={chatLocale} />
          <ChatComposer
            draftTyping={draftTyping}
            chatCopy={chatCopy}
            partnerName={partnerName}
            chatLocale={chatLocale}
            isPendingThread={isPendingThread}
            canCreateRoomInvite={canCreateRoomInvite}
            roomInviteReady={threadRoomInvites.some(invite => invite.status === "accepted" && Boolean(invite.roomSessionId))}
            isCreatingRoomInvite={isCreatingRoomInvite}
            roomInviteDisabledReason={roomInviteDisabledReason}
            onRoomInvitePress={handleRoomInvitePress}
            onSend={sendMessage}
          />
          </KeyboardGluedFooter>
        </View>
      </SafeAreaView>
    </View>
  )
}
