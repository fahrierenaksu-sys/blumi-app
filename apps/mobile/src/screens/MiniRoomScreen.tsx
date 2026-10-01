import type { ServerEvent } from "@blumi/contracts"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useIsFocused } from "@react-navigation/native"
import { useMiniRoomMotion } from "../features/miniRoom/useMiniRoomMotion"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import { ReportModal } from "../components/ReportModal"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { createCandidateAvatarSnapshot } from "../features/avatarV2/candidateAvatarSnapshot"
import {
  getGlobalStatus,
  subscribeToStatus,
  useGlobalRealtime,
  useGlobalRealtimeEvents
} from "../features/realtime/globalRealtimeProvider"
import { createReconnectTransitionTracker } from "@blumi/realtime-client"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2Catalog"
import { resolveRoomV2Scene } from "../features/roomV2/roomV2Selectors"
import { resolveSharedRoomDecor } from "../features/miniRoom/sharedRoomDecor"
import type { SessionActor } from "../features/session/sessionApi"
import { MiniRoomScene } from "../features/miniRoom/scene/MiniRoomScene"
import { getMiniRoomCopy } from "../features/miniRoom/miniRoomCopy"
import { useInRoomChat } from "../features/miniRoom/useInRoomChat"
import { useMiniRoomLeaveGuard } from "../features/miniRoom/useMiniRoomLeaveGuard"
import { useMiniRoomMedia } from "../features/miniRoom/useMiniRoomMedia"
import { useMiniRoomNotices } from "../features/miniRoom/useMiniRoomNotices"
import { useRoomChatHistory } from "../features/miniRoom/useRoomChatHistory"
import {
  isDefinitivelyUnavailableRoomSession,
  joinRoomSession
} from "../features/chat/chatRoomInviteApi"
import { useMiniRoomLeave } from "../features/miniRoom/useMiniRoomLeave"
import { getMiniRoomExitDestination } from "../features/miniRoom/miniRoomLeaveModel"
import { mergeMiniRoomReconnectSnapshot } from "../features/miniRoom/reconnectRoomSnapshot"
import { createMiniRoomPartnerAvatarSnapshot } from "../features/miniRoom/partnerAvatarSnapshot"
import { createCurrentUserAvatarSnapshot } from "../features/miniRoom/currentUserAvatarSnapshot"
import type {
  MiniRoomParticipantAvatarSnapshots
} from "../features/miniRoom/scene/miniRoomSceneTypes"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import { hapticLight } from "../ui/haptics"
import { showToast } from "../ui/toast"
import { useFocusedConversation, useRoomMessageAlertSuppression } from "../features/notifications/useFocusedConversation"
import { getChatTypingCopy } from "../features/chat/typing/chatTypingCopy"
import { useChatDraftTyping } from "../features/chat/typing/useChatDraftTyping"
import { usePartnerTyping } from "../features/chat/typing/usePartnerTyping"

type MiniRoomScreenProps = NativeStackScreenProps<RootStackParamList, "MiniRoom"> & {
  sessionActor: SessionActor
}

export function MiniRoomScreen(props: MiniRoomScreenProps) {
  const { navigation, route, sessionActor } = props
  const { readyMiniRoom, participants } = route.params
  const { miniRoom, mediaSession } = readyMiniRoom
  const isFocused = useIsFocused()
  useRoomMessageAlertSuppression(isFocused)
  const roomMotion = useMiniRoomMotion({ miniRoomId: miniRoom.miniRoomId,
    localUserId: sessionActor.profile.userId, partnerUserId: participants.partner.userId,
    enabled: sessionActor.session.mode === "production", isFocused })
  const locale = resolveAccountRecoveryLocale(
      getNativeAppLocale(),
      Intl.DateTimeFormat().resolvedOptions().locale
    )
  const roomCopy = getMiniRoomCopy(locale)
  const sharedRoomDecor = useMemo(() => resolveSharedRoomDecor(miniRoom), [miniRoom])
  const { avatar: localAvatarV2, catalog: avatarV2Catalog } = useAvatarV2()
  const { mediaState, voiceAvailable, retryConnect, toggleMic } = useMiniRoomMedia({ miniRoom, mediaSession })
  const roomChat = useInRoomChat({
    miniRoomId: miniRoom.miniRoomId,
    sourceThreadId: miniRoom.sourceThreadId,
    localUserId: sessionActor.profile.userId,
    partnerUserId: participants.partner.userId
  })
  // The room shows its conversation's messages and invites itself.
  useFocusedConversation(roomChat.threadId, isFocused)
  // Typing (chat_typing): dots over the partner's chibi, spoken once per session.
  const draftTyping = useChatDraftTyping(roomChat.threadId, isFocused)
  const partnerTyping = usePartnerTyping(roomChat.threadId, participants.partner.userId,
    getChatTypingCopy(locale).partnerTyping(participants.partner.displayName))
  const roomTyping = useMemo(() => ({ partnerTyping, draft: draftTyping }), [draftTyping, partnerTyping])
  const roomChatHistory = useRoomChatHistory({
    threadId: roomChat.threadId,
    localUserId: sessionActor.profile.userId
  })

  const { connectionStatus: lifecycleConnectionStatus } = useGlobalRealtime()
  const status = voiceAvailable
    ? mediaState.connectionStatus
    : lifecycleConnectionStatus === "reconnecting"
      ? "connecting"
      : lifecycleConnectionStatus === "unreachable"
        ? "disconnected"
        : lifecycleConnectionStatus
  const exitedRef = useRef<boolean>(false)
  const [safetyVisible, setSafetyVisible] = useState(false)
  const [reconnectError, setReconnectError] = useState(false)
  const reconnectScopeKey = JSON.stringify([
    sessionActor.profile.userId,
    sessionActor.session.sessionId,
    sessionActor.session.sessionToken,
    miniRoom.miniRoomId
  ])
  const reconnectScopeRef = useRef(reconnectScopeKey)
  reconnectScopeRef.current = reconnectScopeKey
  const routeParamsRef = useRef(route.params)
  routeParamsRef.current = route.params

  const hostRoomSnapshot = useMemo(
    () =>
      resolveRoomV2Scene({
        roomShellCatalog: ROOM_V2_SHELL_CATALOG,
        furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
        decor: sharedRoomDecor.decor,
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      }),
    [sharedRoomDecor]
  )

  const participantAvatarSnapshots = useMemo<MiniRoomParticipantAvatarSnapshots>(() => {
    const localSnapshot = createCurrentUserAvatarSnapshot({
      userId: participants.you.userId,
      displayName: participants.you.displayName,
      avatar: localAvatarV2,
      avatarCatalog: avatarV2Catalog
    })
    const partnerSnapshot = createMiniRoomPartnerAvatarSnapshot({
      userId: participants.partner.userId,
      displayName: participants.partner.displayName,
      candidateAvatarSnapshot: participants.partner.avatarSnapshot
    })

    return {
      local: localSnapshot,
      partner: partnerSnapshot
    }
  }, [
    avatarV2Catalog,
    localAvatarV2,
    participants.partner.displayName,
    participants.partner.avatarSnapshot,
    participants.partner.userId,
    participants.you.displayName,
    participants.you.userId
  ])

  const exitRoom = useCallback((blockedPartner = false): void => {
    if (exitedRef.current) return
    exitedRef.current = true
    const destination = getMiniRoomExitDestination(miniRoom.sourceThreadId, blockedPartner)
    if (destination.name === "ChatThread") {
      navigation.popTo("ChatThread", { threadId: destination.threadId })
    } else {
      navigation.popTo("Inbox")
    }
  }, [miniRoom.sourceThreadId, navigation])

  const handleLifecycleEvent = useCallback(
    (event: ServerEvent): void => {
      if (
        event.type !== "mini_room.ended" ||
        event.payload.miniRoomId !== miniRoom.miniRoomId
      ) {
        return
      }
      exitRoom()
    },
    [exitRoom, miniRoom.miniRoomId]
  )

  useGlobalRealtimeEvents(handleLifecycleEvent)

  useEffect(() => {
    if (sessionActor.session.mode !== "production") return
    const userId = sessionActor.profile.userId
    const sessionToken = sessionActor.session.sessionToken
    const roomId = miniRoom.miniRoomId
    const isReconnect = createReconnectTransitionTracker(getGlobalStatus())
    let active = true
    let refreshGeneration = 0
    let requestController: AbortController | null = null

    const isCurrent = (generation?: number): boolean =>
      active &&
      !exitedRef.current &&
      reconnectScopeRef.current === reconnectScopeKey &&
      (generation === undefined || generation === refreshGeneration)

    const unsubscribe = subscribeToStatus((connectionStatus) => {
      if (
        connectionStatus === "reconnecting" ||
        connectionStatus === "disconnected" ||
        connectionStatus === "error"
      ) {
        refreshGeneration += 1
        requestController?.abort()
        requestController = null
      }
      if (!isReconnect(connectionStatus) || !isCurrent()) return

      const generation = ++refreshGeneration
      const controller = new AbortController()
      requestController = controller
      setReconnectError(false)

      void joinRoomSession(
        MOBILE_HTTP_BASE_URL,
        sessionToken,
        roomId,
        fetch,
        controller.signal
      ).then((result) => {
        if (!isCurrent(generation) || controller.signal.aborted) return

        const currentParams = routeParamsRef.current
        if (currentParams.readyMiniRoom.miniRoom.miniRoomId !== roomId) return
        const refreshedYou = result.participants.find((participant) => participant.userId === userId)
        const refreshedPartner = result.participants.find(
          (participant) => participant.userId === currentParams.participants.partner.userId
        )
        if (!refreshedYou || !refreshedPartner) {
          throw new Error("Room participant snapshot is incomplete.")
        }

        const refreshedParticipants = {
          you: {
            ...currentParams.participants.you,
            displayName: refreshedYou.displayName
          },
          partner: {
            ...currentParams.participants.partner,
            displayName: refreshedPartner.displayName,
            avatarSnapshot: createCandidateAvatarSnapshot({
              userId: refreshedPartner.userId,
              displayName: refreshedPartner.displayName,
              avatarSelection: refreshedPartner.avatar
            })
          }
        }
        const nextParams = mergeMiniRoomReconnectSnapshot({
          current: currentParams,
          refreshedMiniRoom: result.miniRoom,
          refreshedParticipants
        })
        if (!nextParams) return

        routeParamsRef.current = nextParams
        navigation.setParams(nextParams)
      }).catch((error: unknown) => {
        if (!isCurrent(generation) || controller.signal.aborted) return
        if (isDefinitivelyUnavailableRoomSession(error)) {
          exitRoom()
          return
        }
        setReconnectError(true)
      }).finally(() => {
        if (requestController === controller) requestController = null
      })
    })

    return () => {
      active = false
      refreshGeneration += 1
      requestController?.abort()
      requestController = null
      unsubscribe()
    }
  }, [exitRoom, miniRoom.miniRoomId, navigation, reconnectScopeKey, sessionActor.profile.userId, sessionActor.session.mode, sessionActor.session.sessionToken])

  const { leaveRequested, requestLeave } = useMiniRoomLeave({
    miniRoomId: miniRoom.miniRoomId,
    sessionMode: sessionActor.session.mode,
    sessionToken: sessionActor.session.sessionToken,
    copy: roomCopy,
    exitedRef,
    exitRoom
  })

  // The same account entered this room on another device, which now drives
  // the avatar (newest entry wins). Leave the screen without ending the room.
  useEffect(() => {
    if (!roomMotion.superseded || exitedRef.current) return
    showToast({ type: "info", title: roomCopy.continuedOnOtherDevice })
    exitRoom()
  }, [exitRoom, roomCopy, roomMotion.superseded])

  const roomNotice = useMiniRoomNotices({ roomMotion, copy: roomCopy,
    partnerFirstName: participants.partner.displayName.split(" ")[0] || participants.partner.displayName })

  const confirmLeave = useMiniRoomLeaveGuard({
    copy: roomCopy,
    exitedRef,
    requestLeave,
    navigation
  })

  const handleSafetyActionComplete = useCallback((): void => {
    setSafetyVisible(false)
    if (!exitedRef.current) {
      exitRoom(true)
    }
  }, [exitRoom])

  const notices = useMemo(() => [
    reconnectError ? roomCopy.roomRefreshFailed : null,
    sharedRoomDecor.legacyFallback ? roomCopy.legacyDecorNotice : null,
    roomNotice
  ].filter((notice): notice is string => notice !== null), [reconnectError, roomCopy, roomNotice, sharedRoomDecor.legacyFallback])

  return (
    <View style={styles.root}>
      <ReportModal
        visible={safetyVisible}
        targetUserId={participants.partner.userId}
        targetDisplayName={participants.partner.displayName}
        sessionActor={sessionActor}
        onClose={() => setSafetyVisible(false)}
        onActionComplete={handleSafetyActionComplete}
      />
      <MiniRoomScene
        roomMotion={roomMotion}
        copy={roomCopy}
        localUser={participants.you}
        partnerUser={participants.partner}
        participantAvatarSnapshots={participantAvatarSnapshots}
        connectionStatus={status}
        voiceAvailable={voiceAvailable}
        localMedia={mediaState.localMedia}
        roomDecorScene={hostRoomSnapshot}
        leaveDisabled={leaveRequested}
        onLeave={confirmLeave}
        onOpenSafety={() => setSafetyVisible(true)}
        onRetryConnect={() => {
          void retryConnect()
        }}
        onToggleMic={() => {
          hapticLight()
          void toggleMic()
        }}
        inRoomMessages={roomChat.newMessages}
        consumeInRoomMessage={roomChat.consume}
        canChatSend={roomChat.canSend}
        onSendRoomMessage={roomChat.sendRoomMessage}
        failedRoomMessage={roomChat.failedRoomMessage}
        chatHistory={roomChatHistory.items}
        chatHistoryStatus={roomChatHistory.status}
        notices={notices}
        typing={roomTyping}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Matches the scene's powder base so no dark frame shows before it paints.
  root: {
    flex: 1,
    backgroundColor: "#FFF7FA"
  }
})
