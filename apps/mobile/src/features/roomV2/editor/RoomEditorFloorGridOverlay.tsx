import { memo } from "react"
import { View } from "react-native"
import {
  ROOM_EDITOR_FLOOR_SHAPE_BASE,
  type RoomEditorFloorOverlay
} from "./roomEditorFloorGridModel"
import { roomEditorFloorColors, styles } from "./roomEditorStyles"

/**
 * The floor grid while a floor piece is placed: the drawn tiles' grout lines
 * and the footprint's cells, drawn on the floor under the furniture. It
 * re-renders only when the preview moves to another cell.
 */
export const RoomEditorFloorGridOverlay = memo(function RoomEditorFloorGridOverlay(props: {
  overlay: RoomEditorFloorOverlay | undefined
}) {
  const { overlay } = props
  if (!overlay) return null
  const colors = roomEditorFloorColors[overlay.tone]
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
            styles.floorShape,
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
