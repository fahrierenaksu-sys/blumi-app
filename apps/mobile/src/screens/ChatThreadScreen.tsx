import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useChatThreadStore } from "../features/chat/chatStore"
import { createThread } from "../features/chat/chatApi"
import { createMatchedChatOpener } from "../features/chat/matchChatOpening"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { ReportModal } from "../components/ReportModal"
import { SoftBlobBackground } from "../ui/backgrounds"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { hapticLight } from "../ui/haptics"
import type { SessionActor } from "../features/session/sessionModel"
import type { ChatThread } from "@blumi/contracts"
import { captureProductEvent } from "../analytics/productAnalytics"
import { createMatchFromPersistedThread } from "../features/matches/matchRoomModel"
import { RoomInviteApiError } from "../features/chat/chatRoomInviteApi"
import {
  buildChatTimeline,
  getChatTimelineItemKey,
  getChatInitialRenderCount,
  type ChatRoomInviteAction,
  type ChatRoomInviteSurface,
  type ChatRoomInviteTimelineItem
} from "../features/chat/chatRoomInviteModel"
import {
  CHAT_COPY,
  resolveChatThreadLocale
} from "../features/chat/thread/chatThreadCopy"
import {
  getChatTimelineRowModel,
  getRoomInviteActionKey
} from "../features/chat/thread/chatThreadModel"
import { ChatComposer } from "../features/chat/thread/ChatComposer"
import { ChatLoadEarlierButton } from "../features/chat/thread/ChatLoadEarlierButton"
import { ChatThreadEmptyState } from "../features/chat/thread/ChatThreadEmptyState"
import { ChatThreadHeader } from "../features/chat/thread/ChatThreadHeader"
import { ChatTimelineRow } from "../features/chat/thread/ChatTimelineRow"
import { styles } from "../features/chat/thread/chatThreadStyles"

type ChatThreadScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ChatThread"
> & {
  sessionActor: SessionActor
  onThreadCreated: (thread: ChatThread) => void
}

const EMPTY_ROOM_INVITES: readonly ChatRoomInviteTimelineItem[] = []

export function ChatThreadScreen(props: ChatThreadScreenProps) {
  const { navigation, route, sessionActor, onThreadCreated } = props
  const { height: windowHeight } = useWindowDimensions()
  const initialMessageRenderCount = getChatInitialRenderCount(windowHeight)
  const { threadId, partnerId: pendingPartnerId, partnerName: pendingPartnerName } = route.params
  const {
    thread,
    messages,
    messageListState,
    historyReady,
    addOptimisticMessage,
    getMessageDeliveryState,
    getRetryableMessage,
    markOptimisticMessageSending,
    setActiveThread
  } = useChatThreadStore(threadId, pendingPartnerId)
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false)
  const [isCreatingPendingThread, setIsCreatingPendingThread] = useState(false)
  const [pendingThreadCreationFailed, setPendingThreadCreationFailed] = useState(false)
  const [reportVisible, setReportVisible] = useState(false)
  const [activeRoomInviteAction, setActiveRoomInviteAction] = useState<string | null>(null)
  const pendingThreadRequestRef = useRef<{ key: string; inFlight: boolean }>({
    key: "",
    inFlight: false
  })
  const automaticAttemptKeyRef = useRef("")
  const screenMountedRef = useRef(true)
  const activeUserIdRef = useRef(sessionActor.profile.userId)
  activeUserIdRef.current = sessionActor.profile.userId

  const resolvedThreadId = thread?.threadId ?? threadId
  const isPendingThread = !thread && !!pendingPartnerId
  const roomInviteSurface = route.params as typeof route.params & ChatRoomInviteSurface
  const roomInvites = roomInviteSurface.roomInvites ?? EMPTY_ROOM_INVITES
  const roomInviteActionHandler = roomInviteSurface.onRoomInviteAction
  const closeActiveRoomHandler = roomInviteSurface.onCloseActiveRoom
  const chatLocale = resolveChatThreadLocale(roomInviteSurface.locale)
  const chatCopy = CHAT_COPY[chatLocale]
  const threadRoomInvites = useMemo(
    () =>
      resolvedThreadId
        ? roomInvites.filter((invite) => invite.threadId === resolvedThreadId)
        : EMPTY_ROOM_INVITES,
    [resolvedThreadId, roomInvites]
  )
  const timeline = useMemo(
    () => buildChatTimeline(messages, threadRoomInvites),
    [messages, threadRoomInvites]
  )
  // Inverted FlatList starts at offset zero with the newest message visible.
  // The chronological timeline remains the authority for grouping and dates.
  const newestFirstTimeline = useMemo(() => [...timeline].reverse(), [timeline])
  // Do not mount a one-invitation list before the first history page arrives:
  // otherwise FlatList has already spent its initial render on that lone row.
  const awaitingInitialHistory = sessionActor.session.mode === "production" &&
    !historyReady

  const currentUserId = sessionActor.profile.userId
  const matchedThreadOpener = useMemo(() => {
    if (!pendingPartnerId || sessionActor.session.mode !== "production") return null
    return createMatchedChatOpener({
      createThread: () => createThread(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { participantUserIds: [currentUserId, pendingPartnerId] }
      ),
      onThreadReady: (createdThread) => {
        if (
          !createdThread.participantUserIds.includes(currentUserId) ||
          !createdThread.participantUserIds.includes(pendingPartnerId)
        ) {
          throw new Error("That conversation is not available.")
        }
        if (
          screenMountedRef.current &&
          activeUserIdRef.current === currentUserId
        ) {
          onThreadCreated(createdThread)
        }
      }
    })
  }, [
    currentUserId,
    onThreadCreated,
    pendingPartnerId,
    sessionActor.session.mode,
    sessionActor.session.sessionToken
  ])

  const openPendingMatchedThread = useCallback(async (): Promise<void> => {
    if (!isPendingThread || !pendingPartnerId || !matchedThreadOpener) return
    const requestKey = `${currentUserId}:${pendingPartnerId}`
    if (
      pendingThreadRequestRef.current.key === requestKey &&
      pendingThreadRequestRef.current.inFlight
    ) return
    pendingThreadRequestRef.current = { key: requestKey, inFlight: true }
    if (screenMountedRef.current) {
      setPendingThreadCreationFailed(false)
      setIsCreatingPendingThread(true)
    }
    try {
      const result = await matchedThreadOpener()
      if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
        setPendingThreadCreationFailed(result.status === "failed")
      }
    } finally {
      if (pendingThreadRequestRef.current.key === requestKey) {
        pendingThreadRequestRef.current = { key: requestKey, inFlight: false }
      }
      if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
        setIsCreatingPendingThread(false)
      }
    }
  }, [currentUserId, isPendingThread, matchedThreadOpener, pendingPartnerId])

  const partnerSummary = useMemo(() => {
    if (!thread) return null
    return (
      thread.participants.find((p) => p.userId !== currentUserId) ??
      thread.participants[0] ??
      null
    )
  }, [currentUserId, thread])

  const partnerName = partnerSummary?.displayName ?? pendingPartnerName ?? chatCopy.unknownPartner
  const partnerUserId = partnerSummary?.userId ?? pendingPartnerId ?? ""
  const partnerAvatar = partnerSummary?.avatar
  const persistedMatch = useMemo(
    () => thread && sessionActor.session.mode === "production"
      ? createMatchFromPersistedThread(thread, currentUserId)
      : null,
    [currentUserId, sessionActor.session.mode, thread]
  )

  useEffect(() => {
    screenMountedRef.current = true
    return () => { screenMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!isPendingThread || sessionActor.session.mode !== "production" || !pendingPartnerId) return
    const requestKey = `${currentUserId}:${pendingPartnerId}`
    if (automaticAttemptKeyRef.current === requestKey) return
    automaticAttemptKeyRef.current = requestKey
    void openPendingMatchedThread()
  }, [
    currentUserId,
    isPendingThread,
    openPendingMatchedThread,
    pendingPartnerId,
    sessionActor.session.mode
  ])

  // Request messages from server when entering thread
  useEffect(() => {
    const requestMessages = route.params.requestMessages
    if (requestMessages && resolvedThreadId) {
      void requestMessages(resolvedThreadId).catch(() => undefined)
    }
  }, [route.params.requestMessages, resolvedThreadId])

  const handleRetryMessages = useCallback((): void => {
    const requestMessages = route.params.requestMessages
    if (!requestMessages || !resolvedThreadId) return
    void requestMessages(resolvedThreadId).catch(() => undefined)
  }, [resolvedThreadId, route.params.requestMessages])

  useEffect(() => {
    const markThreadRead = route.params.markThreadRead
    if (markThreadRead && resolvedThreadId) {
      markThreadRead(resolvedThreadId)
    }
  }, [route.params.markThreadRead, resolvedThreadId])

  // Mark thread as active for unread tracking
  useEffect(() => {
    if (resolvedThreadId) {
      setActiveThread(resolvedThreadId)
    }
    return () => setActiveThread(null)
  }, [resolvedThreadId, setActiveThread])

  const handleSend = useCallback((body: string): boolean => {
    const sendChatMessage = route.params.sendChatMessage
    if (!resolvedThreadId || !currentUserId || !sendChatMessage) return false

    const pending = addOptimisticMessage({
      threadId: resolvedThreadId,
      senderUserId: currentUserId,
      body,
      trackDelivery: sessionActor.session.mode === "production"
    })

    void sendChatMessage(resolvedThreadId, body, pending.clientMessageId).catch(() => undefined)
    captureProductEvent("chat_message_sent", {
      mode: sessionActor.session.mode,
      kind: "text"
    })
    hapticLight()
    return true
  }, [addOptimisticMessage, currentUserId, route.params.sendChatMessage, resolvedThreadId, sessionActor.session.mode])

  const handleRetry = useCallback((messageId: string): void => {
    const retryable = getRetryableMessage(messageId)
    const sendChatMessage = route.params.sendChatMessage
    if (!retryable || !sendChatMessage) return
    markOptimisticMessageSending(retryable.clientMessageId)
    void sendChatMessage(
      retryable.threadId,
      retryable.body,
      retryable.clientMessageId
    ).catch(() => undefined)
  }, [getRetryableMessage, markOptimisticMessageSending, route.params.sendChatMessage])

  const handleLoadEarlier = useCallback(async (): Promise<void> => {
    const requestMessages = route.params.requestMessages
    const before = messages[0]?.messageId
    if (!requestMessages || !resolvedThreadId || !before || isLoadingEarlier) {
      return
    }
    setIsLoadingEarlier(true)
    try {
      await requestMessages(resolvedThreadId, { before, limit: 20 })
    } finally {
      setIsLoadingEarlier(false)
    }
  }, [
    isLoadingEarlier,
    messages,
    resolvedThreadId,
    route.params.requestMessages
  ])

  const handleRoomInviteAction = useCallback(
    (action: ChatRoomInviteAction, onError?: (error: unknown) => void): void => {
      if (!roomInviteActionHandler) return

      const actionKey = getRoomInviteActionKey(action)
      setActiveRoomInviteAction(actionKey)
      hapticLight()
      void roomInviteActionHandler(action)
        .catch((error: unknown) => { onError?.(error) })
        .finally(() => {
          setActiveRoomInviteAction((current) =>
            current === actionKey ? null : current
          )
        })
    },
    [roomInviteActionHandler]
  )

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

  const canCreateRoomInvite = Boolean(
    resolvedThreadId &&
      !isPendingThread &&
      roomInviteActionHandler &&
      !threadRoomInvites.some((invite) => invite.status === "pending")
  )
  const createRoomInviteAction = resolvedThreadId
    ? { type: "create" as const, threadId: resolvedThreadId }
    : null
  const isCreatingRoomInvite = createRoomInviteAction
    ? activeRoomInviteAction === getRoomInviteActionKey(createRoomInviteAction)
    : false
  const roomInviteDisabledReason = isPendingThread || !resolvedThreadId
    ? chatCopy.roomInviteConversationReason
    : threadRoomInvites.some((invite) => invite.status === "pending")
      ? chatCopy.roomInvitePendingReason
      : !roomInviteActionHandler
        ? chatCopy.roomInviteUnavailableReason
        : null

  const handleRoomInvitePress = (): void => {
    if (isCreatingRoomInvite) return
    if (!canCreateRoomInvite || !createRoomInviteAction) {
      Alert.alert(
        chatCopy.roomInviteUnavailableTitle,
        roomInviteDisabledReason ?? chatCopy.roomInviteUnavailableReason
      )
      return
    }
    const retryInvite = roomInviteActionHandler
    if (!retryInvite) return
    handleRoomInviteAction(createRoomInviteAction, (error) => {
      if (!(error instanceof RoomInviteApiError) || error.code !== "SELF_IN_ROOM") return
      if (!closeActiveRoomHandler || !error.roomSessionId) {
        Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteCloseFailed)
        return
      }
      const previousRoomId = error.roomSessionId
      Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteClosePreviousBody, [
        { text: chatCopy.cancel, style: "cancel" },
        {
          text: chatCopy.roomInviteClosePreviousAction,
          onPress: () => {
            const action = createRoomInviteAction
            const actionKey = getRoomInviteActionKey(action)
            const currentUserId = sessionActor.profile.userId
            setActiveRoomInviteAction(actionKey)
            void (async () => {
              try {
                await closeActiveRoomHandler(previousRoomId)
              } catch {
                if (!screenMountedRef.current || activeUserIdRef.current !== currentUserId) return
                Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteCloseFailed)
                return
              }
              if (!screenMountedRef.current || activeUserIdRef.current !== currentUserId) return
              try {
                await retryInvite(action)
              } catch {
                if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
                  Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteRetryFailed)
                }
              }
            })().finally(() => {
              if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
                setActiveRoomInviteAction((current) => current === actionKey ? null : current)
              }
            })
          }
        }
      ])
    })
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
            ? () => navigation.navigate("MatchResult", { match: persistedMatch })
            : null}
          onOpenSafety={() => setReportVisible(true)}
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
          {timeline.length === 0 || isPendingThread || awaitingInitialHistory ? (
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
            <FlatList
              data={newestFirstTimeline}
              inverted
              initialNumToRender={initialMessageRenderCount}
              keyExtractor={getChatTimelineItemKey}
              style={styles.messageListContainer}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}
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
              renderItem={({ item, index }) => (
                <ChatTimelineRow
                  item={item}
                  row={getChatTimelineRowModel({
                    item,
                    index,
                    timeline,
                    currentUserId,
                    getMessageDeliveryState,
                    locale: chatLocale
                  })}
                  chatCopy={chatCopy}
                  chatLocale={chatLocale}
                  currentUserId={currentUserId}
                  activeRoomInviteAction={activeRoomInviteAction}
                  onRoomInviteAction={roomInviteActionHandler ? handleRoomInviteAction : undefined}
                  onRetry={handleRetry}
                />
              )}
            />
          )}

          <ChatComposer
            chatCopy={chatCopy}
            partnerName={partnerName}
            chatLocale={chatLocale}
            isPendingThread={isPendingThread}
            canCreateRoomInvite={canCreateRoomInvite}
            isCreatingRoomInvite={isCreatingRoomInvite}
            roomInviteDisabledReason={roomInviteDisabledReason}
            onRoomInvitePress={handleRoomInvitePress}
            onSend={handleSend}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
