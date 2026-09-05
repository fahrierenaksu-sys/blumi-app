import { Image, StyleSheet, View } from "react-native"
import type { InteractionState, RoomScene } from "./miniRoomSceneTypes"

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
        <View
          style={[
            styles.tapTarget,
            {
              left: `${interaction.pressedPoint.x * 100}%`,
              top: `${interaction.pressedPoint.y * 100}%`
            }
          ]}
        >
          <View style={styles.tapTargetRingOuter} />
          <View style={styles.tapTargetRingInner} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  background: {
    width: "100%",
    height: "100%"
  },
  tapTarget: {
    position: "absolute",
    width: 48,
    height: 22,
    marginLeft: -24,
    marginTop: -11,
    alignItems: "center",
    justifyContent: "center"
  },
  tapTargetRingOuter: {
    position: "absolute",
    width: 48,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255, 79, 152, 0.55)",
    backgroundColor: "rgba(255, 79, 152, 0.12)"
  },
  tapTargetRingInner: {
    width: 14,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255, 79, 152, 0.85)"
  }
})
