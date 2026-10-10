import { memo } from "react"
import { View } from "react-native"
import {
  ROOM_EDITOR_FLOOR_SHAPE_BASE,
  type RoomEditorFloorOverlay
} from "./roomEditorFloorGridModel"
import {
  roomEditorFloorColors,
  roomEditorFloorDiamondColors,
  roomEditorWallStripColors,
  styles
} from "./roomEditorStyles"

/**
 * The floor grid while a floor piece is placed: the drawn tiles' grout lines
 * and the footprint's cells, drawn on the floor under the furniture. In the
 * 2.5D room a wall piece instead lights a soft strip of the wall
 * it hangs on. It re-renders only when the preview moves to another cell.
 */
export const RoomEditorFloorGridOverlay = memo(function RoomEditorFloorGridOverlay(props: {
  overlay: RoomEditorFloorOverlay | undefined
}) {
  const { overlay } = props
  if (!overlay) return null
  const colors = overlay.calibrated || overlay.tone === "selected"
    ? roomEditorFloorDiamondColors[overlay.tone]
    : roomEditorFloorColors[overlay.tone]
  const strip = overlay.wallStrip
  if (strip) {
    const stripColors = roomEditorWallStripColors[overlay.tone]
    return (
      <View pointerEvents="none" style={styles.floorOverlay}>
        <View
          style={[
            styles.wallStrip,
            {
              left: strip.shape.left,
              top: strip.shape.top,
              width: ROOM_EDITOR_FLOOR_SHAPE_BASE,
              height: ROOM_EDITOR_FLOOR_SHAPE_BASE,
              backgroundColor: stripColors.fill,
              transform: [{ matrix: strip.shape.matrix }]
            }
          ]}
        />
        <View
          style={[
            styles.wallStripBase,
            {
              left: strip.base.left,
              top: strip.base.top,
              width: strip.base.width,
              backgroundColor: stripColors.edge,
              transform: [{ rotate: `${strip.base.rotateRad}rad` }]
            }
          ]}
        />
      </View>
    )
  }
  return (
    <View pointerEvents="none" style={styles.floorOverlay}>
      {overlay.lines.map((line) => (
        <View
          key={line.key}
          style={[
            styles.floorLine,
            {
              left: line.left,
              top: line.top,
              width: line.width,
              transform: [{ rotate: `${line.rotateRad}rad` }]
            }
          ]}
        />
      ))}
      {overlay.cells.map((cell) => (
        <View
          key={cell.key}
          style={[
            overlay.calibrated ? styles.floorDiamond : styles.floorShape,
            {
              left: cell.left,
              top: cell.top,
              width: ROOM_EDITOR_FLOOR_SHAPE_BASE,
              height: ROOM_EDITOR_FLOOR_SHAPE_BASE,
              backgroundColor: colors.fill,
              borderColor: colors.edge,
              transform: [{ matrix: cell.matrix }]
            }
          ]}
        />
      ))}
    </View>
  )
})
