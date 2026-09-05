import type { AvatarSelection } from "@blumi/contracts"
import { useMemo } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { getCanonicalChatParticipantAvatar } from "../features/chat/chatParticipantAvatar"
import { loadoutToUserAvatar } from "../features/avatarV2/avatarSelectionModel"
import { ROOM_AVATAR_CATALOG } from "../features/avatarV2/room/avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "../features/avatarV2/room/avatarRoomProjection"
import { RoomAvatarRenderer2D } from "../features/avatarV2/room/components/RoomAvatarRenderer2D"
import { getRoomAvatarRenderLayers } from "../features/avatarV2/room/avatarRoomSelectors"
import { Avatar, pickAvatarSwatch } from "./avatar"

interface ParticipantAvatarProps {
  name: string
  seed: string
  avatar?: AvatarSelection
  size?: number
  ring?: "none" | "soft" | "strong"
  style?: StyleProp<ViewStyle>
}

/** Renders a real chat participant avatar only when transport supplied one. */
export function ParticipantAvatar(props: ParticipantAvatarProps) {
  const { avatar, name, seed, size = 56, ring = "none", style } = props
  const completeAvatar = getCanonicalChatParticipantAvatar(
    avatar ? { userId: seed, avatar } : null
  )

  if (!completeAvatar) {
    return <Avatar name={name} seed={seed} size={size} ring={ring} style={style} />
  }

  return (
    <CanonicalParticipantAvatar
      avatar={completeAvatar}
      seed={seed}
      size={size}
      ring={ring}
      style={style}
    />
  )
}

function CanonicalParticipantAvatar(props: {
  avatar: NonNullable<ReturnType<typeof getCanonicalChatParticipantAvatar>>
  seed: string
  size: number
  ring: "none" | "soft" | "strong"
  style?: StyleProp<ViewStyle>
}) {
  const { avatar, seed, size, ring, style } = props
  const layers = useMemo(() => {
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
      avatar: loadoutToUserAvatar(avatar.loadout)
    })
    return getRoomAvatarRenderLayers({
      appearance,
      catalog: ROOM_AVATAR_CATALOG,
      state: "idle",
      direction: "front"
    })
  }, [avatar])
  const swatch = pickAvatarSwatch(seed)
  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0
  const ringColor = ring === "strong" ? "#FFFFFF" : "rgba(255,255,255,0.7)"

  return (
    <View
      accessible={false}
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: swatch.bg,
          borderWidth: ringWidth,
          borderColor: ringColor
        },
        style
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.avatarBody,
          {
            width: size * 0.86,
            height: size * 1.3,
            left: size * 0.07,
            top: size * 0.04
          }
        ]}
      >
        <RoomAvatarRenderer2D layers={layers} />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.highlight,
          {
            width: size * 0.64,
            height: size * 0.36,
            borderRadius: size,
            top: -size * 0.04,
            left: -size * 0.08
          }
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    position: "relative"
  },
  avatarBody: {
    position: "absolute"
  },
  highlight: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.28)"
  }
})
