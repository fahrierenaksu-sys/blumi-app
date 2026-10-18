import type { StreetRoom } from "@blumi/contracts"
import { memo, useEffect, useMemo, type ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import Reanimated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated"
import { useReducedMotion } from "../../ui/motion"
import { AvatarStill } from "../avatar/components/AvatarStill"
import { RoomRenderer2D } from "../roomV2/components/RoomRenderer2D"
import { DEFAULT_ROOM_V2_SHELL_ID, ROOM_V2_FURNITURE_CATALOG, ROOM_V2_SHELL_CATALOG } from "../roomV2/roomV2Catalog"
import { resolveRoomV2Scene } from "../roomV2/roomV2Selectors"
import { pickStreetChibiSpot, STREET_CHIBI_SEED } from "./streetChibiSpot"

/** The production shell is 1254×714 (`room_v2_shell_blumi_world_v1`). */
const SHELL_ASPECT = 714 / 1254
/** The chibi still is 2:3 (width:height). */
const STILL_ASPECT = 2 / 3
/** The chibi's height as a share of the room's height, the same in every window and the peek. */
export const STREET_CHIBI_ROOM_SHARE = 0.25
/** The chibi's feet sit near the bottom of the window. */
const FEET_RATIO = 0.92

/**
 * One match's room cropped around their chibi. The room is drawn from its saved layout by the production renderer and
 * bundled furniture art; the chibi is the bundled full still, standing on free floor and drawn in the room's depth
 * order, so a pouf or armchair in front covers it instead of the chibi standing on top of it (`pickStreetChibiSpot`).
 * Nothing is drawn in code. `roomWidth` sets the zoom: a window shows about a fifth of the room, the peek about half.
 */
export const StreetRoomScene = memo(function StreetRoomScene(props: {
  room: StreetRoom | null
  avatar: { loadout?: unknown } | null
  width: number
  height: number
  roomWidth: number
  /** Notes prototype: the chibi gives one small hop when the window opens, as if saying its note. */
  greet?: boolean
  /** Drawn just above the chibi's head (the peek's note bubble), centred on it as far as the scene allows. */
  overHead?: ReactNode
}) {
  const { room, avatar, width, height, roomWidth, greet = false, overHead } = props
  const roomHeight = roomWidth * SHELL_ASPECT
  const chibiHeight = roomHeight * STREET_CHIBI_ROOM_SHARE
  const chibiWidth = chibiHeight * STILL_ASPECT
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
  const spot = useMemo(() => scene?.shell ? pickStreetChibiSpot({
    shell: scene.shell,
    renderItems: scene.renderItems,
    chibi: { width: chibiWidth / roomWidth, height: STREET_CHIBI_ROOM_SHARE }
  }) : null, [chibiWidth, roomWidth, scene])
  const foot = spot?.foot ?? STREET_CHIBI_SEED
  const footX = roomWidth * foot.x
  const footY = roomHeight * foot.y
  // centred on the chibi's feet, but never past the room's edges
  const roomLeft = clamp(width / 2 - footX, width - roomWidth, 0)
  const roomTop = clamp(height * FEET_RATIO - footY, height - roomHeight, 0)
  const drawChibi = (left: number, top: number) => avatar ? (
    <Reanimated.View style={[{ position: "absolute", left, top }, hop]}>
      <AvatarStill loadout={avatar.loadout} width={chibiWidth} height={chibiHeight} />
    </Reanimated.View>
  ) : null
  const chibi = drawChibi(footX - chibiWidth / 2, footY - chibiHeight)
  return (
    <View style={[styles.clip, { width, height }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {scene?.shell ? (
        <View style={{ position: "absolute", width: roomWidth, height: roomHeight, left: roomLeft, top: roomTop }}>
          <RoomRenderer2D
            shell={scene.shell}
            renderItems={scene.renderItems}
            motionEnabled={false}
            style={{ width: roomWidth, height: roomHeight }}
            depthSlot={chibi ? { beforeRenderId: spot?.beforeRenderId ?? null, node: chibi } : undefined}
          />
        </View>
      ) : drawChibi((width - chibiWidth) / 2, height * FEET_RATIO - chibiHeight)}
      {overHead && scene?.shell ? (
        <View
          style={[styles.overHead, {
            height: Math.max(0, roomTop + footY - chibiHeight - OVER_HEAD_GAP),
            transform: [{ translateX: clamp(roomLeft + footX - width / 2, -width * OVER_HEAD_SHIFT, width * OVER_HEAD_SHIFT) }]
          }]}
        >
          {overHead}
        </View>
      ) : null}
    </View>
  )
})

/** Space between the head and what is drawn over it, and how far off-centre it may follow the chibi. */
const OVER_HEAD_GAP = 2
const OVER_HEAD_SHIFT = 0.2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

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
  clip: { overflow: "hidden", backgroundColor: "#F5ECFA" },
  overHead: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 14, alignItems: "center", justifyContent: "flex-end" }
})
