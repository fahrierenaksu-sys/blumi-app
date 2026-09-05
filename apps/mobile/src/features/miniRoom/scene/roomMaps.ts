import { miniRoomAssets } from "./miniRoomAssets"
import type { RoomScene } from "./miniRoomSceneTypes"

export const cozyPinkBedroomScene: RoomScene = {
  sceneId: "cozy_pink_bedroom_v1",
  map: {
    mapId: "cozy_pink_bedroom",
    backgroundAsset: miniRoomAssets.rooms.cozyPinkBedroom,
    width: 1254,
    height: 1254,
    safeInsets: {
      top: 0.14,
      bottom: 0.13,
      left: 0.08,
      right: 0.08
    },
    walkableAreas: [
      {
        id: "main_floor",
        points: [
          { x: 0.10, y: 0.64 },
          { x: 0.28, y: 0.46 },
          { x: 0.52, y: 0.42 },
          { x: 0.76, y: 0.48 },
          { x: 0.88, y: 0.60 },
          { x: 0.78, y: 0.82 },
          { x: 0.42, y: 0.90 },
          { x: 0.18, y: 0.80 }
        ]
      }
    ]
  },
  spawnPoints: [
    {
      id: "local_spawn",
      role: "local",
      x: 0.38,
      y: 0.74,
      facing: "right"
    },
    {
      id: "partner_spawn",
      role: "partner",
      x: 0.60,
      y: 0.72,
      facing: "left"
    }
  ],
  hotspots: [
    {
      id: "rug_meet",
      kind: "stand",
      x: 0.50,
      y: 0.72,
      label: "Together",
      approachPoint: { x: 0.50, y: 0.72 },
      facingOnArrival: "front",
      padWidth: 0.24,
      padHeight: 0.09
    },
    {
      id: "sofa_corner",
      kind: "seat",
      x: 0.20,
      y: 0.58,
      label: "Sit close",
      approachPoint: { x: 0.24, y: 0.62 },
      facingOnArrival: "right",
      padWidth: 0.16,
      padHeight: 0.07
    },
    {
      id: "bed_edge",
      kind: "seat",
      x: 0.72,
      y: 0.55,
      label: "Cozy edge",
      approachPoint: { x: 0.68, y: 0.60 },
      facingOnArrival: "left",
      padWidth: 0.18,
      padHeight: 0.07
    },
    {
      id: "desk_corner",
      kind: "activity",
      x: 0.48,
      y: 0.50,
      label: "Vibe desk",
      approachPoint: { x: 0.50, y: 0.54 },
      facingOnArrival: "back",
      padWidth: 0.16,
      padHeight: 0.07
    }
  ],
  furniture: []
}
