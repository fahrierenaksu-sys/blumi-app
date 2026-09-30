import { deriveRoomWorldFacing, type RoomWorldGeometry } from "../../roomWorld/roomWorldGeometry"
import { resolveRoomWorldInteractiveTarget, ROOM_WORLD_AVATAR_COLLISION_CLEARANCE } from "../../roomWorld/roomWorldRuntime"
import type { AvatarFacing, AvatarState, MiniRoomParticipantAvatarSnapshots, RoomPoint, RoomScene } from "./miniRoomSceneTypes"

const ROOM_V2_MINI_ROOM_SPAWN_SEEDS = {
  local: {
    x: 0.38,
    y: 0.76,
    facing: "right" as AvatarFacing
  },
  partner: {
    x: 0.62,
    y: 0.74,
    facing: "left" as AvatarFacing
  }
} as const

export function deriveFacing(from: RoomPoint, to: RoomPoint): AvatarFacing {
  return deriveRoomWorldFacing(from, to)
}

export function createInitialAvatars(
  input: {
    localUserId: string
    partnerUserId: string
    participantAvatarSnapshots: MiniRoomParticipantAvatarSnapshots
  },
  scene: RoomScene,
  geometry: RoomWorldGeometry,
  usesRoomV2Scene: boolean
): Record<string, AvatarState> {
  const { localSpawn, partnerSpawn } = createInitialSpawnPair({
    scene,
    geometry,
    usesRoomV2Scene
  })
  const { local, partner } = input.participantAvatarSnapshots

  return {
    [input.localUserId]: {
      userId: input.localUserId,
      displayName: local.displayName,
      x: localSpawn.x,
      y: localSpawn.y,
      facing: localSpawn.facing,
      motion: "idle",
      appearance: local.appearance
    },
    [input.partnerUserId]: {
      userId: input.partnerUserId,
      displayName: partner.displayName,
      x: partnerSpawn.x,
      y: partnerSpawn.y,
      facing: partnerSpawn.facing,
      motion: "idle",
      appearance: partner.appearance
    }
  }
}

function createInitialSpawnPair(input: {
  scene: RoomScene
  geometry: RoomWorldGeometry
  usesRoomV2Scene: boolean
}): {
  localSpawn: {
    x: number
    y: number
    facing: AvatarFacing
  }
  partnerSpawn: {
    x: number
    y: number
    facing: AvatarFacing
  }
} {
  const fallbackLocal =
    input.scene.spawnPoints.find((point) => point.role === "local") ??
    input.scene.spawnPoints[0]
  const fallbackPartner =
    input.scene.spawnPoints.find((point) => point.role === "partner") ??
    input.scene.spawnPoints[1] ??
    fallbackLocal

  if (!input.usesRoomV2Scene) {
    return {
      localSpawn: fallbackLocal,
      partnerSpawn: fallbackPartner
    }
  }

  const localTarget = resolveRoomWorldInteractiveTarget({
    geometry: input.geometry,
    target: ROOM_V2_MINI_ROOM_SPAWN_SEEDS.local,
    clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  }) ?? ROOM_V2_MINI_ROOM_SPAWN_SEEDS.local
  const partnerTarget = resolveRoomWorldInteractiveTarget({
    geometry: input.geometry,
    target: ROOM_V2_MINI_ROOM_SPAWN_SEEDS.partner,
    occupants: [
      {
        id: "local_spawn",
        x: localTarget.x,
        y: localTarget.y,
        blocksMovement: true
      }
    ],
    clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  }) ?? ROOM_V2_MINI_ROOM_SPAWN_SEEDS.partner

  return {
    localSpawn: {
      ...localTarget,
      facing: ROOM_V2_MINI_ROOM_SPAWN_SEEDS.local.facing
    },
    partnerSpawn: {
      ...partnerTarget,
      facing: ROOM_V2_MINI_ROOM_SPAWN_SEEDS.partner.facing
    }
  }
}
