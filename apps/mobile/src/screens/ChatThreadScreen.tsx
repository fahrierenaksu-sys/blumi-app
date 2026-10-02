import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useIsFocusedBeneathSheets } from "../navigation/nativeSheets/useIsFocusedBeneathSheets"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  type ListRenderItem,
  Platform,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import Animated from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { getMessageRenderKey, useChatThreadStore } from "../features/chat/chatStore"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { ReportModal } from "../components/ReportModal"
import { SoftBlobBackground } from "../ui/backgrounds"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
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
  normalizeOutgoingChatBody,
  selectChatPartnerSummary
} from "../features/chat/thread/chatThreadModel"
import { ChatScrollToLatestPill } from "../features/chat/thread/ChatScrollToLatestPill"
import { useChatScrollToLatest } from "../features/chat/thread/useChatScrollToLatest"
import type { ChatThreadBindings } from "../features/chat/thread/chatThreadBindings"
import { ChatComposer } from "../features/chat/thread/ChatComposer"
import { ChatLoadEarlierButton } from "../features/chat/thread/ChatLoadEarlierButton"
import { ChatThreadEmptyState } from "../features/chat/thread/ChatThreadEmptyState"
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
import { getChatSendFlightChannel, launchChatSendFlight } from "../features/chat/thread/chatSendFlight"
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

  const scrollToLatestState = useChatScrollToLatest({ newestFirstTimeline, currentUserId })
  const { scrollToLatest, isAway: isScrolledAway } = scrollToLatestState
  const sendFlightChannel = getChatSendFlightChannel(resolvedThreadId)
  const composerSurfaceRef = useRef<View>(null)
  // CHT-05: my own message is always shown, even when I had scrolled up.
  // The send is published first; the flight (composer → new bubble) only
  // decorates it, and is skipped while the list scrolls back from history.
  const handleSend = useCallback((draft: string): boolean => {
    const accepted = sendMessage(draft)
    if (!accepted) return false
    if (!isScrolledAway) {
      launchChatSendFlight({
        composerSurface: composerSurfaceRef.current,
        channel: sendFlightChannel,
        match: normalizeOutgoingChatBody(draft),
        text: draft.trim()
      })
    }
    scrollToLatest()
    return true
  }, [isScrolledAway, scrollToLatest, sendFlightChannel, sendMessage])

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
          isArrival={arrivedRowKeys.has(getChatTimelineItemKey(item))}
          sendFlightChannel={sendFlightChannel}
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
      arrivedRowKeys,
      sendFlightChannel,
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

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <ChatNotificationPermissionCard key={currentUserId} userId={currentUserId}
            mode={sessionActor.session.mode} isFocused={isFocused} locale={chatLocale}
            registration={props.pushRegistration} />
          {showsTimelineEmptyState ? (
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
          ) : (
            <View style={styles.flex}>
            <Animated.FlatList
              ref={scrollToLatestState.listRef}
              data={newestFirstTimeline}
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
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
              ListFooterComponent={
                sessionActor.session.mode === "production" && messages.length > 0 ? (
                  <ChatLoadEarlierButton
                    chatCopy={chatCopy}
                    isLoadingEarlier={isLoadingEarlier}
                    onPress={handleLoadEarlier}
                  />
                ) : null
              }
              renderItem={renderTimelineRow}
            />
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
            onSend={handleSend}
            surfaceRef={composerSurfaceRef}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
