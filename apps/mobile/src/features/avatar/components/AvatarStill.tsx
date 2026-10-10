import { Image } from "expo-image"
import { memo, useMemo } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { resolveAvatarStillLayers, type AvatarLoadoutCoercionHints, type AvatarStillRect } from "@blumi/domain"
import { avatarStillWindow, layoutAvatarStill, type AvatarStillCrop } from "../model/avatarStillLayout"
import { AVATAR_STILL_ASSETS } from "../stills/stillAssets"

export interface AvatarStillProps {
  /** Anyone's loadout as stored or received: resolved by the domain still resolver (total). */
  loadout: unknown
  hints?: AvatarLoadoutCoercionHints
  crop?: AvatarStillCrop
  /** An explicit window in the still's own space (overrides `crop`; AvatarPortrait's face-tight crop). */
  window?: AvatarStillRect
  width: number
  height: number
  mirror?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

/**
 * The baked 2.5D avatar as stacked images (no GPU): frame 0 of the live idle, so a still → live swap is seamless.
 * `bust` draws the small 256 px layers; `full` and `half` the sheet-size ones.
 */
export const AvatarStill = memo(function AvatarStill(props: AvatarStillProps) {
  const { loadout, hints, crop = "full", window, width, height, mirror = false } = props
  const still = useMemo(
    () => resolveAvatarStillLayers(loadout, crop === "bust" ? "bust" : "full", { hints, mirror }),
    [crop, hints, loadout, mirror]
  )
  const layout = useMemo(
    () => layoutAvatarStill(still, window ?? avatarStillWindow(still, crop), { width, height }),
    [crop, height, still, width, window]
  )
  return (
    <View
      accessible={props.accessibilityLabel !== undefined}
      accessibilityLabel={props.accessibilityLabel}
      pointerEvents="none"
      style={[{ width, height }, styles.box, mirror ? styles.mirror : null, props.style]}
    >
      {layout.frames.map((frame) => (
        <Image
          key={frame.asset}
          source={AVATAR_STILL_ASSETS[frame.asset]}
          style={{ position: "absolute", left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          contentFit="fill"
          cachePolicy="memory"
          transition={0}
        />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  box: { overflow: "hidden" },
  mirror: { transform: [{ scaleX: -1 }] }
})
