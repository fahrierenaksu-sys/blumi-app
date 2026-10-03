import type { AvatarSelection } from "@blumi/contracts"
import { memo } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { getCanonicalChatParticipantAvatar } from "../features/chat/chatParticipantAvatar"
import { getCachedAvatarPortraitLayers } from "../features/avatarV2/room/avatarPortraitLayerCache"
import { RoomAvatarStill } from "../features/avatarV2/room/components/RoomAvatarStill"
import type { RoomV2AvatarRenderLayer } from "../features/roomV2/roomV2.types"
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

  // The layers come from a cache keyed by the loadout's content, so a row that
  // gets a fresh (equal) avatar object keeps the same layers and does not redraw.
  return (
    <CanonicalParticipantAvatar
      layers={getCachedAvatarPortraitLayers(completeAvatar.loadout)}
      seed={seed}
      size={size}
      ring={ring}
      style={style}
    />
  )
}

const CanonicalParticipantAvatar = memo(function CanonicalParticipantAvatar(props: {
  layers: RoomV2AvatarRenderLayer[]
  seed: string
  size: number
  ring: "none" | "soft" | "strong"
  style?: StyleProp<ViewStyle>
}) {
  const { layers, seed, size, ring, style } = props
  const swatch = pickAvatarSwatch(seed)
  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0
  const ringColor = ring === "strong" ? "#FFFFFF" : "rgba(255,255,255,0.7)"

  return (
    <View
      accessible={false}
      // Static layered portrait in a circular clip: iOS keeps it as one
      // bitmap instead of masking every layer each frame (Inbox rows).
      shouldRasterizeIOS
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
        <RoomAvatarStill layers={layers} />
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
})

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
