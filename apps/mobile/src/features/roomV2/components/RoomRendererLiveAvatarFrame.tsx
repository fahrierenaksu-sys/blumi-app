import { createContext, useContext, type ReactNode } from "react"
import type { StyleProp, ViewProps, ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated"
import { getRoomV2LiveAvatarFrame } from "../roomV2RenderSurface"

/** A live, UI-thread avatar point for one avatar render item. */
export interface RoomRendererLiveAvatarPosition {
  renderId: string
  x: SharedValue<number>
  y: SharedValue<number>
  /** The current walk's path (start point, then each corner and the end), set when a walk starts. */
  walkPath?: SharedValue<readonly { x: number; y: number }[]>
}

/** Stable avatar box dimensions and its live point on the stage. */
export interface RoomRendererLiveAvatarLayout {
  live: RoomRendererLiveAvatarPosition
  width: number
  height: number
  anchorX: number
  anchorY: number
  stageWidthPx: number
  stageHeightPx: number
}

export const RoomRendererLiveAvatarLayoutContext = createContext<RoomRendererLiveAvatarLayout | undefined>(undefined)

/**
 * The avatar item's frame always starts at the stage origin and moves to
 * the live point with a UI-thread transform. A React step/depth commit cannot
 * relocate its layout underneath an older transform. It takes the wrapper's
 * props so the renderer can use
 * it in place of `View`; press-only props are dropped like `View` drops them.
 */
export function RoomRendererLiveAvatarFrame(props: ViewProps & {
  style?: StyleProp<ViewStyle>
  children?: ReactNode
  delayLongPress?: number
  onLongPress?: unknown
  onPress?: unknown
  onPressOut?: unknown
}) {
  const {
    style,
    delayLongPress: _delayLongPress,
    onLongPress: _onLongPress,
    onPress: _onPress,
    onPressOut: _onPressOut,
    ...viewProps
  } = props
  // The renderer only picks this frame when it provides the layout.
  const { live, width, height, anchorX, anchorY, stageWidthPx, stageHeightPx } = useContext(RoomRendererLiveAvatarLayoutContext)!
  const liveX = live.x
  const liveY = live.y
  const offsetStyle = useAnimatedStyle(() => {
    const offset = getRoomV2LiveAvatarFrame({
      liveX: liveX.value,
      liveY: liveY.value,
      width,
      height,
      anchorX,
      anchorY,
      stageWidthPx,
      stageHeightPx
    })
    return {
      transform: [
        { translateX: offset.translateX },
        { translateY: offset.translateY },
        { scale: offset.scale }
      ]
    }
  })
  return <Animated.View {...viewProps} style={[style, {
    left: 0,
    top: 0,
    width: width * stageWidthPx,
    height: height * stageHeightPx
  }, offsetStyle]} />
}
