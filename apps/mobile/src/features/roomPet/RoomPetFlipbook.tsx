import { Image as ExpoImage } from "expo-image"
import { memo, useEffect } from "react"
import { Pressable, StyleSheet, Text, type ImageSourcePropType } from "react-native"
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"

import { useReducedMotion } from "../../ui/animations"
import type { RoomPetDraw } from "./roomPetRoomScene"
import { getRoomPetSpriteCell, type RoomPetSpriteSheetLayout } from "./roomPetSprite"

/** The pet's drawn cell height in shell pixels (the pet itself fills about two thirds of it). */
const ROOM_PET_CELL_SHELL_PX = 64
const EMOTE_GLYPH: Readonly<Record<NonNullable<RoomPetDraw["emote"]>, string>> = {
  heart: "♥",
  zzz: "z",
  sparkle: "✦"
}

export interface RoomPetFlipbookProps {
  readonly draw: RoomPetDraw
  readonly sheet: { readonly source: ImageSourcePropType; readonly layout: RoomPetSpriteSheetLayout }
  readonly canvasSize: { readonly width: number; readonly height: number }
  readonly onTap: () => void
  readonly testID?: string
}

/**
 * The room pet as a flipbook: one cell of the sheet shown through a clipped
 * box. Position and frame both run on the UI thread; React renders only when
 * the engine's drawing changes. Its tap target is its own drawn cell.
 */
export const RoomPetFlipbook = memo(function RoomPetFlipbook(props: RoomPetFlipbookProps) {
  const { draw, sheet, canvasSize, onTap, testID } = props
  const { layout } = sheet
  const reduceMotion = useReducedMotion()
  const widthFraction = (ROOM_PET_CELL_SHELL_PX * (layout.cellWidth / layout.cellHeight)) / canvasSize.width
  const heightFraction = ROOM_PET_CELL_SHELL_PX / canvasSize.height
  const footX = useSharedValue(draw.foot.x)
  const footY = useSharedValue(draw.foot.y)
  const clipElapsedMs = useSharedValue(0)
  const clip = layout.clips[draw.clip]
  const frames = clip.frames[draw.heading]
  const clipDurationMs = (frames.length * 1000) / clip.fps

  useEffect(() => {
    const timing = { duration: reduceMotion ? 0 : draw.moveMs, easing: Easing.linear }
    footX.value = draw.moveMs > 0 && !reduceMotion ? withTiming(draw.foot.x, timing) : draw.foot.x
    footY.value = draw.moveMs > 0 && !reduceMotion ? withTiming(draw.foot.y, timing) : draw.foot.y
  }, [draw.foot.x, draw.foot.y, draw.moveMs, footX, footY, reduceMotion])

  useEffect(() => {
    clipElapsedMs.value = 0
    if (reduceMotion) return
    const run = withTiming(clipDurationMs, { duration: clipDurationMs, easing: Easing.linear })
    clipElapsedMs.value = clip.loop ? withRepeat(run, -1, false) : run
  }, [clip.loop, clipDurationMs, clipElapsedMs, draw.clip, draw.heading, reduceMotion])

  const placeStyle = useAnimatedStyle(() => ({
    left: `${(footX.value - widthFraction / 2) * 100}%`,
    top: `${(footY.value - heightFraction * layout.footAnchorY) * 100}%`
  }))
  const frameStyle = useAnimatedStyle(() => {
    const cell = getRoomPetSpriteCell(frames, clip.fps, clip.loop, clipElapsedMs.value)
    return {
      left: `${-(cell % layout.columns) * 100}%`,
      top: `${-Math.floor(cell / layout.columns) * 100}%`
    }
  })

  return (
    <Reanimated.View
      testID={testID}
      style={[styles.place, { width: `${widthFraction * 100}%`, height: `${heightFraction * 100}%` }, placeStyle]}
    >
      <Pressable onPress={onTap} style={[styles.cell, draw.mirrored ? styles.mirrored : null]}>
        <Reanimated.View
          pointerEvents="none"
          style={[styles.sheet, { width: `${layout.columns * 100}%`, height: `${layout.rows * 100}%` }, frameStyle]}
        >
          <ExpoImage source={sheet.source} contentFit="fill" transition={0} style={StyleSheet.absoluteFill} />
        </Reanimated.View>
      </Pressable>
      {draw.emote ? (
        <Text pointerEvents="none" style={styles.emote}>{EMOTE_GLYPH[draw.emote]}</Text>
      ) : null}
    </Reanimated.View>
  )
})

const styles = StyleSheet.create({
  place: { position: "absolute" },
  cell: { flex: 1, overflow: "hidden" },
  mirrored: { transform: [{ scaleX: -1 }] },
  sheet: { position: "absolute" },
  emote: { position: "absolute", top: -14, alignSelf: "center", fontSize: 14, color: "#D92A79" }
})
