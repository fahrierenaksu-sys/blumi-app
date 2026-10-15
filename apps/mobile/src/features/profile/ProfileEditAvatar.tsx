import { StyleSheet, View } from "react-native"
import { AvatarShowcase } from "../avatar/components/AvatarShowcase"
import { uiTheme } from "../../ui/theme"
import { useOwnAvatarLoadout } from "./useOwnAvatarLoadout"

/** The still's half crop (head to hips) is 442 x 589 at its widest, so the frame keeps that shape. */
export const PROFILE_EDIT_AVATAR_WIDTH = 104
export const PROFILE_EDIT_AVATAR_HEIGHT = 136
/** The square bust box inside the frame, sitting on its bottom edge (the showcase push window is square). */
const FIGURE_SIZE = PROFILE_EDIT_AVATAR_WIDTH - 8

/**
 * The ProfileEdit header: the viewer's own front bust (ITEM_SYNC_RULES: Avatar edit / Profile use the showcase) in a
 * soft frame, baked layers only. A look without front art draws the head-to-hips 3/4 still it showed before.
 */
export function ProfileEditAvatar(props: { name: string }) {
  const loadout = useOwnAvatarLoadout()
  return (
    <View accessible accessibilityLabel={`${props.name} avatar`} style={styles.frame}>
      <AvatarShowcase loadout={loadout} crop="push" fallbackCrop="half" width={FIGURE_SIZE} height={FIGURE_SIZE} decorative />
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
