import { StyleSheet, View } from "react-native"
import { RoomRenderer2D } from "../../roomV2/components/RoomRenderer2D"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
import type { InteractionState } from "./miniRoomSceneTypes"

interface MiniRoomRoomDecorLayerProps {
  scene: ResolvedRoomV2Scene
  interaction: InteractionState
}

export function MiniRoomRoomDecorLayer(props: MiniRoomRoomDecorLayerProps) {
  const { scene, interaction } = props

  if (!scene.shell) {
    return null
  }
  const camera = scene.shell.miniRoomCamera ?? MINI_ROOM_DECOR_CAMERA_FALLBACK

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={[
          styles.decorCamera,
          { backgroundColor: camera.backgroundColor }
        ]}
      >
        <RoomRenderer2D
          shell={scene.shell}
          renderItems={scene.renderItems}
          testID="mini-room-saved-room-decor"
          style={[
            styles.decorRenderer,
            {
              width: camera.rendererWidth,
              transform: [{ translateY: camera.rendererTranslateY }]
            }
          ]}
        />
      </View>

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

const MINI_ROOM_DECOR_CAMERA_FALLBACK = {
  rendererWidth: "176%" as const,
  rendererTranslateY: 0,
  backgroundColor: "#F8ECF2"
}

const styles = StyleSheet.create({
  decorCamera: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  decorRenderer: {
    width: "176%"
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
