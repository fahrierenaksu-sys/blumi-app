import type { AvatarSelection } from "@blumi/contracts"
import { StyleSheet, View } from "react-native"
import { Avatar } from "../../ui/avatar"
import { getCachedAvatarPortraitLayers } from "../avatarV2/room/avatarPortraitLayerCache"
import { RoomAvatarStill } from "../avatarV2/room/components/RoomAvatarStill"
import { getCanonicalChatParticipantAvatar } from "./chatParticipantAvatar"

/** Uses the saved canonical loadout, never wardrobe drafts or sample outfits. */
export function RoomInviteAvatar({ avatar, name, seed }: { avatar?: AvatarSelection; name: string; seed: string }) {
  // Same still, front-facing layers as every other portrait, shared per look.
  const selection = getCanonicalChatParticipantAvatar({ avatar })
  const layers = selection ? getCachedAvatarPortraitLayers(selection.loadout) : null
  return layers ? <RoomAvatarStill layers={layers} imagePriority="normal" /> : (
    <View style={styles.fallback}><Avatar name={name} seed={seed} size={52} ring="soft" /></View>
  )
}

const styles = StyleSheet.create({ fallback: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 9 } })
