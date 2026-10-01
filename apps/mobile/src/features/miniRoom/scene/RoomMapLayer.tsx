import { Image, StyleSheet, View } from "react-native"
import type { InteractionState, RoomScene } from "./miniRoomSceneTypes"
import { RoomTapFeedback } from "./RoomTapFeedback"

interface RoomMapLayerProps {
  scene: RoomScene
  interaction: InteractionState
}

export function RoomMapLayer(props: RoomMapLayerProps) {
  const { scene, interaction } = props
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={scene.map.backgroundAsset}
        resizeMode="cover"
        style={styles.background}
      />

      {interaction.pressedPoint ? (
        <RoomTapFeedback point={interaction.pressedPoint} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  background: {
    width: "100%",
    height: "100%"
  }
})
