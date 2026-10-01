import type { AvatarSelection } from "@blumi/contracts"
import { useMemo } from "react"
import { StyleSheet, View } from "react-native"
import { Avatar } from "../../ui/avatar"
import { loadoutToUserAvatar } from "../avatarV2/avatarSelectionModel"
import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoomCatalog"
import { projectAvatarV2ToRoomAvatarAppearance } from "../avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import { RoomAvatarRenderer2D } from "../avatarV2/room/components/RoomAvatarRenderer2D"
import { getCanonicalChatParticipantAvatar } from "./chatParticipantAvatar"

/** Uses the saved canonical loadout, never wardrobe drafts or sample outfits. */
export function RoomInviteAvatar({ avatar, name, seed }: { avatar?: AvatarSelection; name: string; seed: string }) {
  const layers = useMemo(() => {
    const selection = getCanonicalChatParticipantAvatar({ avatar })
    if (!selection) return null
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({ avatar: loadoutToUserAvatar(selection.loadout) })
    return getRoomAvatarRenderLayers({ appearance, catalog: ROOM_AVATAR_CATALOG, state: "idle", direction: "front" })
  }, [avatar])
  return layers ? <RoomAvatarRenderer2D layers={layers} imagePriority="normal" /> : (
    <View style={styles.fallback}><Avatar name={name} seed={seed} size={52} ring="soft" /></View>
  )
}

const styles = StyleSheet.create({ fallback: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 9 } })
