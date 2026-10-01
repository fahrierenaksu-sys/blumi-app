import { StyleSheet, View } from "react-native"
import { RoomRenderer2D } from "../../roomV2/components/RoomRenderer2D"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
import type { InteractionState } from "./miniRoomSceneTypes"
import { RoomTapFeedback } from "./RoomTapFeedback"

interface MiniRoomRoomDecorLayerProps {
  scene: ResolvedRoomV2Scene
  interaction: InteractionState
}

export function MiniRoomRoomDecorLayer(props: MiniRoomRoomDecorLayerProps) {
  const { scene, interaction } = props

  if (!scene.shell) {
    return null
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RoomRenderer2D
        shell={scene.shell}
        renderItems={scene.renderItems}
        showDepthWash={false}
        testID="mini-room-saved-room-decor"
        style={styles.decorRenderer}
      />

      {interaction.pressedPoint ? (
        <RoomTapFeedback point={interaction.pressedPoint} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  decorRenderer: {
    width: "100%",
    // Let the room shell's alpha reveal the scene's pink/lavender atmosphere.
    backgroundColor: "transparent"
  }
})
