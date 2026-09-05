import {
  type RoomWorldGeometry,
  type RoomWorldPoint
} from "./roomWorldGeometry"
import {
  createRoomWorldMovementPlan,
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING,
  resolveRoomWorldInteractiveTarget
} from "./roomWorldRuntime"

export const MY_ROOM_AVATAR_SPAWN = {
  x: 0.47,
  y: 0.84,
  direction: "front" as const
} as const

export const MY_ROOM_WALK_ACTION_TARGETS = [
  { x: 0.28, y: 0.86 },
  { x: 0.72, y: 0.86 },
  { x: 0.3, y: 0.7 },
  { x: 0.7, y: 0.7 },
  { x: 0.5, y: 0.88 },
  { x: 0.5, y: 0.64 }
] as const satisfies readonly RoomWorldPoint[]

export const MY_ROOM_AVATAR_SIZE = {
  compact: {
    width: 0.20,
    height: 0.30
  },
  wide: {
    width: 0.18,
    height: 0.27
  }
} as const

export const MY_ROOM_WIDE_STAGE_BREAKPOINT = 720
export const MY_ROOM_WIDE_STAGE_AVATAR_FEET_Y = 0.82
export const MY_ROOM_TRANSIENT_POSE_DURATION_MS = 1800
export const MY_ROOM_MOVEMENT_FEEDBACK_DURATION_MS = 1700
export const MY_ROOM_MOVEMENT_NO_OP_DISTANCE = 0.012

export function getMyRoomPointDistance(
  from: RoomWorldPoint,
  to: RoomWorldPoint
): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

export function getMyRoomWalkActionTarget(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
}): RoomWorldPoint | null {
  const candidates = [...MY_ROOM_WALK_ACTION_TARGETS].sort(
    (left, right) =>
      getMyRoomPointDistance(input.from, right) -
      getMyRoomPointDistance(input.from, left)
  )
  for (const candidate of candidates) {
    const target = resolveRoomWorldInteractiveTarget({
      geometry: input.geometry,
      target: candidate,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
    })
    if (
      !target ||
      getMyRoomPointDistance(input.from, target) <= MY_ROOM_MOVEMENT_NO_OP_DISTANCE
    ) {
      continue
    }
    const plan = createRoomWorldMovementPlan({
      geometry: input.geometry,
      from: input.from,
      to: target,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
    })
    if (plan?.segments.length) return target
  }
  return null
}

export function getWideStageRendererTranslateY(input: {
  stageWidth: number
  stageHeight: number
  shellCanvasWidth: number
  shellCanvasHeight: number
  avatarWorldY: number
}): number {
  const rendererHeight =
    input.stageWidth * input.shellCanvasHeight / input.shellCanvasWidth
  const avatarFeetY = rendererHeight * input.avatarWorldY
  const targetFeetY = input.stageHeight * MY_ROOM_WIDE_STAGE_AVATAR_FEET_Y
  const centeredRendererTop = (input.stageHeight - rendererHeight) / 2
  const targetRendererTop = Math.max(
    input.stageHeight - rendererHeight,
    Math.min(0, targetFeetY - avatarFeetY)
  )
  return Math.round(targetRendererTop - centeredRendererTop)
}
