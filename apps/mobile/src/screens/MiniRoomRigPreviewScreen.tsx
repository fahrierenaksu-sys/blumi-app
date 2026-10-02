import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useMemo, useState } from "react"
import type { RoomChatHistoryItem } from "../features/miniRoom/roomChatHistoryModel"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { createCurrentUserAvatarSnapshot } from "../features/miniRoom/currentUserAvatarSnapshot"
import { createMiniRoomPartnerAvatarSnapshot } from "../features/miniRoom/partnerAvatarSnapshot"
import { getMiniRoomCopy } from "../features/miniRoom/miniRoomCopy"
import { MiniRoomScene } from "../features/miniRoom/scene/MiniRoomScene"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2Catalog"
import { resolveRoomV2Scene } from "../features/roomV2/roomV2Selectors"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import type { SessionActor } from "../features/session/sessionModel"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"

type MiniRoomRigPreviewScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "MiniRoomRigPreview"
> & {
  sessionActor: SessionActor
}

const PARTNER = {
  userId: "mini-room-rig-preview-partner",
  displayName: "Defne"
} as const

const LOCAL_MEDIA_OFF = {
  micEnabled: false,
  speakerEnabled: false
} as const

export function MiniRoomRigPreviewScreen(props: MiniRoomRigPreviewScreenProps) {
  const { navigation, sessionActor } = props
  const { avatar, catalog } = useAvatarV2()
  const { userRoomDecor } = useRoomV2()
  // Local-only UI examples for the existing development-only route. Never sent or persisted.
  const [chatHistory, setChatHistory] = useState<RoomChatHistoryItem[]>([
    { id: "preview-recent", body: "Biraz yoğun. Şimdi dinleniyorum. Burada sakin sakin sohbet etmek iyi geldi.", mine: false, delivery: "sent", showMeta: true, sentAt: "2026-10-02T15:26:00Z" },
    { id: "preview-outgoing", body: "Ben de öyle düşünüyorum. Günün nasıl geçti?", mine: true, delivery: "sent", showMeta: true, sentAt: "2026-10-02T15:25:00Z" },
    { id: "preview-earlier", body: "Burada olmak güzel.", mine: false, delivery: "sent", showMeta: true, sentAt: "2026-10-02T15:24:00Z" }
  ])
  const localUser = useMemo(() => ({
    userId: sessionActor.profile.userId,
    displayName: getMiniRoomCopy("tr").youLabel
  }), [sessionActor.profile.userId])
  const participantAvatarSnapshots = useMemo(() => ({
    local: createCurrentUserAvatarSnapshot({
      ...localUser,
      avatar,
      avatarCatalog: catalog
    }),
    partner: createMiniRoomPartnerAvatarSnapshot(PARTNER)
  }), [avatar, catalog, localUser])
  const roomDecorScene = useMemo(() => resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: userRoomDecor,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }), [userRoomDecor])

  return (
    <MiniRoomScene
      copy={getMiniRoomCopy("tr")}
      localUser={localUser}
      partnerUser={PARTNER}
      participantAvatarSnapshots={participantAvatarSnapshots}
      connectionStatus="connected"
      voiceAvailable={false}
      localMedia={LOCAL_MEDIA_OFF}
      roomDecorScene={roomDecorScene}
      leaveDisabled={false}
      onLeave={() => goBackOrFallback(navigation, () => navigation.replace("MyRoom"))}
      onOpenSafety={() => undefined}
      onRetryConnect={() => undefined}
      onToggleMic={() => undefined}
      inRoomMessages={[]}
      consumeInRoomMessage={() => undefined}
      canChatSend={true}
      onSendRoomMessage={(body) => {
        setChatHistory((current) => [{ id: `preview-local-${current.length}`, body, mine: true,
          delivery: "sent", showMeta: true, sentAt: new Date().toISOString() }, ...current])
        return true
      }}
      chatHistory={chatHistory}
      chatHistoryStatus="ready"
    />
  )
}
