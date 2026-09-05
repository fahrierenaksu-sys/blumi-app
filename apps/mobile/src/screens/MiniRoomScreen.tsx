import type { ServerEvent } from "@blumi/contracts"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { ReportModal } from "../components/ReportModal"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { useGlobalRealtime, useGlobalRealtimeEvents } from "../features/realtime/globalRealtimeProvider"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2.mock"
import { resolveRoomV2Scene } from "../features/roomV2/roomV2Selectors"
import { resolveSharedRoomDecor } from "../features/miniRoom/sharedRoomDecor"
import type { SessionActor } from "../features/session/sessionApi"
import { MiniRoomScene } from "../features/miniRoom/scene/MiniRoomScene"
import { getMiniRoomCopy } from "../features/miniRoom/miniRoomCopy"
import { useInRoomChat } from "../features/miniRoom/useInRoomChat"
import { useMiniRoomMedia } from "../features/miniRoom/useMiniRoomMedia"
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
  const { mediaState, retryConnect, toggleMic } = useMiniRoomMedia({ miniRoom, mediaSession })
  const roomChat = useInRoomChat({
    miniRoomId: miniRoom.miniRoomId,
    sourceThreadId: miniRoom.sourceThreadId,
    localUserId: sessionActor.profile.userId,
    partnerUserId: participants.partner.userId
  })

  const status = mediaState.connectionStatus
  const connectedAtRef = useRef<number | null>(null)
  const accumulatedConnectedMsRef = useRef<number>(0)
  const everConnectedRef = useRef<boolean>(false)
  const exitedRef = useRef<boolean>(false)
  const endRequestedRef = useRef<boolean>(false)
  const [endRequested, setEndRequested] = useState(false)
  const [safetyVisible, setSafetyVisible] = useState(false)

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
  const { connectionStatus: lifecycleConnectionStatus, send: sendLifecycleEvent } = useGlobalRealtime()

  const requestEndMiniRoom = useCallback((): void => {
    if (exitedRef.current || endRequestedRef.current) {
      return
    }
    endRequestedRef.current = true
    setEndRequested(true)
    if (lifecycleConnectionStatus === "connected") {
      sendLifecycleEvent({
        type: "mini_room.leave",
        payload: {
          miniRoomId: miniRoom.miniRoomId
        }
      })
    }
    exitToDebrief()
  }, [exitToDebrief, lifecycleConnectionStatus, miniRoom.miniRoomId, sendLifecycleEvent])

  const handleSafetyActionComplete = useCallback((): void => {
    setSafetyVisible(false)
    if (!exitedRef.current) {
      exitToDebrief()
    }
  }, [exitToDebrief])

  const leaveDisabled = endRequested

  return (
    <View style={styles.root}>
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
      />
    </View>
  )
}

const styles = StyleSheet.create({
  legacyNotice: { color: uiTheme.colors.textInverted, padding: 12, textAlign: "center" },
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.nightBackground
  }
})
