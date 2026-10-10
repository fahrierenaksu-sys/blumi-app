import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { AvatarPortrait } from "../features/avatar/components/AvatarPortrait"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { uiTheme } from "./theme"

interface MyAvatarPortraitProps {
  name: string
  size?: number
  ring?: "none" | "soft" | "strong"
  style?: StyleProp<ViewStyle>
}

const MY_PORTRAIT_BACKGROUND = "rgba(255, 232, 244, 0.95)"

/** The signed-in user's own round portrait (Inbox empty state, My Room entry): a still, never a GPU canvas. */
export function MyAvatarPortrait(props: MyAvatarPortraitProps) {
  const { name, size = 64, ring = "none", style } = props
  const { avatar } = useAvatarV2()
  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0

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
      <AvatarPortrait loadout={avatar} size={size - ringWidth * 2} backgroundColor={MY_PORTRAIT_BACKGROUND} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { overflow: "hidden", position: "relative", borderColor: "#FFFFFF" }
})
