import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { AvatarShowcase } from "../features/avatar/components/AvatarShowcase"
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

/**
 * The signed-in user's own avatar as the showcase still in a soft round stage (Discover, match moment): never a GPU
 * canvas. Until the look has front art it is today's 3/4 still in the same crop.
 */
export function MyAvatarStill(props: MyAvatarStillProps) {
  const { name, size = 64, ring = "none", crop = "full", mirror = false, style } = props
  const { avatar } = useAvatarV2()
  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0
  const inner = size - ringWidth * 2
  // the whole figure keeps a little air inside the bubble; the half crop fills it
  const figure = crop === "full" ? inner * 0.86 : inner
  const label = `${name} avatar`

  return (
    <View
      accessibilityLabel={label}
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
      <AvatarShowcase
        loadout={avatar}
        crop="card"
        fallbackCrop={crop}
        width={figure}
        height={figure}
        mirror={mirror}
        accessibilityLabel={label}
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
