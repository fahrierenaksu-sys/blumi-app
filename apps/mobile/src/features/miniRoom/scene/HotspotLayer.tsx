import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native"
import type { InteractionState, RoomHotspot } from "./miniRoomSceneTypes"

interface HotspotLayerProps {
  hotspots: RoomHotspot[]
  interaction: InteractionState
  stageWidth: number
  stageHeight: number
  /** `alternatives`: the other seats of the same piece, nearest to the tap first. */
  onSelect: (hotspotId: string, alternatives?: readonly string[]) => void
  disabled: boolean
}

interface PadRect {
  left: number
  top: number
  width: number
  height: number
}

function getPadRect(hotspot: RoomHotspot, stageWidth: number, stageHeight: number): PadRect {
  const width = (hotspot.padWidth ?? 0.18) * stageWidth
  const height = (hotspot.padHeight ?? 0.08) * stageHeight
  const centre = hotspot.padCentre ?? hotspot
  return { left: centre.x * stageWidth - width / 2, top: centre.y * stageHeight - height / 2, width, height }
}

export function HotspotLayer(props: HotspotLayerProps) {
  const { hotspots, interaction, onSelect, disabled, stageWidth, stageHeight } = props
  if (stageWidth <= 0 || stageHeight <= 0) return null
  // Seats of one piece (layered furniture) share one pad: their own pads overlap.
  const groups = new Map<string, RoomHotspot[]>()
  for (const hotspot of hotspots) {
    if (!hotspot.groupId) continue
    groups.set(hotspot.groupId, [...(groups.get(hotspot.groupId) ?? []), hotspot])
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hotspots.map((hotspot) => {
        const group = hotspot.groupId ? groups.get(hotspot.groupId) : undefined
        if (group && group.length > 1) {
          return group[0] === hotspot ? (
            <HotspotGroupPad
              key={`group:${hotspot.groupId}`}
              members={group}
              selected={group.some((member) => member.id === interaction.selectedHotspotId)}
              onSelect={onSelect}
              disabled={disabled}
              stageWidth={stageWidth}
              stageHeight={stageHeight}
            />
          ) : null
        }
        return (
          <HotspotPad
            key={hotspot.id}
            hotspot={hotspot}
            selected={interaction.selectedHotspotId === hotspot.id}
            onSelect={onSelect}
            disabled={disabled}
            {...getPadRect(hotspot, stageWidth, stageHeight)}
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

/**
 * One pad over every seat of a piece: the union of the seats' own pads. A tap lists the seats nearest first by
 * their pad centres (her hip on each seat), so tapping the left half of a sofa means its left seat.
 */
function HotspotGroupPad(props: {
  members: readonly RoomHotspot[]
  selected: boolean
  onSelect: (hotspotId: string, alternatives?: readonly string[]) => void
  disabled: boolean
  stageWidth: number
  stageHeight: number
}) {
  const { members, selected, onSelect, disabled, stageWidth, stageHeight } = props
  const rects = members.map((member) => getPadRect(member, stageWidth, stageHeight))
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const width = Math.max(...rects.map((rect) => rect.left + rect.width)) - left
  const height = Math.max(...rects.map((rect) => rect.top + rect.height)) - top
  const handlePress = (event: GestureResponderEvent) => {
    // Childless, so the location is inside this pad.
    const x = left + event.nativeEvent.locationX
    const y = top + event.nativeEvent.locationY
    const ordered = members
      .map((member, index) => ({
        id: member.id,
        distance: Math.hypot(rects[index]!.left + rects[index]!.width / 2 - x, rects[index]!.top + rects[index]!.height / 2 - y)
      }))
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.id)
    onSelect(ordered[0]!, ordered.slice(1))
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={members[0]?.label ?? `${members[0]?.kind ?? "seat"} spot`}
      accessibilityState={{ disabled, selected }}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.padAnchor, { left, top, width, height }]}
    />
  )
}

const styles = StyleSheet.create({
  padAnchor: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center"
  }
})
