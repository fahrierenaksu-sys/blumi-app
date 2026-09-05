import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  deriveRoomWorldFacing,
  omitRoomWorldBlockers,
  type RoomWorldGeometry
} from "../../roomWorld/roomWorldGeometry"
import {
  createRoomWorldGeometryFromRoomV2Scene,
  createRoomWorldHotspotsFromRoomV2Scene
} from "../../roomWorld/roomWorldRoomV2Projection"
import {
  createRoomWorldGeometryFromMiniRoomScene,
  createRoomWorldHotspotsFromMiniRoomScene
} from "../../roomWorld/roomWorldMiniRoomProjection"
import {
  combineRoomWorldMovementPlans,
  createRoomWorldMovementPlan,
  createRoomWorldSeatExitMovementPlan,
  createRoomWorldSeatMovementPlan,
  getRoomWorldMovementFrame,
  getRoomWorldMovementFramePose,
  getRoomWorldMovementSegmentStartPose,
  isRoomWorldTargetOccupied,
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
  resolveRoomWorldInteractiveTarget,
  type RoomWorldOccupant
} from "../../roomWorld/roomWorldRuntime"
import type { ResolvedRoomV2Scene } from "../../roomV2/roomV2.types"
import { canMiniRoomAvatarUseMotion } from "../miniRoomAvatarMotion"
import { cozyPinkBedroomScene } from "./roomMaps"
import {
  cancelActiveMiniRoomMovement,
  cancelPendingMiniRoomMovementCompletion,
  scheduleMiniRoomMovementCompletion
} from "./miniRoomMovementLifecycle"
import {
  createMiniRoomSpeechQueue,
  dismissMiniRoomSpeech,
  enqueueMiniRoomSpeech
} from "./miniRoomSpeechQueue"
import type {
  AvatarFacing,
  AvatarState,
  MiniRoomStore,
  MiniRoomParticipantAvatarSnapshots,
  RoomHotspot,
  RoomPoint,
  RoomScene,
  SpeechBubble
} from "./miniRoomSceneTypes"

interface UseMiniRoomSceneStoreInput {
  localUser: {
    userId: string
    displayName: string
  }
  partnerUser: {
    userId: string
    displayName: string
  }
  participantAvatarSnapshots: MiniRoomParticipantAvatarSnapshots
  scene?: RoomScene
  roomDecorScene?: ResolvedRoomV2Scene
  bubbleLifetimeMs?: number
}

const PROXIMITY_CLOSE_DISTANCE = 0.18
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

function deriveFacing(from: RoomPoint, to: RoomPoint): AvatarFacing {
  return deriveRoomWorldFacing(from, to)
}

function createInitialAvatars(
  input: UseMiniRoomSceneStoreInput,
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
    [input.localUser.userId]: {
      userId: input.localUser.userId,
      displayName: local.displayName,
      x: localSpawn.x,
      y: localSpawn.y,
      facing: localSpawn.facing,
      motion: "idle",
      appearance: local.appearance
    },
    [input.partnerUser.userId]: {
      userId: input.partnerUser.userId,
      displayName: partner.displayName,
      x: partnerSpawn.x,
      y: partnerSpawn.y,
      facing: partnerSpawn.facing,
      motion: "idle",
      appearance: partner.appearance
    }
  }
}

interface MoveOptions {
  hotspot?: RoomHotspot
  roomWorldHotspot?: ReturnType<typeof createRoomWorldHotspotsFromRoomV2Scene>[number]
}

export function useMiniRoomSceneStore(input: UseMiniRoomSceneStoreInput): MiniRoomStore {
  const scene = input.scene ?? cozyPinkBedroomScene
  const usesRoomV2Scene = Boolean(input.roomDecorScene?.shell)
  const geometry = useMemo(
    () => usesRoomV2Scene && input.roomDecorScene
      ? createRoomWorldGeometryFromRoomV2Scene(input.roomDecorScene)
      : createRoomWorldGeometryFromMiniRoomScene(scene),
    [input.roomDecorScene, scene, usesRoomV2Scene]
  )
  const roomWorldHotspots = useMemo(
    () => usesRoomV2Scene && input.roomDecorScene
      ? createRoomWorldHotspotsFromRoomV2Scene(input.roomDecorScene)
      : createRoomWorldHotspotsFromMiniRoomScene(scene),
    [input.roomDecorScene, scene, usesRoomV2Scene]
  )
  const hotspots = useMemo(
    () => usesRoomV2Scene
      ? createMiniRoomHotspotsFromRoomWorldHotspots(roomWorldHotspots)
      : scene.hotspots,
    [roomWorldHotspots, scene.hotspots, usesRoomV2Scene]
  )
  const [avatars, setAvatars] = useState<Record<string, AvatarState>>(() =>
    createInitialAvatars(input, scene, geometry, usesRoomV2Scene)
  )
  const avatarsRef = useRef(avatars)
  avatarsRef.current = avatars
  const [bubbles, setBubbles] = useState<SpeechBubble[]>([])
  const [pressedPoint, setPressedPoint] = useState<RoomPoint | undefined>()
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | undefined>()
  const animationFrameRef = useRef<number | null>(null)
  const movementCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bubbleCounterRef = useRef(0)
  const speechQueueRef = useRef(createMiniRoomSpeechQueue())
  const activeBubbleRef = useRef<SpeechBubble | null>(null)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNextSpeechBubbleRef = useRef<() => void>(() => undefined)
  const speechMotionTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    cancelActiveMiniRoomMovement(animationFrameRef, cancelAnimationFrame)
    cancelPendingMiniRoomMovementCompletion(
      movementCompletionTimerRef,
      clearTimeout
    )
    const nextAvatars = createInitialAvatars(input, scene, geometry, usesRoomV2Scene)
    avatarsRef.current = nextAvatars
    setAvatars(nextAvatars)
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = null
    speechQueueRef.current = createMiniRoomSpeechQueue()
    activeBubbleRef.current = null
    setBubbles([])
    for (const timer of speechMotionTimersRef.current.values()) clearTimeout(timer)
    speechMotionTimersRef.current.clear()
    setPressedPoint(undefined)
    setSelectedHotspotId(undefined)
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    geometry,
    input.localUser.displayName,
    input.localUser.userId,
    input.participantAvatarSnapshots,
    input.partnerUser.displayName,
    input.partnerUser.userId,
    scene,
    usesRoomV2Scene
  ])

  useEffect(() => {
    return () => {
      cancelActiveMiniRoomMovement(animationFrameRef, cancelAnimationFrame)
      cancelPendingMiniRoomMovementCompletion(
        movementCompletionTimerRef,
        clearTimeout
      )
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
      for (const timer of speechMotionTimersRef.current.values()) {
        clearTimeout(timer)
      }
      speechMotionTimersRef.current.clear()
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = null
      speechQueueRef.current = createMiniRoomSpeechQueue()
      activeBubbleRef.current = null
    }
  }, [])

  const runMovement = useCallback(
    (point: RoomPoint, options?: MoveOptions): boolean => {
      const currentAvatars = avatarsRef.current
      const localAvatar = currentAvatars[input.localUser.userId]
      if (!localAvatar) return false
      const occupants = createMiniRoomOccupants(currentAvatars)
      const seatHotspot = options?.roomWorldHotspot?.kind === "seat"
        ? options.roomWorldHotspot
        : undefined
      const currentSeatHotspot = localAvatar.seatedHotspotId
        ? roomWorldHotspots.find((hotspot) => hotspot.id === localAvatar.seatedHotspotId)
        : undefined
      const currentSeatExit = currentSeatHotspot?.exitPoint && currentSeatHotspot.sourceRenderId
        ? {
          point: currentSeatHotspot.exitPoint,
          furnitureRenderId: currentSeatHotspot.sourceRenderId
        }
        : undefined
      const seatTarget = seatHotspot
        ? { x: seatHotspot.x, y: seatHotspot.y }
        : point
      if (
        seatHotspot &&
        isRoomWorldTargetOccupied({
          target: seatTarget,
          occupants,
          movingOccupantId: input.localUser.userId
        })
      ) {
        return false
      }
      const currentSeatGeometry = currentSeatExit
        ? geometry
        : currentSeatHotspot?.sourceRenderId
          ? omitRoomWorldBlockers(geometry, [currentSeatHotspot.sourceRenderId])
          : geometry
      const seatDeparturePlan = seatHotspot?.approachPoint && currentSeatExit
        ? createRoomWorldSeatExitMovementPlan({
          geometry,
          from: localAvatar,
          exit: currentSeatExit.point,
          target: seatHotspot.approachPoint,
          seatedFurnitureRenderId: currentSeatExit.furnitureRenderId,
          clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
          timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
          occupants,
          movingOccupantId: input.localUser.userId
        })
        : undefined
      if (seatHotspot?.approachPoint && currentSeatExit && !seatDeparturePlan) return false
      const seatPlan = seatHotspot?.approachPoint && seatHotspot.sourceRenderId
        ? createRoomWorldSeatMovementPlan({
          geometry: currentSeatGeometry,
          from: seatDeparturePlan?.target ?? localAvatar,
          approach: seatHotspot.approachPoint,
          seat: seatTarget,
          seatedFurnitureRenderId: seatHotspot.sourceRenderId,
          clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
          timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
          occupants,
          movingOccupantId: input.localUser.userId
        })
        : null
      if (seatHotspot?.approachPoint && !seatPlan) return false
      const target = seatPlan?.target ?? resolveRoomWorldInteractiveTarget({
        geometry: currentSeatGeometry,
        target: point,
        occupants,
        movingOccupantId: input.localUser.userId,
        clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
      })
      if (!target) return false
      const exitPlan = !seatPlan && currentSeatExit
        ? createRoomWorldSeatExitMovementPlan({
          geometry,
          from: localAvatar,
          exit: currentSeatExit.point,
          target,
          seatedFurnitureRenderId: currentSeatExit.furnitureRenderId,
          clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
          timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
          occupants,
          movingOccupantId: input.localUser.userId
        })
        : null
      if (!seatPlan && currentSeatExit && !exitPlan) return false
      const plan = seatPlan
        ? seatDeparturePlan
          ? combineRoomWorldMovementPlans([seatDeparturePlan, seatPlan])
          : seatPlan
        : exitPlan ?? createRoomWorldMovementPlan({
          geometry: currentSeatGeometry,
          from: localAvatar,
          to: target,
          clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
          timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
          occupants,
          movingOccupantId: input.localUser.userId
        })
      if (!plan) return false

      cancelActiveMiniRoomMovement(animationFrameRef, cancelAnimationFrame)
      cancelPendingMiniRoomMovementCompletion(
        movementCompletionTimerRef,
        clearTimeout
      )

      const localUserId = input.localUser.userId
      const finalSegment = plan.segments[plan.segments.length - 1]
      if (!finalSegment) return false
      const arrivalFacing =
        options?.hotspot?.facingOnArrival ?? finalSegment.facing
      const arrivalMotion =
        options?.hotspot?.kind === "seat" &&
        canMiniRoomAvatarUseMotion({
          appearance: localAvatar.appearance,
          motion: "sitting",
          facing: arrivalFacing
        })
          ? "sitting"
          : "idle"

      setPressedPoint(target)

      const animatePathSegment = (pathIndex: number): void => {
        const segment = plan.segments[pathIndex]
        const segmentStartPose = getRoomWorldMovementSegmentStartPose(segment)
        const startedAt = Date.now()

        setAvatars((current) => {
          const avatar = current[localUserId]
          if (!avatar) return current
          return {
            ...current,
            [localUserId]: {
              ...avatar,
              targetX: target.x,
              targetY: target.y,
              facing: segmentStartPose.facing,
              motion: segmentStartPose.motion,
              seatedHotspotId: undefined
            }
          }
        })

        const tick = () => {
          const frame = getRoomWorldMovementFrame({
            segment,
            startedAt,
            now: Date.now()
          })

          setAvatars((current) => {
            const avatar = current[localUserId]
            if (!avatar) return current
            const runtimePose = getRoomWorldMovementFramePose({
              frame,
              segment,
              arrival: {
                facing: arrivalFacing,
                motion: arrivalMotion
              }
            })
            if (!frame.isComplete || !segment.isFinal) {
              return {
                ...current,
                [localUserId]: {
                  ...avatar,
                  x: runtimePose.x,
                  y: runtimePose.y,
                  facing: runtimePose.facing,
                  motion: runtimePose.motion,
                  targetX: target.x,
                  targetY: target.y
                }
              }
            }
            return {
              ...current,
              [localUserId]: {
                ...avatar,
                x: runtimePose.x,
                y: runtimePose.y,
                motion: runtimePose.motion,
                facing: runtimePose.facing,
                targetX: undefined,
                targetY: undefined,
                seatedHotspotId:
                  options?.hotspot?.kind === "seat"
                    ? options?.hotspot?.id
                    : undefined
              }
            }
          })

          if (!frame.isComplete) {
            animationFrameRef.current = requestAnimationFrame(tick)
            return
          }

          if (!segment.isFinal) {
            animatePathSegment(pathIndex + 1)
            return
          }

          animationFrameRef.current = null
          scheduleMiniRoomMovementCompletion(
            movementCompletionTimerRef,
            setTimeout,
            clearTimeout,
            () => setPressedPoint(undefined),
            180
          )
        }

        animationFrameRef.current = requestAnimationFrame(tick)
      }

      animatePathSegment(0)
      return true
    },
    [geometry, input.localUser.userId, roomWorldHotspots]
  )

  const moveLocalAvatar = useCallback(
    (point: RoomPoint): boolean => {
      setSelectedHotspotId(undefined)
      return runMovement(point)
    },
    [runMovement]
  )

  const moveLocalAvatarToHotspot = useCallback(
    (hotspotId: string): boolean => {
      const hotspot = hotspots.find((entry) => entry.id === hotspotId)
      if (!hotspot) return false
      const roomWorldHotspot = roomWorldHotspots.find((entry) => entry.id === hotspotId)
      const target = roomWorldHotspot
        ? roomWorldHotspot.approachPoint ?? {
          x: roomWorldHotspot.x,
          y: roomWorldHotspot.y
        }
        : hotspot.approachPoint ?? { x: hotspot.x, y: hotspot.y }
      setSelectedHotspotId(hotspotId)
      return runMovement(target, { hotspot, roomWorldHotspot })
    },
    [hotspots, roomWorldHotspots, runMovement]
  )

  const returnAvatarToIdle = useCallback((speakerUserId: string): void => {
    const speechTimer = speechMotionTimersRef.current.get(speakerUserId)
    if (speechTimer) clearTimeout(speechTimer)
    speechMotionTimersRef.current.delete(speakerUserId)
    setAvatars((current) => {
      const avatar = current[speakerUserId]
      if (!avatar || avatar.motion !== "speaking") return current
      return {
        ...current,
        [speakerUserId]: { ...avatar, motion: "idle" }
      }
    })
  }, [])

  const finishActiveSpeechBubble = useCallback((): void => {
    const activeBubble = activeBubbleRef.current
    if (!activeBubble) return
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = null
    activeBubbleRef.current = null
    speechQueueRef.current = dismissMiniRoomSpeech(
      speechQueueRef.current,
      activeBubble.id,
      Date.now()
    )
    setBubbles([])
    returnAvatarToIdle(activeBubble.speakerUserId)
    showNextSpeechBubbleRef.current()
  }, [returnAvatarToIdle])

  const showNextSpeechBubble = useCallback((): void => {
    if (activeBubbleRef.current) return
    const next = speechQueueRef.current.active
    if (!next) return
    const bubble: SpeechBubble = {
      id: next.key,
      speakerUserId: next.speakerUserId,
      body: next.body,
      tone: "chat",
      createdAt: next.startedAt,
      expiresAt: next.expiresAt
    }
    activeBubbleRef.current = bubble
    setBubbles([bubble])

    setAvatars((current) => {
      const avatar = current[next.speakerUserId]
      if (!avatar) return current
      if (avatar.motion === "sitting") return current
      return {
        ...current,
        [next.speakerUserId]: { ...avatar, motion: "speaking" }
      }
    })

    const previousTimer = speechMotionTimersRef.current.get(next.speakerUserId)
    if (previousTimer) clearTimeout(previousTimer)

    const timer = setTimeout(() => {
      if (speechMotionTimersRef.current.get(next.speakerUserId) === timer) {
        speechMotionTimersRef.current.delete(next.speakerUserId)
      }
      setAvatars((current) => {
        const avatar = current[next.speakerUserId]
        if (!avatar || avatar.motion !== "speaking") return current
        return {
          ...current,
          [next.speakerUserId]: { ...avatar, motion: "idle" }
        }
      })
    }, 1200)
    speechMotionTimersRef.current.set(next.speakerUserId, timer)

    bubbleTimerRef.current = setTimeout(
      finishActiveSpeechBubble,
      Math.max(0, next.expiresAt - Date.now())
    )
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [finishActiveSpeechBubble, input.bubbleLifetimeMs])
  showNextSpeechBubbleRef.current = showNextSpeechBubble

  const addSpeechBubble = useCallback<MiniRoomStore["addSpeechBubble"]>((bubble) => {
    const now = Date.now()
    const key = `bubble_${++bubbleCounterRef.current}_${now}`
    speechQueueRef.current = enqueueMiniRoomSpeech(
      speechQueueRef.current,
      {
        key,
        speakerUserId: bubble.speakerUserId,
        body: bubble.body,
        lifetimeMs: input.bubbleLifetimeMs
      },
      now
    )
    showNextSpeechBubbleRef.current()
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [])

  const sayPhrase = useCallback<MiniRoomStore["sayPhrase"]>(
    (userId, body, tone = "chat") => {
      addSpeechBubble({ speakerUserId: userId, body, tone })
    },
    [addSpeechBubble]
  )

  const dismissSpeechBubble = useCallback<MiniRoomStore["dismissSpeechBubble"]>(
    (bubbleId) => {
      if (activeBubbleRef.current?.id !== bubbleId) return
      finishActiveSpeechBubble()
    },
    [finishActiveSpeechBubble]
  )

  const proximityClose = useMemo(() => {
    const list = Object.values(avatars)
    if (list.length < 2) return false
    const [a, b] = list
    return Math.hypot(a.x - b.x, a.y - b.y) <= PROXIMITY_CLOSE_DISTANCE
  }, [avatars])

  useEffect(() => {
    const list = Object.values(avatars)
    if (list.length < 2) return
    const [a, b] = list
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    if (dist > 0.12) return
    const aMoving = a.motion === "walking"
    const bMoving = b.motion === "walking"
    if (aMoving || bMoving) return

    const wantAFacing: AvatarFacing = deriveFacing(a, b)
    const wantBFacing: AvatarFacing = deriveFacing(b, a)
    const changeA = a.facing !== wantAFacing && a.motion !== "sitting"
    const changeB = b.facing !== wantBFacing && b.motion !== "sitting"
    if (!changeA && !changeB) return
    setAvatars((current) => {
      const nextA = current[a.userId]
      const nextB = current[b.userId]
      if (!nextA || !nextB) return current
      return {
        ...current,
        [a.userId]: changeA ? { ...nextA, facing: wantAFacing } : nextA,
        [b.userId]: changeB ? { ...nextB, facing: wantBFacing } : nextB
      }
    })
  }, [avatars])

  const interaction = useMemo(
    () => ({
      pressedPoint,
      selectedHotspotId,
      proximityClose
    }),
    [pressedPoint, proximityClose, selectedHotspotId]
  )

  return {
    scene,
    hotspots,
    avatars,
    bubbles,
    interaction,
    moveLocalAvatar,
    moveLocalAvatarToHotspot,
    addSpeechBubble,
    sayPhrase,
    dismissSpeechBubble
  }
}

function createMiniRoomOccupants(
  avatars: Record<string, AvatarState>
): RoomWorldOccupant[] {
  return Object.values(avatars).map((avatar) => ({
    id: avatar.userId,
    x: avatar.targetX ?? avatar.x,
    y: avatar.targetY ?? avatar.y,
    blocksMovement: true
  }))
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

function createMiniRoomHotspotsFromRoomWorldHotspots(
  hotspots: ReturnType<typeof createRoomWorldHotspotsFromRoomV2Scene>
): RoomHotspot[] {
  return hotspots.map((hotspot) => ({
    id: hotspot.id,
    kind: hotspot.kind === "seat" ? "seat" : "stand",
    x: hotspot.x,
    y: hotspot.y,
    approachPoint: hotspot.approachPoint ?? { x: hotspot.x, y: hotspot.y },
    facingOnArrival: hotspot.facing,
    padWidth: hotspot.kind === "seat" ? 0.18 : 0.14,
    padHeight: hotspot.kind === "seat" ? 0.08 : 0.07
  }))
}
