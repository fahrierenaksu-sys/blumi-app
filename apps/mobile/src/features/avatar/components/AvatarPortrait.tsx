import { memo } from "react"
import { View, type StyleProp, type ViewStyle } from "react-native"
import type { AvatarLoadoutCoercionHints, AvatarStillRect } from "@blumi/domain"
import { AvatarShowcase } from "./AvatarShowcase"

/** Portraits at or below this size (pt) show a face-tight crop of the bust (plan 2.2: tiny). */
export const AVATAR_PORTRAIT_TINY_PT = 40
/**
 * The face-tight window inside the 256 px bust. Both heads sit at x 73-195, y 20-157 of the bust and turn a little
 * to the side, so the window is shifted right and down to put the eyes just above the centre of the circle.
 */
const FACE_WINDOW: AvatarStillRect = [52, 28, 160, 160]
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

/**
 * A round head still (lists, headers, chips): the front showcase `head` crop, never a GPU canvas. A look without
 * front art for every worn piece is drawn whole as the baked 3/4 bust (face-tight when tiny), so swapping in the
 * front art later is data only.
 */
export const AvatarPortrait = memo(function AvatarPortrait(props: AvatarPortraitProps) {
  const { size } = props
  return (
    <View
      accessible={props.accessibilityLabel !== undefined}
      accessibilityLabel={props.accessibilityLabel}
      style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: props.backgroundColor }, props.style]}
    >
      <AvatarShowcase
        loadout={props.loadout}
        hints={props.hints}
        crop="head"
        fallbackCrop="bust"
        fallbackWindow={size <= AVATAR_PORTRAIT_TINY_PT ? FACE_WINDOW : BUST_WINDOW}
        width={size}
        height={size}
        mirror={props.mirror}
      />
    </View>
  )
})
