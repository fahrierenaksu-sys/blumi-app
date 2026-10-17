import { memo, useMemo } from "react"
import { StyleSheet, View } from "react-native"
import { RoomPetFlipbook } from "../roomPet/RoomPetFlipbook"
import type { RoomPetDraw } from "../roomPet/roomPetRoomScene"
import type { RoomPetClipName } from "../roomPet/roomPetSprite"
import { ROOM_PET_CAT_WHITE_SHEET } from "../roomPet/sheet/roomPetCatWhiteSheetSource"

/** The cell fills this share of the box, so the drawn cat keeps its art margins. */
const CELL_SHARE = 0.8
const CANVAS = Object.freeze({
  width: ROOM_PET_CAT_WHITE_SHEET.layout.cellHeightShellPx / CELL_SHARE,
  height: ROOM_PET_CAT_WHITE_SHEET.layout.cellHeightShellPx / CELL_SHARE
})

/**
 * The approved white cat from the room pet sheet, standing in a box of its
 * own (postcard, collar tag). Same atlas and flipbook as in the room.
 */
const BOX_FOOT = { x: 0.5, y: 0.92 }

export const CatSprite = memo(function CatSprite(props: {
  clip: RoomPetClipName
  size: number
  onTap?: () => void
  testID?: string
}) {
  const { clip, size, onTap, testID } = props
  const draw: RoomPetDraw = useMemo(() => ({
    foot: BOX_FOOT,
    clip,
    heading: 135,
    mirrored: false,
    emote: clip === "sleep" ? "zzz" : clip === "greet" || clip === "happy" ? "heart" : null,
    beforeRenderId: null,
    moveMs: 0,
    /** A hop clip jumps in place inside the box. */
    hop: clip === "hopUp" || clip === "hopDown" || clip === "hopPlay" ? { from: BOX_FOOT, to: BOX_FOOT } : null
  }), [clip])
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <RoomPetFlipbook draw={draw} sheet={ROOM_PET_CAT_WHITE_SHEET} canvasSize={CANVAS} onTap={onTap ?? noop} testID={testID} />
    </View>
  )
})

function noop() {}

const styles = StyleSheet.create({
  box: { position: "relative" }
})
