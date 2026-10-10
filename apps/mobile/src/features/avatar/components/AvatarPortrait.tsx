import { memo } from "react"
import { View, type StyleProp, type ViewStyle } from "react-native"
import type { AvatarLoadoutCoercionHints, AvatarStillRect } from "@blumi/domain"
import { AvatarStill } from "./AvatarStill"

/** Portraits at or below this size (pt) show a face-tight crop of the bust (plan 2.2: tiny). */
export const AVATAR_PORTRAIT_TINY_PT = 40
/** The face-tight window inside the 256 px bust. */
const FACE_WINDOW: AvatarStillRect = [46, 20, 164, 164]
const BUST_WINDOW: AvatarStillRect = [0, 0, 256, 256]

export interface AvatarPortraitProps {
  loadout: unknown
  hints?: AvatarLoadoutCoercionHints
  /** Diameter (pt); intended up to 85. */
  size: number
  /** The person's swatch colour behind the bust. */
  backgroundColor: string
  mirror?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

/** A round head-and-shoulders still (lists, headers, chips): baked bust layers, never a GPU canvas. */
export const AvatarPortrait = memo(function AvatarPortrait(props: AvatarPortraitProps) {
  const { size } = props
  return (
    <View
      accessible={props.accessibilityLabel !== undefined}
      accessibilityLabel={props.accessibilityLabel}
      style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: props.backgroundColor }, props.style]}
    >
      <AvatarStill
        loadout={props.loadout}
        hints={props.hints}
        crop="bust"
        window={size <= AVATAR_PORTRAIT_TINY_PT ? FACE_WINDOW : BUST_WINDOW}
        width={size}
        height={size}
        mirror={props.mirror}
      />
    </View>
  )
})
