import type { AvatarSelection } from "@blumi/contracts"
import { memo, useMemo } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { getCanonicalChatParticipantAvatar } from "../features/chat/chatParticipantAvatar"
import { AvatarPortrait } from "../features/avatar/components/AvatarPortrait"
import { Avatar, pickAvatarSwatch } from "./avatar"
import { useStableByContent } from "./useStableByContent"

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
      loadout={completeAvatar.loadout}
      presetId={completeAvatar.presetId}
      seed={seed}
      size={size}
      ring={ring}
      style={style}
    />
  )
}

const CanonicalParticipantAvatar = memo(function CanonicalParticipantAvatar(props: {
  loadout: unknown
  presetId: string
  seed: string
  size: number
  ring: "none" | "soft" | "strong"
  style?: StyleProp<ViewStyle>
}) {
  const { seed, size, ring, style } = props
  // The received loadout is anyone's, so the portrait resolver coerces it (an old or unknown item draws as the
  // body's starter piece). An equal look keeps one reference, so a fresh avatar object does not redraw the row.
  const loadout = useStableByContent(props.loadout)
  const hints = useMemo(() => ({ presetId: props.presetId }), [props.presetId])
  const ringWidth = ring === "strong" ? 3 : ring === "soft" ? 1.5 : 0
  const ringColor = ring === "strong" ? "#FFFFFF" : "rgba(255,255,255,0.7)"

  return (
    <View
      accessible={false}
      // Static portrait in a circular clip: iOS keeps it as one bitmap instead of masking every layer each frame
      // (Inbox rows).
      shouldRasterizeIOS
      style={[
        styles.root,
        { width: size, height: size, borderRadius: size / 2, borderWidth: ringWidth, borderColor: ringColor },
        style
      ]}
    >
      <AvatarPortrait
        loadout={loadout}
        hints={hints}
        size={size - ringWidth * 2}
        backgroundColor={pickAvatarSwatch(seed).bg}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  root: { overflow: "hidden", position: "relative" }
})
