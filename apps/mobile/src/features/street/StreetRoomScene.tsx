import type { StreetRoom } from "@blumi/contracts"
import { memo, useMemo } from "react"
import { StyleSheet, View } from "react-native"
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
const DEFAULT_FEET_RATIO = 0.92

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
  /** Where the chibi's feet sit, as a fraction of the height; above 1 crops to the head and shoulders. */
  feetRatio?: number
}) {
  const { room, avatar, width, height, roomWidth, chibiHeight, feetRatio = DEFAULT_FEET_RATIO } = props
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
  const feetY = height * feetRatio
  const chibiWidth = chibiHeight * STILL_ASPECT
  return (
    <View style={[styles.clip, { width, height }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {scene?.shell ? (
        <View style={{ position: "absolute", width: roomWidth, height: roomHeight, left: width / 2 - spotX, top: feetY - spotY }}>
          <RoomRenderer2D shell={scene.shell} renderItems={scene.renderItems} motionEnabled={false} style={{ width: roomWidth, height: roomHeight }} />
        </View>
      ) : null}
      {avatar ? (
        <AvatarStill
          loadout={avatar.loadout}
          width={chibiWidth}
          height={chibiHeight}
          style={{ position: "absolute", left: (width - chibiWidth) / 2, top: feetY - chibiHeight }}
        />
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  clip: { overflow: "hidden", backgroundColor: "#F5ECFA" }
})
