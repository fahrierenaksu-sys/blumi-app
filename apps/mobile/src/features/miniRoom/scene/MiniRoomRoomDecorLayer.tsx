import { StyleSheet, View } from "react-native"
import { RoomRenderer2D } from "../../roomV2/components/RoomRenderer2D"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
import type { InteractionState } from "./miniRoomSceneTypes"
import { RoomTapFeedback } from "./RoomTapFeedback"

interface MiniRoomRoomDecorLayerProps {
  scene: ResolvedRoomV2Scene
  interaction: InteractionState
  /** Furniture the avatar layer draws among the avatars (miniRoomDepthModel). */
  occluderIds: ReadonlySet<string>
  /** The shell and the furniture drawn here are on screen (RoomRenderer2D onSceneReady). */
  onSceneReady?: () => void
}

export function MiniRoomRoomDecorLayer(props: MiniRoomRoomDecorLayerProps) {
  const { scene, interaction, occluderIds, onSceneReady } = props

  if (!scene.shell) {
    return null
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RoomRenderer2D
        shell={scene.shell}
        renderItems={scene.renderItems}
        showDepthWash={false}
        hiddenItemRenderIds={occluderIds}
        onSceneReady={onSceneReady}
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
