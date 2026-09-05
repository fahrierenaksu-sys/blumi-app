import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useChatStore } from "../features/chat/chatStore"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { ReportModal } from "../components/ReportModal"
import { ParticipantAvatar } from "../ui/participantAvatar"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { hapticLight } from "../ui/haptics"
import { useEntranceAnimation, useReducedMotion } from "../ui/animations"
import type { SessionActor } from "../features/session/sessionModel"
import { captureProductEvent } from "../analytics/productAnalytics"
import { ChatRoomInviteCard } from "../features/chat/ChatRoomInviteCard"
import {
  buildChatTimeline,
  getChatMessageGroupPosition,
  getChatTimelineItemKey,
  getRoomInviteCreateLabel,
  type ChatRoomInviteAction,
  type ChatRoomInviteSurface,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../features/chat/chatRoomInviteModel"

type ChatThreadScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ChatThread"
> & {
  sessionActor: SessionActor
}

const EMPTY_ROOM_INVITES: readonly ChatRoomInviteTimelineItem[] = []

const CHAT_COPY: Record<"en" | "tr", {
  chat: string
  back: string
  unknownPartner: string
  pendingConversation: string
  openingChat: string
  gettingReady: string
  startSpark: string
  startSparkDetail: string
  sending: string
  notSent: string
  tryAgain: string
  loadEarlier: string
  loading: string
  loadFailed: string
  retryLoading: string
  messagePlaceholder: string
  messageAccessibilityLabel: (partnerName: string) => string
  sendAccessibilityLabel: (partnerName: string) => string
  safetyAccessibilityLabel: (partnerName: string) => string
  roomInviteUnavailableTitle: string
  roomInvitePendingReason: string
  roomInviteConversationReason: string
  roomInviteUnavailableReason: string
  today: string
  yesterday: string
}> = {
  en: {
    chat: "Chat",
    back: "Go back",
    unknownPartner: "Someone",
    pendingConversation: "This conversation is still getting ready.",
    openingChat: "Opening your chat...",
    gettingReady: "Getting the conversation ready.",
    startSpark: "Start with a spark",
    startSparkDetail: "Send a spark and keep the conversation going.",
    sending: "Sending…",
    notSent: "Not sent",
    tryAgain: "Try again",
    loadEarlier: "Load earlier",
    loading: "Loading...",
    loadFailed: "This conversation could not open.",
    retryLoading: "Try loading again",
    messagePlaceholder: "Message…",
    messageAccessibilityLabel: (partnerName) => `Message ${partnerName}`,
    sendAccessibilityLabel: (partnerName) => `Send message to ${partnerName}`,
    safetyAccessibilityLabel: (partnerName) => `Safety options for ${partnerName}`,
    roomInviteUnavailableTitle: "Room invitation unavailable",
    roomInvitePendingReason: "There is already a room invitation waiting for a response.",
    roomInviteConversationReason: "Wait until this conversation is ready.",
    roomInviteUnavailableReason: "Room invitations are not available in this chat yet.",
    today: "Today",
    yesterday: "Yesterday"
  },
  tr: {
    chat: "Sohbet",
    back: "Geri dön",
    unknownPartner: "Biri",
    pendingConversation: "Bu sohbet hâlâ hazırlanıyor.",
    openingChat: "Sohbetin hazırlanıyor...",
    gettingReady: "Sohbet hazırlanıyor.",
    startSpark: "Bir kıvılcımla başla",
    startSparkDetail: "Bir mesaj gönder, sohbeti kendi hızında ilerlet.",
    sending: "Gönderiliyor…",
    notSent: "Gönderilemedi",
    tryAgain: "Tekrar dene",
    loadEarlier: "Önceki mesajları yükle",
    loading: "Yükleniyor...",
    loadFailed: "Bu sohbet açılamadı.",
    retryLoading: "Tekrar yükle",
    messagePlaceholder: "Mesaj yaz…",
    messageAccessibilityLabel: (partnerName) => `${partnerName} için mesaj yaz`,
    sendAccessibilityLabel: (partnerName) => `${partnerName} kişisine mesaj gönder`,
    safetyAccessibilityLabel: (partnerName) => `${partnerName} için güvenlik seçenekleri`,
    roomInviteUnavailableTitle: "Oda daveti kullanılamıyor",
    roomInvitePendingReason: "Bu sohbette zaten yanıt bekleyen bir oda daveti var.",
    roomInviteConversationReason: "Bu sohbet hazır olana kadar bekle.",
    roomInviteUnavailableReason: "Oda davetleri bu sohbette henüz kullanılamıyor.",
    today: "Bugün",
    yesterday: "Dün"
  }
}

function formatMessageTime(isoDate: string): string {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ""
  const hours = d.getHours().toString().padStart(2, "0")
  const mins = d.getMinutes().toString().padStart(2, "0")
  return `${hours}:${mins}`
}

function formatDateSeparator(date: Date, locale: "en" | "tr"): string {
  const now = new Date()
  const today = now.toDateString()
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString()
  const ds = date.toDateString()
  if (ds === today) return CHAT_COPY[locale].today
  if (ds === yesterday) return CHAT_COPY[locale].yesterday
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    month: "short",
    day: "numeric"
  }).format(date)
}

function MessageBubbleAnimated({ children, index }: { children: ReactNode; index: number }) {
  const anim = useEntranceAnimation({ delay: Math.min(index * 40, 400), duration: 300, translateY: 12 })
  return <Animated.View style={anim}>{children}</Animated.View>
}

function getRoomInviteActionKey(action: ChatRoomInviteAction): string {
  switch (action.type) {
    case "create":
      return `create:${action.threadId}`
    case "open_room":
      return `${action.type}:${action.inviteId}:${action.roomSessionId}`
    default:
      return `${action.type}:${action.inviteId}`
  }
}

export function ChatThreadScreen(props: ChatThreadScreenProps) {
  const { navigation, route, sessionActor } = props
  const { threadId, partnerId: pendingPartnerId, partnerName: pendingPartnerName } = route.params
  const {
    threads,
    getMessages,
    getMessageListState,
    findThreadForPartner,
    addOptimisticMessage,
    getMessageDeliveryState,
    getRetryableMessage,
    markOptimisticMessageSending,
    setActiveThread
  } = useChatStore()
  const [inputText, setInputText] = useState("")
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false)
  const messageListRef = useRef<FlatList<ChatTimelineItem>>(null)
  const preserveScrollOnNextHistoryLoadRef = useRef(false)
  const newestMessageIdRef = useRef<string | undefined>(undefined)
  const [reportVisible, setReportVisible] = useState(false)
  const [activeRoomInviteAction, setActiveRoomInviteAction] = useState<string | null>(null)
  const sendScaleAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()
  const headerAnim = useEntranceAnimation({ delay: 0, translateY: 16 })

  const thread = useMemo(() => {
    if (threadId) return threads.find((t) => t.threadId === threadId)
    if (pendingPartnerId) return findThreadForPartner(pendingPartnerId)
    return undefined
  }, [threadId, pendingPartnerId, threads, findThreadForPartner])

  const resolvedThreadId = thread?.threadId ?? threadId
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  const messages = resolvedThreadId ? getMessages(resolvedThreadId) : []
  const messageListState = resolvedThreadId
    ? getMessageListState(resolvedThreadId)
    : { status: "idle" as const }
  const roomInviteSurface = route.params as typeof route.params & ChatRoomInviteSurface
  const roomInvites = roomInviteSurface.roomInvites ?? EMPTY_ROOM_INVITES
  const roomInviteActionHandler = roomInviteSurface.onRoomInviteAction
  const chatLocale = roomInviteSurface.locale ?? (
    Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("tr")
      ? "tr"
      : "en"
  )
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

  const currentUserId = sessionActor.profile.userId

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

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      const newestMessageId = messages[messages.length - 1]?.messageId
      const isHistoryPrepend =
        preserveScrollOnNextHistoryLoadRef.current &&
        newestMessageId === newestMessageIdRef.current
      newestMessageIdRef.current = newestMessageId
      if (isHistoryPrepend) return
      preserveScrollOnNextHistoryLoadRef.current = false
      const timer = setTimeout(() => {
        messageListRef.current?.scrollToEnd({ animated: true })
      }, 80)
      return () => clearTimeout(timer)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [messages.length])

  // Mark thread as active for unread tracking
  useEffect(() => {
    if (resolvedThreadId) {
      setActiveThread(resolvedThreadId)
    }
    return () => setActiveThread(null)
  }, [resolvedThreadId, setActiveThread])

  const handleSend = useCallback(() => {
    const body = inputText.trim()
    if (!body || !resolvedThreadId) return

    const pending = currentUserId
      ? addOptimisticMessage({
        threadId: resolvedThreadId,
        senderUserId: currentUserId,
        body,
        trackDelivery: sessionActor.session.mode === "production"
      })
      : null

    const sendChatMessage = route.params.sendChatMessage
    if (sendChatMessage && pending) {
      void sendChatMessage(resolvedThreadId, body, pending.clientMessageId).catch(() => undefined)
    }
    captureProductEvent("chat_message_sent", {
      mode: sessionActor.session.mode,
      kind: "text"
    })
    setInputText("")
    hapticLight()
  }, [addOptimisticMessage, currentUserId, inputText, route.params.sendChatMessage, resolvedThreadId, sessionActor.session.mode])

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
    preserveScrollOnNextHistoryLoadRef.current = true
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
    (action: ChatRoomInviteAction): void => {
      if (!roomInviteActionHandler) return

      const actionKey = getRoomInviteActionKey(action)
      setActiveRoomInviteAction(actionKey)
      hapticLight()
      void roomInviteActionHandler(action)
        .catch(() => undefined)
        .finally(() => {
          setActiveRoomInviteAction((current) =>
            current === actionKey ? null : current
          )
        })
    },
    [roomInviteActionHandler]
  )

  const handleSendPressIn = () => {
    sendScaleAnim.stopAnimation()
    if (reduceMotion) {
      sendScaleAnim.setValue(1)
      return
    }
    Animated.spring(sendScaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handleSendPressOut = () => {
    sendScaleAnim.stopAnimation()
    if (reduceMotion) {
      sendScaleAnim.setValue(1)
      return
    }
    Animated.spring(sendScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
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
              <ActionButtonCircle accessibilityLabel={chatCopy.back} onPress={() => navigation.goBack()} size={40}>
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

  const isPendingThread = !thread && !!pendingPartnerId
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
    handleRoomInviteAction(createRoomInviteAction)
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right"]}>
        <Animated.View style={[styles.chatHeader, headerAnim]}>
          <ActionButtonCircle accessibilityLabel={chatCopy.back} onPress={() => navigation.goBack()} size={40}>
            <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
          </ActionButtonCircle>
          <ParticipantAvatar
            name={partnerName}
            seed={partnerUserId || partnerName}
            avatar={partnerAvatar}
            size={44}
            ring="soft"
          />
          <View style={styles.chatHeaderCopy}>
            <Text numberOfLines={1} style={styles.chatHeaderName}>{partnerName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chatCopy.safetyAccessibilityLabel(partnerName)}
            onPress={() => setReportVisible(true)}
            hitSlop={8}
            style={styles.moreButton}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={uiTheme.colors.textSecondary} />
          </Pressable>
        </Animated.View>

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
          {timeline.length === 0 || isPendingThread ? (
            <View style={styles.emptyChat}>
              <View style={styles.emptyChatGlow} pointerEvents="none" />
              {messageListState.status === "failed" && !isPendingThread ? (
                <View accessibilityRole="alert" style={styles.messageLoadState}>
                  <Ionicons
                    name="cloud-offline-outline"
                    size={34}
                    color={uiTheme.colors.primaryDeep}
                  />
                  <Text style={styles.emptyChatTitle}>{chatCopy.loadFailed}</Text>
                  <Text style={styles.emptyChatBody}>
                    {messageListState.errorMessage}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={chatCopy.retryLoading}
                    onPress={handleRetryMessages}
                    style={({ pressed }) => [
                      styles.retryMessagesButton,
                      pressed ? styles.retryMessagesButtonPressed : null
                    ]}
                  >
                    <Ionicons
                      name="refresh"
                      size={18}
                      color={uiTheme.colors.primaryDeep}
                    />
                    <Text style={styles.retryMessagesText}>
                      {chatCopy.retryLoading}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ParticipantAvatar
                    name={partnerName}
                    seed={partnerUserId || partnerName}
                    avatar={partnerAvatar}
                    size={80}
                    ring="soft"
                  />
                  <Text style={styles.emptyChatTitle}>
                    {isPendingThread || messageListState.status !== "ready"
                      ? chatCopy.openingChat
                      : chatCopy.startSpark}
                  </Text>
                  <Text style={styles.emptyChatBody}>
                    {isPendingThread || messageListState.status !== "ready"
                      ? chatCopy.gettingReady
                      : chatCopy.startSparkDetail}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <FlatList
              ref={messageListRef}
              data={timeline}
              keyExtractor={getChatTimelineItemKey}
              style={styles.messageListContainer}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              ListHeaderComponent={
                sessionActor.session.mode === "production" && timeline.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={chatCopy.loadEarlier}
                    accessibilityState={{ disabled: isLoadingEarlier }}
                    onPress={handleLoadEarlier}
                    disabled={isLoadingEarlier}
                    style={({ pressed }) => [
                      styles.loadEarlierButton,
                      pressed ? styles.loadEarlierButtonPressed : null,
                      isLoadingEarlier ? styles.loadEarlierButtonDisabled : null
                    ]}
                  >
                    <Text style={styles.loadEarlierText}>
                      {isLoadingEarlier ? chatCopy.loading : chatCopy.loadEarlier}
                    </Text>
                  </Pressable>
                ) : null
              }
              onContentSizeChange={() => {
                if (preserveScrollOnNextHistoryLoadRef.current) {
                  preserveScrollOnNextHistoryLoadRef.current = false
                  return
                }
                messageListRef.current?.scrollToEnd({ animated: true })
              }}
              renderItem={({ item, index }) => {
                const isRoomInvite = item.kind === "room_invite"
                const isMe = isRoomInvite
                  ? item.senderUserId === currentUserId
                  : item.message.senderUserId === currentUserId
                const isOptimistic =
                  item.kind === "message" && item.message.messageId.startsWith("__local_")
                const deliveryState = item.kind === "message"
                  ? getMessageDeliveryState(item.message.messageId)
                  : "sent"
                const groupPosition = item.kind === "message"
                  ? getChatMessageGroupPosition(timeline, index)
                  : "single"
                const closesGroup = groupPosition === "single" || groupPosition === "last"

                // Day separator
                const itemDate = new Date(item.createdAt)
                const previousItem = index > 0 ? timeline[index - 1] : null
                const prevDate = previousItem ? new Date(previousItem.createdAt) : null
                const showDateSep =
                  !prevDate ||
                  itemDate.toDateString() !== prevDate.toDateString()
                const dateLabel = showDateSep ? formatDateSeparator(itemDate, chatLocale) : null

                return (
                  <MessageBubbleAnimated key={getChatTimelineItemKey(item)} index={index}>
                    {dateLabel ? (
                      <View style={bubbleStyles.dateSep}>
                        <View style={bubbleStyles.dateSepPill}>
                          <Text style={bubbleStyles.dateSepText}>{dateLabel}</Text>
                        </View>
                      </View>
                    ) : null}
                    <View
                      style={[
                        bubbleStyles.row,
                        isMe ? bubbleStyles.rowMe : bubbleStyles.rowThem,
                        closesGroup ? bubbleStyles.rowGroupEnd : bubbleStyles.rowGroupInner,
                        isOptimistic ? { opacity: 0.65 } : null
                      ]}
                    >
                    {isRoomInvite ? (
                      <ChatRoomInviteCard
                        invite={item}
                        currentUserId={currentUserId}
                        locale={chatLocale}
                        isBusy={
                          activeRoomInviteAction !== null &&
                          activeRoomInviteAction.includes(item.inviteId)
                        }
                        onAction={roomInviteActionHandler ? handleRoomInviteAction : undefined}
                      />
                    ) : (
                      <View
                        style={[
                          bubbleStyles.bubble,
                          isMe ? bubbleStyles.bubbleMe : bubbleStyles.bubbleThem,
                          isMe
                            ? bubbleGroupStyles.me[groupPosition]
                            : bubbleGroupStyles.them[groupPosition]
                        ]}
                      >
                        {closesGroup ? (
                          <View
                            pointerEvents="none"
                            style={[
                              bubbleStyles.tail,
                              isMe ? bubbleStyles.tailMe : bubbleStyles.tailThem
                            ]}
                          />
                        ) : null}
                        <View style={bubbleStyles.contentRow}>
                          <Text
                            style={[
                              bubbleStyles.body,
                              isMe ? bubbleStyles.bodyMe : null
                            ]}
                          >
                            {item.message.body}
                          </Text>
                          <View style={bubbleStyles.metadataRow}>
                            <Text
                              style={[
                                bubbleStyles.time,
                                isMe ? bubbleStyles.timeMe : null
                              ]}
                            >
                              {formatMessageTime(item.message.sentAt)}
                            </Text>
                            {isMe && deliveryState === "sent" ? (
                              <Ionicons name="checkmark" size={14} color="#C4537C" />
                            ) : null}
                          </View>
                        </View>
                        {isMe && deliveryState !== "sent" ? (
                          deliveryState === "failed" ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={chatCopy.tryAgain}
                              onPress={() => handleRetry(item.message.messageId)}
                            >
                              <Text style={[bubbleStyles.time, bubbleStyles.timeMe, { marginTop: 3, textDecorationLine: "underline" }]}>
                                {chatCopy.notSent} · {chatCopy.tryAgain}
                              </Text>
                            </Pressable>
                          ) : (
                            <Text style={[bubbleStyles.time, bubbleStyles.timeMe, { marginTop: 3 }]}>
                              {chatCopy.sending}
                            </Text>
                          )
                        ) : null}
                      </View>
                    )}
                    </View>
                  </MessageBubbleAnimated>
                )
              }}
            />
          )}

          <SafeAreaView contentGutter={false} edges={["bottom"]} style={styles.composerSafe}>
            <View style={styles.composer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={getRoomInviteCreateLabel(chatLocale)}
                accessibilityHint={roomInviteDisabledReason ?? undefined}
                accessibilityState={{
                  busy: isCreatingRoomInvite,
                  disabled: isCreatingRoomInvite
                }}
                disabled={isCreatingRoomInvite}
                onPress={handleRoomInvitePress}
                style={({ pressed }) => [
                  styles.roomInviteButton,
                  pressed ? styles.roomInviteButtonPressed : null,
                  !canCreateRoomInvite || isCreatingRoomInvite
                    ? styles.roomInviteButtonDisabled
                    : null
                ]}
              >
                <Ionicons name="home-outline" size={20} color={uiTheme.colors.primaryDeep} />
              </Pressable>
              <View style={styles.inputWrap}>
                <TextInput
                  accessibilityLabel={chatCopy.messageAccessibilityLabel(partnerName)}
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={chatCopy.messagePlaceholder}
                  placeholderTextColor={uiTheme.colors.textMuted}
                  multiline
                  maxLength={500}
                />
              </View>
              <Animated.View style={{ transform: [{ scale: sendScaleAnim }] }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={chatCopy.sendAccessibilityLabel(partnerName)}
                  accessibilityState={{
                    disabled: inputText.trim().length === 0 || isPendingThread
                  }}
                  onPress={handleSend}
                  onPressIn={handleSendPressIn}
                  onPressOut={handleSendPressOut}
                  disabled={inputText.trim().length === 0 || isPendingThread}
                  style={({ pressed }) => [
                    styles.sendButton,
                    (inputText.trim().length === 0 || isPendingThread)
                      ? styles.sendButtonDisabled
                      : null,
                    pressed ? styles.sendButtonPressed : null
                  ]}
                >
                  <LinearGradient
                    colors={
                      inputText.trim().length === 0 || isPendingThread
                        ? [uiTheme.colors.primaryDisabled, uiTheme.colors.primaryDisabled]
                        : uiTheme.gradients.primary as [string, string]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendButtonGradient}
                  >
                    <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
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
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.sm,
  },
  flex: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    minHeight: 56,
    paddingBottom: uiTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(53, 27, 50, 0.08)"
  },
  chatHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  chatHeaderName: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800"
  },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  messageListContainer: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: uiTheme.spacing.md,
    paddingHorizontal: 4
  },
  loadEarlierButton: {
    alignSelf: "center",
    minHeight: 34,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    marginBottom: uiTheme.spacing.sm,
  },
  loadEarlierButtonPressed: {
    opacity: 0.82,
  },
  loadEarlierButtonDisabled: {
    opacity: 0.55,
  },
  loadEarlierText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textMuted,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: uiTheme.spacing.xl,
  },
  emptyText: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.xxxl,
    position: "relative",
  },
  emptyChatGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: uiTheme.colors.accentGlow,
  },
  emptyChatTitle: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    marginTop: uiTheme.spacing.sm,
  },
  emptyChatBody: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
  },
  messageLoadState: {
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    maxWidth: 320,
  },
  retryMessagesButton: {
    minHeight: 44,
    marginTop: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
  },
  retryMessagesButtonPressed: {
    opacity: 0.82,
  },
  retryMessagesText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.primaryDeep,
  },
  composerSafe: {
    backgroundColor: "transparent",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: uiTheme.spacing.xs,
    paddingVertical: uiTheme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: uiTheme.colors.border,
  },
  inputWrap: {
    flex: 1,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glassStrong,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    overflow: "hidden",
  },
  roomInviteButton: {
    alignItems: "center",
    backgroundColor: uiTheme.colors.primarySoft,
    borderColor: "rgba(255, 79, 152, 0.22)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  roomInviteButtonPressed: {
    backgroundColor: "#FFD3E5"
  },
  roomInviteButtonDisabled: {
    opacity: uiTheme.opacity.disabled
  },
  input: {
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    ...uiTheme.shadow.glowSubtle,
  },
  sendButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonPressed: {
    opacity: 0.9,
  },
})

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  rowGroupInner: {
    marginBottom: 4
  },
  rowGroupEnd: {
    marginBottom: 16
  },
  rowMe: {
    justifyContent: "flex-end",
  },
  rowThem: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    position: "relative"
  },
  bubbleMe: {
    backgroundColor: "#F6E7EB",
    borderColor: "#E8D7DD"
  },
  bubbleThem: {
    backgroundColor: "#FFFDFC",
    borderColor: "#EEE5E8"
  },
  bubbleMefirst: {
    borderBottomRightRadius: 6
  },
  bubbleMemiddle: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6
  },
  bubbleMelast: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 5
  },
  bubbleMesingle: {
    borderBottomRightRadius: 5
  },
  bubbleThemfirst: {
    borderBottomLeftRadius: 6
  },
  bubbleThemmiddle: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6
  },
  bubbleThemlast: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 5
  },
  bubbleThemsingle: {
    borderBottomLeftRadius: 5
  },
  tail: {
    position: "absolute",
    bottom: 1,
    width: 10,
    height: 10,
    transform: [{ rotate: "45deg" }]
  },
  tailMe: {
    right: -4,
    backgroundColor: "#F6E7EB",
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: "#E8D7DD"
  },
  tailThem: {
    left: -4,
    backgroundColor: "#FFFDFC",
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#EEE5E8"
  },
  contentRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8
  },
  metadataRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    marginBottom: 1
  },
  body: {
    ...uiTheme.font.body,
    color: "#2F2630",
    flexShrink: 1
  },
  bodyMe: {
    color: "#351B32"
  },
  time: {
    ...uiTheme.font.micro,
    color: "#8D7D86",
    fontSize: 10,
  },
  timeMe: {
    color: "#876F78"
  },
  dateSep: {
    alignItems: "center",
    paddingVertical: uiTheme.spacing.md,
  },
  dateSepPill: {
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 5,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft,
  },
  dateSepText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
})

const bubbleGroupStyles = {
  me: {
    single: bubbleStyles.bubbleMesingle,
    first: bubbleStyles.bubbleMefirst,
    middle: bubbleStyles.bubbleMemiddle,
    last: bubbleStyles.bubbleMelast
  },
  them: {
    single: bubbleStyles.bubbleThemsingle,
    first: bubbleStyles.bubbleThemfirst,
    middle: bubbleStyles.bubbleThemmiddle,
    last: bubbleStyles.bubbleThemlast
  }
} as const
