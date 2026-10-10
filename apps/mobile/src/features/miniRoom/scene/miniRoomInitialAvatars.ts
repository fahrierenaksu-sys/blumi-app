import { deriveRoomWorldFacing, type RoomWorldGeometry } from "../../roomWorld/roomWorldGeometry"
import { resolveRoomWorldInteractiveTarget, ROOM_WORLD_AVATAR_COLLISION_CLEARANCE } from "../../roomWorld/roomWorldRuntime"
import type { AvatarFacing, AvatarState, MiniRoomParticipantAvatarSnapshots, RoomPoint } from "./miniRoomSceneTypes"

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
  geometry: RoomWorldGeometry
): Record<string, AvatarState> {
  const { localSpawn, partnerSpawn } = createInitialSpawnPair(geometry)
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

function createInitialSpawnPair(geometry: RoomWorldGeometry): {
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
  const localTarget = resolveRoomWorldInteractiveTarget({
    geometry,
    target: ROOM_V2_MINI_ROOM_SPAWN_SEEDS.local,
    clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  }) ?? ROOM_V2_MINI_ROOM_SPAWN_SEEDS.local
  const partnerTarget = resolveRoomWorldInteractiveTarget({
    geometry,
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
