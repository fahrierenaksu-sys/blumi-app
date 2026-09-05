import { Pressable, StyleSheet, View } from "react-native"
import type { InteractionState, RoomHotspot } from "./miniRoomSceneTypes"

interface HotspotLayerProps {
  hotspots: RoomHotspot[]
  interaction: InteractionState
  stageWidth: number
  stageHeight: number
  onSelect: (hotspotId: string) => void
  disabled: boolean
}

export function HotspotLayer(props: HotspotLayerProps) {
  const { hotspots, interaction, onSelect, disabled, stageWidth, stageHeight } = props
  if (stageWidth <= 0 || stageHeight <= 0) return null
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hotspots.map((hotspot) => {
        const padW = (hotspot.padWidth ?? 0.18) * stageWidth
        const padH = (hotspot.padHeight ?? 0.08) * stageHeight
        const left = hotspot.x * stageWidth - padW / 2
        const top = hotspot.y * stageHeight - padH / 2
        return (
          <HotspotPad
            key={hotspot.id}
            hotspot={hotspot}
            selected={interaction.selectedHotspotId === hotspot.id}
            onSelect={onSelect}
            disabled={disabled}
            left={left}
            top={top}
            width={padW}
            height={padH}
          />
        )
      })}
    </View>
  )
}

interface HotspotPadProps {
  hotspot: RoomHotspot
  selected: boolean
  onSelect: (hotspotId: string) => void
  disabled: boolean
  left: number
  top: number
  width: number
  height: number
}

function HotspotPad(props: HotspotPadProps) {
  const { hotspot, selected, onSelect, disabled, left, top, width, height } = props
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hotspot.label ?? `${hotspot.kind} spot`}
      accessibilityState={{ disabled, selected }}
      onPress={() => onSelect(hotspot.id)}
      disabled={disabled}
      hitSlop={6}
      style={[
        styles.padAnchor,
        {
          left,
          top,
          width,
          height
        }
      ]}
    >
    </Pressable>
  )
}

const styles = StyleSheet.create({
  padAnchor: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center"
  }
})
