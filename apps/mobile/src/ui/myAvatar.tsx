import { useMemo } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { ROOM_AVATAR_CATALOG } from "../features/avatarV2/room/avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "../features/avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../features/avatarV2/room/avatarRoomSelectors"
import { RoomAvatarRenderer2D } from "../features/avatarV2/room/components/RoomAvatarRenderer2D"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { uiTheme } from "./theme"

interface MyAvatarProps {
  name: string
  seed?: string
  size?: number
  ring?: "none" | "soft" | "strong"
  style?: StyleProp<ViewStyle>
}

export function MyAvatar(props: MyAvatarProps) {
  const { name, size = 64, ring = "none", style } = props
  const { avatar, catalog } = useAvatarV2()
  const roomAvatarLayers = useMemo(() => {
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
      avatar,
      avatarCatalog: catalog,
      roomAvatarCatalog: ROOM_AVATAR_CATALOG
    })

    return getRoomAvatarRenderLayers({
      appearance,
      catalog: ROOM_AVATAR_CATALOG
    })
  }, [avatar, catalog])

  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0
  const avatarWidth = size * 0.68
  const avatarHeight = avatarWidth / (256 / 384)

  return (
    <View
      accessibilityLabel={`${name} avatar`}
      style={[
        styles.root,
        ring !== "none" ? uiTheme.shadow.soft : null,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth
        },
        style
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: size * 0.9,
            height: size * 0.74,
            borderRadius: size * 0.45
          }
        ]}
      />
      <View
        style={[
          styles.avatar,
          {
            width: avatarWidth,
            height: avatarHeight
          }
        ]}
      >
        <RoomAvatarRenderer2D layers={roomAvatarLayers} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(255, 232, 244, 0.95)",
    borderColor: "#FFFFFF"
  },
  glow: {
    position: "absolute",
    bottom: "12%",
    backgroundColor: "rgba(255, 79, 152, 0.16)"
  },
  avatar: {
    marginBottom: "-4%"
  }
})
