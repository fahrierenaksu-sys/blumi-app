import { Image as ExpoImage } from "expo-image"
import { memo, useEffect } from "react"
import { Pressable, StyleSheet, Text, type ImageSourcePropType } from "react-native"
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"

import { useReducedMotion } from "../../ui/animations"
import type { RoomPetDraw } from "./roomPetRoomScene"
import {
  getRoomPetClipDurationMs,
  getRoomPetClipFrameIndex,
  getRoomPetRootMotionFoot,
  getRoomPetSpriteCell,
  type RoomPetSpriteSheetLayout
} from "./roomPetSprite"

/** A looping clip's frame clock runs this long before it restarts (the worklet wraps the frames itself). */
const ROOM_PET_LOOP_CLOCK_MS = 60 * 60 * 1000
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
  const widthFraction = (layout.cellHeightShellPx * (layout.cellWidth / layout.cellHeight)) / canvasSize.width
  const heightFraction = layout.cellHeightShellPx / canvasSize.height
  const footX = useSharedValue(draw.foot.x)
  const footY = useSharedValue(draw.foot.y)
  const clipElapsedMs = useSharedValue(0)
  const clip = layout.clips[draw.clip]
  const frames = clip.frames[draw.heading]
  const clipDurationMs = getRoomPetClipDurationMs(clip)
  /** A hop moves the feet by the clip's root motion; with reduced motion the pet is simply placed where the hop ends. */
  const hopPath = draw.hop && clip.rootMotion && !reduceMotion ? { ...draw.hop, motion: clip.rootMotion } : null
  const shellPxToStage = 1 / canvasSize.height

  useEffect(() => {
    const timing = { duration: reduceMotion ? 0 : draw.moveMs, easing: Easing.linear }
    footX.value = draw.moveMs > 0 && !reduceMotion ? withTiming(draw.foot.x, timing) : draw.foot.x
    footY.value = draw.moveMs > 0 && !reduceMotion ? withTiming(draw.foot.y, timing) : draw.foot.y
  }, [draw.foot.x, draw.foot.y, draw.moveMs, footX, footY, reduceMotion])

  useEffect(() => {
    clipElapsedMs.value = 0
    if (reduceMotion) return
    const runMs = clip.loop ? ROOM_PET_LOOP_CLOCK_MS : clipDurationMs
    const run = withTiming(runMs, { duration: runMs, easing: Easing.linear })
    clipElapsedMs.value = clip.loop ? withRepeat(run, -1, false) : run
  }, [clip.loop, clipDurationMs, clipElapsedMs, draw.clip, draw.heading, reduceMotion])

  const placeStyle = useAnimatedStyle(() => {
    const foot = hopPath
      ? getRoomPetRootMotionFoot(
          hopPath.from,
          hopPath.to,
          hopPath.motion,
          getRoomPetClipFrameIndex(frames.length, clip.fps, clipElapsedMs.value),
          shellPxToStage
        )
      : { x: footX.value, y: footY.value }
    return {
      left: `${(foot.x - widthFraction / 2) * 100}%`,
      top: `${(foot.y - heightFraction * layout.footAnchorY) * 100}%`
    }
  })
  const frameStyle = useAnimatedStyle(() => {
    const cell = getRoomPetSpriteCell(frames, clip.fps, clip.loop, clipElapsedMs.value, clip.loopFrom)
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
      <Pressable onPress={onTap} accessibilityRole="button" accessibilityLabel="Kedi" style={[styles.cell, draw.mirrored ? styles.mirrored : null]}>
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
