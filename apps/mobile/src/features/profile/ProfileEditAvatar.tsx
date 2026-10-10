import { StyleSheet, View } from "react-native"
import { AvatarStill } from "../avatar/components/AvatarStill"
import { uiTheme } from "../../ui/theme"
import { useOwnAvatarLoadout } from "./useOwnAvatarLoadout"

/** The still's half crop (head to hips) is 442 x 589 at its widest, so the frame keeps that shape. */
export const PROFILE_EDIT_AVATAR_WIDTH = 104
export const PROFILE_EDIT_AVATAR_HEIGHT = 136

/** The ProfileEdit header: the viewer's own head-to-hips still in a soft frame (baked layers, no GPU canvas). */
export function ProfileEditAvatar(props: { name: string }) {
  const loadout = useOwnAvatarLoadout()
  return (
    <View accessible accessibilityLabel={`${props.name} avatar`} style={styles.frame}>
      <AvatarStill
        loadout={loadout}
        crop="half"
        width={PROFILE_EDIT_AVATAR_WIDTH - 8}
        height={PROFILE_EDIT_AVATAR_HEIGHT - 8}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    width: PROFILE_EDIT_AVATAR_WIDTH,
    height: PROFILE_EDIT_AVATAR_HEIGHT,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(255, 232, 244, 0.95)",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    ...uiTheme.shadow.soft
  }
})
