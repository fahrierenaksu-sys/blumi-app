import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { AvatarStill } from "../features/avatar/components/AvatarStill"
import type { AvatarStillCrop } from "../features/avatar/model/avatarStillLayout"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { uiTheme } from "./theme"

interface MyAvatarStillProps {
  name: string
  size?: number
  ring?: "none" | "soft" | "strong"
  /** `full` stands the whole figure in the bubble, `half` shows it down to the hips. */
  crop?: Extract<AvatarStillCrop, "full" | "half">
  mirror?: boolean
  style?: StyleProp<ViewStyle>
}

/** The signed-in user's own avatar as a baked still in a soft round stage (Discover, match moment): never a GPU canvas. */
export function MyAvatarStill(props: MyAvatarStillProps) {
  const { name, size = 64, ring = "none", crop = "full", mirror = false, style } = props
  const { avatar } = useAvatarV2()
  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0
  const inner = size - ringWidth * 2
  // the whole figure keeps a little air inside the bubble; the half crop fills it
  const figure = crop === "full" ? inner * 0.86 : inner

  return (
    <View
      accessibilityLabel={`${name} avatar`}
      style={[
        styles.root,
        ring !== "none" ? uiTheme.shadow.soft : null,
        { width: size, height: size, borderRadius: size / 2, borderWidth: ringWidth },
        style
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.glow, { width: inner * 0.9, height: inner * 0.74, borderRadius: inner * 0.45 }]}
      />
      <AvatarStill
        loadout={avatar}
        crop={crop}
        width={figure}
        height={figure}
        mirror={mirror}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(255, 232, 244, 0.95)",
    borderColor: "#FFFFFF"
  },
  glow: {
    position: "absolute",
    bottom: "12%",
    backgroundColor: "rgba(255, 79, 152, 0.16)"
  }
})
