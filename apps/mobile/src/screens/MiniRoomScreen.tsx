import type { ServerEvent } from "@blumi/contracts"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
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
import { useMiniRoomMedia } from "../features/miniRoom/useMiniRoomMedia"
import {
  isDefinitivelyUnavailableRoomSession,
  joinRoomSession,
  leaveRoomSession
} from "../features/chat/chatRoomInviteApi"
import { mergeMiniRoomReconnectSnapshot } from "../features/miniRoom/reconnectRoomSnapshot"
import { createMiniRoomPartnerAvatarSnapshot } from "../features/miniRoom/partnerAvatarSnapshot"
import { createCurrentUserAvatarSnapshot } from "../features/miniRoom/currentUserAvatarSnapshot"
import type {
  MiniRoomParticipantAvatarSnapshots
} from "../features/miniRoom/scene/miniRoomSceneTypes"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import { uiTheme } from "../ui/theme"

type MiniRoomScreenProps = NativeStackScreenProps<RootStackParamList, "MiniRoom"> & {
  sessionActor: SessionActor
}

export function MiniRoomScreen(props: MiniRoomScreenProps) {
  const { navigation, route, sessionActor } = props
  const { readyMiniRoom, participants } = route.params
  const { miniRoom, mediaSession } = readyMiniRoom
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

  const { connectionStatus: lifecycleConnectionStatus } = useGlobalRealtime()
  const status = voiceAvailable
    ? mediaState.connectionStatus
    : lifecycleConnectionStatus === "reconnecting"
      ? "connecting"
      : lifecycleConnectionStatus === "unreachable"
        ? "disconnected"
        : lifecycleConnectionStatus
  const connectedAtRef = useRef<number | null>(null)
  const accumulatedConnectedMsRef = useRef<number>(0)
  const everConnectedRef = useRef<boolean>(false)
  const exitedRef = useRef<boolean>(false)
  const endRequestedRef = useRef<boolean>(false)
  const [endRequested, setEndRequested] = useState(false)
  const [safetyVisible, setSafetyVisible] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const reconnectScopeKey = JSON.stringify([
    sessionActor.profile.userId,
    sessionActor.session.sessionId,
    sessionActor.session.sessionToken,
    miniRoom.miniRoomId
  ])
  const reconnectScopeRef = useRef(reconnectScopeKey)
  reconnectScopeRef.current = reconnectScopeKey
  const localeRef = useRef(locale)
  localeRef.current = locale
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

  useEffect(() => {
    if (status === "connected") {
      everConnectedRef.current = true
      if (connectedAtRef.current === null) {
        connectedAtRef.current = Date.now()
      }
    } else if (connectedAtRef.current !== null) {
      accumulatedConnectedMsRef.current +=
        Date.now() - connectedAtRef.current
      connectedAtRef.current = null
    }
  }, [status])

  const exitToDebrief = useCallback((): void => {
    if (exitedRef.current) return
    exitedRef.current = true
    let totalMs = accumulatedConnectedMsRef.current
    if (connectedAtRef.current !== null) {
      totalMs += Date.now() - connectedAtRef.current
      connectedAtRef.current = null
    }
    navigation.replace("RoomDebrief", {
      miniRoomId: miniRoom.miniRoomId,
      partner: participants.partner,
      durationSeconds: Math.round(totalMs / 1000),
      connected: everConnectedRef.current
    })
  }, [miniRoom.miniRoomId, navigation, participants.partner])

  const handleLifecycleEvent = useCallback(
    (event: ServerEvent): void => {
      if (
        event.type !== "mini_room.ended" ||
        event.payload.miniRoomId !== miniRoom.miniRoomId
      ) {
        return
      }
      exitToDebrief()
    },
    [exitToDebrief, miniRoom.miniRoomId]
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
      setReconnectError(null)

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
          exitToDebrief()
          return
        }
        setReconnectError(localeRef.current === "tr"
          ? "Oda bilgileri yenilenemedi. Mevcut oda korunuyor; bağlantı tekrar kurulunca yeniden denenecek."
          : "Room details could not be refreshed. Your current room is unchanged; it will retry after the next reconnection.")
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
  }, [exitToDebrief, miniRoom.miniRoomId, navigation, reconnectScopeKey, sessionActor.profile.userId, sessionActor.session.mode, sessionActor.session.sessionToken])

  const requestEndMiniRoom = useCallback((): void => {
    if (exitedRef.current || endRequestedRef.current) {
      return
    }
    endRequestedRef.current = true
    setEndRequested(true)
    setLeaveError(null)
    if (sessionActor.session.mode !== "production") {
      exitToDebrief()
      return
    }
    void leaveRoomSession(
      MOBILE_HTTP_BASE_URL,
      sessionActor.session.sessionToken,
      miniRoom.miniRoomId
    ).then(() => {
      exitToDebrief()
    }).catch(() => {
      if (exitedRef.current) return
      endRequestedRef.current = false
      setEndRequested(false)
      setLeaveError(localeRef.current === "tr"
        ? "Odadan çıkış sunucuda doğrulanamadı. Bağlantını kontrol edip tekrar dene."
        : "Leaving the room could not be confirmed. Check your connection and try again.")
    })
  }, [exitToDebrief, miniRoom.miniRoomId, sessionActor.session.mode, sessionActor.session.sessionToken])

  const handleSafetyActionComplete = useCallback((): void => {
    setSafetyVisible(false)
    if (!exitedRef.current) {
      exitToDebrief()
    }
  }, [exitToDebrief])

  const leaveDisabled = endRequested

  return (
    <View style={styles.root}>
      {reconnectError ? <Text accessibilityRole="alert" style={styles.reconnectNotice}>{reconnectError}</Text> : null}
      {leaveError ? <Text accessibilityRole="alert" style={styles.reconnectNotice}>{leaveError}</Text> : null}
      {sharedRoomDecor.legacyFallback ? <Text accessibilityRole="alert" style={styles.legacyNotice}>
        {locale === "tr" ? "Bu eski oturumda dekor kaydı yok. Ortak varsayılan oda gösteriliyor." : "This older session has no saved decor. A shared default room is shown."}
      </Text> : null}
      <ReportModal
        visible={safetyVisible}
        targetUserId={participants.partner.userId}
        targetDisplayName={participants.partner.displayName}
        sessionActor={sessionActor}
        onClose={() => setSafetyVisible(false)}
        onActionComplete={handleSafetyActionComplete}
      />
      <MiniRoomScene
        copy={roomCopy}
        localUser={participants.you}
        partnerUser={participants.partner}
        participantAvatarSnapshots={participantAvatarSnapshots}
        connectionStatus={status}
        voiceAvailable={voiceAvailable}
        localMedia={mediaState.localMedia}
        roomDecorScene={hostRoomSnapshot}
        leaveDisabled={leaveDisabled}
        onLeave={requestEndMiniRoom}
        onOpenSafety={() => setSafetyVisible(true)}
        onRetryConnect={() => {
          void retryConnect()
        }}
        onToggleMic={() => {
          void toggleMic()
        }}
        inRoomMessages={roomChat.newMessages}
        consumeInRoomMessage={roomChat.consume}
        canChatSend={roomChat.canSend}
        onSendRoomMessage={roomChat.sendRoomMessage}
        failedRoomMessage={roomChat.failedRoomMessage}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  reconnectNotice: {
    backgroundColor: "#fff0f2",
    borderRadius: 12,
    color: "#8a2f45",
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    textAlign: "center"
  },
  legacyNotice: { color: uiTheme.colors.textInverted, padding: 12, textAlign: "center" },
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.nightBackground
  }
})
