import type { StreetRoom } from "@blumi/contracts"
import { memo, useEffect, useMemo } from "react"
import { StyleSheet, View } from "react-native"
import Reanimated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated"
import { useReducedMotion } from "../../ui/motion"
import { AvatarStill } from "../avatar/components/AvatarStill"
import { RoomRenderer2D } from "../roomV2/components/RoomRenderer2D"
import { DEFAULT_ROOM_V2_SHELL_ID, ROOM_V2_FURNITURE_CATALOG, ROOM_V2_SHELL_CATALOG } from "../roomV2/roomV2Catalog"
import { resolveRoomV2Scene } from "../roomV2/roomV2Selectors"

/** The production shell is 1254×714 (`room_v2_shell_blumi_world_v1`). */
const SHELL_ASPECT = 714 / 1254
/** The portrait spot: the floor cell in front of the room's centre, as a fraction of the shell. */
const PORTRAIT_SPOT = { x: 0.5, y: 0.66 }
/** The chibi still is 2:3 (width:height). */
const STILL_ASPECT = 2 / 3
/** The chibi's feet sit near the bottom of the window. */
const FEET_RATIO = 0.92

/**
 * One match's room cropped around the portrait spot, with their chibi standing on it. The room is drawn from its saved
 * layout by the production renderer and bundled furniture art; the chibi is the bundled full still. Nothing is drawn
 * in code. `roomWidth` sets the zoom: a window shows about a fifth of the room, the peek about half.
 */
export const StreetRoomScene = memo(function StreetRoomScene(props: {
  room: StreetRoom | null
  avatar: { loadout?: unknown } | null
  width: number
  height: number
  roomWidth: number
  chibiHeight: number
  /** Notes prototype: the chibi gives one small hop when the window opens, as if saying its note. */
  greet?: boolean
}) {
  const { room, avatar, width, height, roomWidth, chibiHeight, greet = false } = props
  const hop = useGreetHop(greet, chibiHeight)
  const scene = useMemo(() => room ? resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
    decor: {
      roomShellId: room.roomShellId,
      placedItems: room.placedItems.map((item, index) => ({ ...item, instanceId: `street_${index}` }))
    },
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  }) : null, [room])
  const roomHeight = roomWidth * SHELL_ASPECT
  const spotX = roomWidth * PORTRAIT_SPOT.x
  const spotY = roomHeight * PORTRAIT_SPOT.y
  const feetY = height * FEET_RATIO
  const chibiWidth = chibiHeight * STILL_ASPECT
  return (
    <View style={[styles.clip, { width, height }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {scene?.shell ? (
        <View style={{ position: "absolute", width: roomWidth, height: roomHeight, left: width / 2 - spotX, top: feetY - spotY }}>
          <RoomRenderer2D shell={scene.shell} renderItems={scene.renderItems} motionEnabled={false} style={{ width: roomWidth, height: roomHeight }} />
        </View>
      ) : null}
      {avatar ? (
        <Reanimated.View style={[{ position: "absolute", left: (width - chibiWidth) / 2, top: feetY - chibiHeight }, hop]}>
          <AvatarStill loadout={avatar.loadout} width={chibiWidth} height={chibiHeight} />
        </Reanimated.View>
      ) : null}
    </View>
  )
})

const GREET_HOP = { heightShare: 0.06, delayMs: 450, upMs: 160, downMs: 220 } as const

/** One small hop, a beat after the window appears; none under Reduce Motion. */
function useGreetHop(greet: boolean, chibiHeight: number) {
  const reduceMotion = useReducedMotion()
  const lift = useSharedValue(0)
  useEffect(() => {
    if (!greet || reduceMotion) return
    lift.value = withDelay(GREET_HOP.delayMs, withSequence(
      withTiming(-chibiHeight * GREET_HOP.heightShare, { duration: GREET_HOP.upMs }),
      withTiming(0, { duration: GREET_HOP.downMs })
    ))
  }, [chibiHeight, greet, lift, reduceMotion])
  return useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }))
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden", backgroundColor: "#F5ECFA" }
})
