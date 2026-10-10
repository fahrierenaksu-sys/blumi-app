import type { AvatarSelection } from "@blumi/contracts"
import { StyleSheet, View } from "react-native"
import { ParticipantAvatar } from "../../ui/participantAvatar"

/** The round portrait standing beside the door (the plan's small class, at most 60 pt). */
export const ROOM_INVITE_PORTRAIT_SIZE = 60

/** Uses the saved canonical loadout, never wardrobe drafts or sample outfits; no avatar keeps the monogram. */
export function RoomInviteAvatar({ avatar, name, seed }: { avatar?: AvatarSelection; name: string; seed: string }) {
  return (
    <View style={styles.slot}>
      <ParticipantAvatar name={name} seed={seed} avatar={avatar} size={ROOM_INVITE_PORTRAIT_SIZE} ring="strong" />
    </View>
  )
}

const styles = StyleSheet.create({ slot: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 9 } })
