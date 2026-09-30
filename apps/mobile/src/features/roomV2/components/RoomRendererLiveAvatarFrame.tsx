import { createContext, useContext, type ReactNode } from "react"
import type { StyleProp, ViewProps, ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated"
import { getRoomV2LiveAvatarOffset } from "../roomV2RenderSurface"

/** A live, UI-thread avatar point for one avatar render item. */
export interface RoomRendererLiveAvatarPosition {
  renderId: string
  x: SharedValue<number>
  y: SharedValue<number>
}

/** Where React laid the avatar item out, so the frame can offset from it. */
export interface RoomRendererLiveAvatarLayout {
  live: RoomRendererLiveAvatarPosition
  baseX: number
  baseY: number
  width: number
  height: number
  anchorX: number
  anchorY: number
  stageWidthPx: number
  stageHeightPx: number
}

export const RoomRendererLiveAvatarLayoutContext = createContext<RoomRendererLiveAvatarLayout | undefined>(undefined)

/**
 * The avatar item's frame, laid out by React at the item's base point and
 * moved to the live point with a UI-thread transform. React re-renders only
 * when the base point changes (step boundaries, depth changes), never per
 * frame of a walk. It takes the item wrapper's props so the renderer can use
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
  const { live, baseX, baseY, width, height, anchorX, anchorY, stageWidthPx, stageHeightPx } = useContext(RoomRendererLiveAvatarLayoutContext)!
  const liveX = live.x
  const liveY = live.y
  const offsetStyle = useAnimatedStyle(() => {
    const offset = getRoomV2LiveAvatarOffset({
      baseX,
      baseY,
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
  return <Animated.View {...viewProps} style={[style, offsetStyle]} />
}
