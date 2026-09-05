import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useMemo } from "react"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { createCurrentUserAvatarSnapshot } from "../features/miniRoom/currentUserAvatarSnapshot"
import { createMiniRoomPartnerAvatarSnapshot } from "../features/miniRoom/partnerAvatarSnapshot"
import { getMiniRoomCopy } from "../features/miniRoom/miniRoomCopy"
import { MiniRoomScene } from "../features/miniRoom/scene/MiniRoomScene"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2.mock"
import { resolveRoomV2Scene } from "../features/roomV2/roomV2Selectors"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import type { SessionActor } from "../features/session/sessionModel"
import type { RootStackParamList } from "../navigation/RootNavigator"

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
  const localUser = useMemo(() => ({
    userId: sessionActor.profile.userId,
    displayName: sessionActor.profile.displayName
  }), [sessionActor.profile.displayName, sessionActor.profile.userId])
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
      copy={getMiniRoomCopy("en")}
      localUser={localUser}
      partnerUser={PARTNER}
      participantAvatarSnapshots={participantAvatarSnapshots}
      connectionStatus="connected"
      localMedia={LOCAL_MEDIA_OFF}
      roomDecorScene={roomDecorScene}
      leaveDisabled={false}
      onLeave={() => navigation.goBack()}
      onOpenSafety={() => undefined}
      onRetryConnect={() => undefined}
      onToggleMic={() => undefined}
      inRoomMessages={[]}
      consumeInRoomMessage={() => undefined}
      canChatSend={false}
      onSendRoomMessage={() => false}
    />
  )
}
