import { MINI_ROOM_FLOOR } from "@blumi/domain"
import { roomV2ProductionAssets as roomV2Assets } from "./roomV2ProductionAssets"
import { ROOM_V2_APPROVED_MY_ROOM_CAMERA } from "./roomV2Camera"
import { ROOM_V2_BLUMI_WORLD_FLOOR_GRID } from "./roomV2FloorGrid"
import { roomAvatar25d } from "../../features/avatar/roomAvatarSeam"
import type { FurnitureItem, RoomShell } from "./roomV2.types"

export const DEFAULT_ROOM_V2_SHELL_ID =
  "room_v2_shell_blumi_world_v1"

const BASE_ROOM_V2_SHELL_CATALOG: RoomShell[] = [
  {
    id: DEFAULT_ROOM_V2_SHELL_ID,
    name: "Blumi Home",
    asset: roomV2Assets.shells.blumiWorldShellV1,
    canvasSize: { width: 1254, height: 714 },
    myRoomCamera: { ...ROOM_V2_APPROVED_MY_ROOM_CAMERA },
    miniRoomCamera: {
      rendererWidth: "176%",
      rendererTranslateY: -10,
      backgroundColor: "#F8ECF2"
    },
    // Rectangular bounds stay useful for edit placement and lane snapping.
    placeableArea: {
      minX: 0.22,
      maxX: 0.78,
      minY: 0.45,
      maxY: 0.88
    },
    surfacePlacementAreas: {
      // The calibrated wall band includes the full height of tall mirrors and
      // curtain panels while keeping the shell's floor and ceiling bands out
      // of the placement surface.
      wall: { minX: 0.18, maxX: 0.76, minY: 0.08, maxY: 0.56 },
      ceiling: { minX: 0.2, maxX: 0.8, minY: 0.04, maxY: 0.18 }
    },
    surfacePlacementExclusions: {
      // The baked arched window is part of the shell and cannot accept a
      // clock, artwork, mirror, or other wall-mounted prop.
      wall: [{ minX: 0.33, maxX: 0.43, minY: 0.2, maxY: 0.46 }]
    },
    walkablePolygon: MINI_ROOM_FLOOR,
    floorGrid: ROOM_V2_BLUMI_WORLD_FLOOR_GRID,
    // Measured on the shell art: the arched door's threshold on the back-left
    // wall, and the first walkable tile in front of it.
    entry: {
      door: { x: 0.169, y: 0.572 },
      doorstep: { x: 0.215, y: 0.62 }
    },
    placementLanes: [
      {
        id: "room_v2_world_lane_wall",
        label: "Wall line",
        y: 0.54,
        minX: 0.26,
        maxX: 0.74,
        snapRadius: 0.035
      },
      {
        id: "room_v2_world_lane_mid",
        label: "Middle",
        y: 0.66,
        minX: 0.24,
        maxX: 0.76,
        snapRadius: 0.045
      },
      {
        id: "room_v2_world_lane_social",
        label: "Social",
        y: 0.76,
        minX: 0.25,
        maxX: 0.75,
        snapRadius: 0.045
      },
      {
        id: "room_v2_world_lane_front",
        label: "Front",
        y: 0.86,
        minX: 0.28,
        maxX: 0.72,
        snapRadius: 0.04
      }
    ]
  }
]

// Runtime deliberately exposes only the approved Blumi Home shell. Candidate
// generation and promotion validation stay offline until immutable visual,
// geometry, Simulator, and independent-review evidence is complete.
export const ROOM_V2_SHELL_CATALOG: RoomShell[] = BASE_ROOM_V2_SHELL_CATALOG

// The furniture is the layered 2.5D catalog from the room seam (empty in plain Node tests without the seam).
// The old flat pieces were retired in X8; their ids stay in the legacy registry and are never reused.
export const ROOM_V2_FURNITURE_CATALOG: FurnitureItem[] = [...roomAvatar25d.furnitureCatalog]
