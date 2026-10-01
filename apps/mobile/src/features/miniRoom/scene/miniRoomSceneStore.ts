import { createInitialAvatars, deriveFacing } from "./miniRoomInitialAvatars"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { omitRoomWorldBlockers } from "../../roomWorld/roomWorldGeometry"
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
  createMiniRoomAvatarPosition,
  createMiniRoomSegmentAnimator,
  readMiniRoomAvatarPosition,
  snapMiniRoomAvatarPosition,
  type MiniRoomAvatarPosition
} from "./miniRoomAvatarPositions"
import {
  cancelActiveMiniRoomMovement,
  cancelPendingMiniRoomMovementCompletion,
  scheduleMiniRoomMovementCompletion
} from "./miniRoomMovementLifecycle"
import {
  startMiniRoomMovementRun,
  type MiniRoomMovementRun,
  type MiniRoomSegmentAnimator
} from "./miniRoomMovementRun"
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
  onLocalMove?: (point: RoomPoint, hotspotId?: string) => boolean
  bubbleLifetimeMs?: number
}

const PROXIMITY_CLOSE_DISTANCE = 0.18
function cancelMiniRoomMovementRun(run: MiniRoomMovementRun): void {
  run.cancel()
}

interface MiniRoomAvatarMotionDriver {
  position: MiniRoomAvatarPosition
  animator: MiniRoomSegmentAnimator
}

interface MoveOptions {
  hotspot?: RoomHotspot
  roomWorldHotspot?: ReturnType<typeof createRoomWorldHotspotsFromRoomV2Scene>[number]
  /** Plan without the other avatar: a partner step this phone could not route. */
  ignoreOccupants?: boolean
}

export function useMiniRoomSceneStore(input: UseMiniRoomSceneStoreInput): MiniRoomStore {
  const scene = input.scene ?? cozyPinkBedroomScene
  const localUserId = input.localUser.userId
  const localDisplayName = input.localUser.displayName
  const partnerUserId = input.partnerUser.userId
  const partnerDisplayName = input.partnerUser.displayName
  const participantAvatarSnapshots = input.participantAvatarSnapshots
  const bubbleLifetimeMs = input.bubbleLifetimeMs
  const onLocalMove = input.onLocalMove
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
    createInitialAvatars(
      { localUserId, partnerUserId, participantAvatarSnapshots },
      scene,
      geometry,
      usesRoomV2Scene
    )
  )
  // Committed avatars for callbacks. The scene reset below writes it before
  // publishing new avatars, so reads during render see the current id set.
  const avatarsRef = useRef(avatars)
  useLayoutEffect(() => {
    avatarsRef.current = avatars
  }, [avatars])
  // Live per-frame positions, keyed by avatar id, animate on the UI thread;
  // `avatars` holds the committed pose (segment starts/ends and arrival).
  const [motionDrivers] = useState(() => new Map<string, MiniRoomAvatarMotionDriver>())
  const getMotionDriver = useCallback((avatar: AvatarState): MiniRoomAvatarMotionDriver => {
    const existing = motionDrivers.get(avatar.userId)
    if (existing) return existing
    const position = createMiniRoomAvatarPosition(avatar)
    const driver = { position, animator: createMiniRoomSegmentAnimator(position) }
    motionDrivers.set(avatar.userId, driver)
    return driver
  }, [motionDrivers])
  const [sceneEpoch, setSceneEpoch] = useState(0)
  const [bubbles, setBubbles] = useState<SpeechBubble[]>([])
  const [pressedPoint, setPressedPoint] = useState<RoomPoint | undefined>()
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | undefined>()
  const movementsRef = useRef(new Map<string, { current: MiniRoomMovementRun | null }>())
  const movementRefFor = useCallback((id: string) => {
    let ref = movementsRef.current.get(id)
    if (!ref) { ref = { current: null }; movementsRef.current.set(id, ref) }
    return ref
  }, [])
  const movementCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bubbleCounterRef = useRef(0)
  const speechQueueRef = useRef(createMiniRoomSpeechQueue())
  const activeBubbleRef = useRef<SpeechBubble | null>(null)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNextSpeechBubbleRef = useRef<() => void>(() => undefined)
  const speechMotionTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    for (const ref of movementsRef.current.values()) cancelActiveMiniRoomMovement(ref, cancelMiniRoomMovementRun)
    cancelPendingMiniRoomMovementCompletion(
      movementCompletionTimerRef,
      clearTimeout
    )
    const nextAvatars = createInitialAvatars(
      { localUserId, partnerUserId, participantAvatarSnapshots },
      scene,
      geometry,
      usesRoomV2Scene
    )
    avatarsRef.current = nextAvatars
    setAvatars(nextAvatars)
    for (const avatar of Object.values(nextAvatars)) {
      snapMiniRoomAvatarPosition(getMotionDriver(avatar).position, avatar)
    }
    // Fresh avatars stand at spawn; room motion re-places them from the latest
    // authoritative records when this changes.
    setSceneEpoch((epoch) => epoch + 1)
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = null
    speechQueueRef.current = createMiniRoomSpeechQueue()
    activeBubbleRef.current = null
    setBubbles([])
    for (const timer of speechMotionTimersRef.current.values()) clearTimeout(timer)
    speechMotionTimersRef.current.clear()
    setPressedPoint(undefined)
    setSelectedHotspotId(undefined)
    // Display names are not read here, but a renamed participant restarts the scene.
  }, [
    geometry,
    getMotionDriver,
    localDisplayName,
    localUserId,
    participantAvatarSnapshots,
    partnerDisplayName,
    partnerUserId,
    scene,
    usesRoomV2Scene
  ])

  useEffect(() => {
    // The timer map is created once and only cleared, never replaced.
    const speechMotionTimers = speechMotionTimersRef.current
    const movements = movementsRef.current
    return () => {
      for (const ref of movements.values()) cancelActiveMiniRoomMovement(ref, cancelMiniRoomMovementRun)
      cancelPendingMiniRoomMovementCompletion(
        movementCompletionTimerRef,
        clearTimeout
      )
      for (const timer of speechMotionTimers.values()) {
        clearTimeout(timer)
      }
      speechMotionTimers.clear()
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = null
      speechQueueRef.current = createMiniRoomSpeechQueue()
      activeBubbleRef.current = null
    }
  }, [])

  const runMovement = useCallback(
    (userId: string, point: RoomPoint, options?: MoveOptions): boolean => {
      const currentAvatars = avatarsRef.current
      const committedLocalAvatar = currentAvatars[userId]
      if (!committedLocalAvatar) return false
      const motionDriver = getMotionDriver(committedLocalAvatar)
      // A retarget during a walk starts from where the avatar is on screen.
      const localAvatar = {
        ...committedLocalAvatar,
        ...readMiniRoomAvatarPosition(motionDriver.position)
      }
      const occupants = options?.ignoreOccupants ? [] : createMiniRoomOccupants(currentAvatars)
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
          movingOccupantId: userId
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
          movingOccupantId: userId
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
          movingOccupantId: userId
        })
        : null
      if (seatHotspot?.approachPoint && !seatPlan) return false
      const target = seatPlan?.target ?? resolveRoomWorldInteractiveTarget({
        geometry: currentSeatGeometry,
        target: point,
        occupants,
        movingOccupantId: userId,
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
          movingOccupantId: userId
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
          movingOccupantId: userId
        })
      if (!plan) return false

      const activeMovementRef = movementRefFor(userId)
      if (userId === localUserId && onLocalMove &&
        !onLocalMove(target, options?.hotspot?.id)) return false
      cancelActiveMiniRoomMovement(activeMovementRef, cancelMiniRoomMovementRun)
      if (userId === localUserId) cancelPendingMiniRoomMovementCompletion(
        movementCompletionTimerRef,
        clearTimeout
      )

      const movingUserId = userId
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

      if (userId === localUserId) setPressedPoint(target)

      const arrivalSeatedHotspotId =
        options?.hotspot?.kind === "seat"
          ? options?.hotspot?.id
          : undefined
      let run: MiniRoomMovementRun | null = null
      run = startMiniRoomMovementRun({
        segments: plan.segments,
        arrival: {
          facing: arrivalFacing,
          motion: arrivalMotion
        },
        animator: motionDriver.animator,
        onSegmentStart: (segmentStartPose) => {
          setAvatars((current) => {
            const avatar = current[movingUserId]
            if (!avatar) return current
            return {
              ...current,
              [movingUserId]: {
                ...avatar,
                targetX: target.x,
                targetY: target.y,
                facing: segmentStartPose.facing,
                motion: segmentStartPose.motion,
                seatedHotspotId: undefined
              }
            }
          })
        },
        onSegmentEnd: (runtimePose, segment) => {
          setAvatars((current) => {
            const avatar = current[movingUserId]
            if (!avatar) return current
            if (!segment.isFinal) {
              return {
                ...current,
                [movingUserId]: {
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
              [movingUserId]: {
                ...avatar,
                x: runtimePose.x,
                y: runtimePose.y,
                motion: runtimePose.motion,
                facing: runtimePose.facing,
                targetX: undefined,
                targetY: undefined,
                seatedHotspotId: arrivalSeatedHotspotId
              }
            }
          })
        },
        onArrival: () => {
          if (activeMovementRef.current === run) activeMovementRef.current = null
          if (userId === localUserId) scheduleMiniRoomMovementCompletion(
            movementCompletionTimerRef,
            setTimeout,
            clearTimeout,
            () => setPressedPoint(undefined),
            180
          )
        }
      })
      activeMovementRef.current = run
      return true
    },
    [geometry, getMotionDriver, localUserId, onLocalMove, movementRefFor, roomWorldHotspots]
  )

  const moveLocalAvatar = useCallback(
    (point: RoomPoint): boolean => {
      setSelectedHotspotId(undefined)
      return runMovement(localUserId, point)
    },
    [localUserId, runMovement]
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
      return runMovement(localUserId, target, { hotspot, roomWorldHotspot })
    },
    [hotspots, localUserId, roomWorldHotspots, runMovement]
  )

  const applyRemoteAvatar = useCallback((next: import("@blumi/contracts").MiniRoomAvatarMotion, snap = false) => {
    const avatar = avatarsRef.current[next.userId]
    if (!avatar) return
    const hotspot = next.hotspotId ? hotspots.find(h => h.id === next.hotspotId) : undefined
    const roomWorldHotspot = next.hotspotId ? roomWorldHotspots.find(h => h.id === next.hotspotId) : undefined
    if (!snap && next.present) {
      setAvatars(current => ({ ...current, [next.userId]: { ...current[next.userId], present: true } }))
      const options = hotspot ? { hotspot, roomWorldHotspot } : undefined
      // This phone plans around its own view of the other avatar, which can
      // differ from the sender's for a moment. Never leave the partner behind:
      // route without that occupant, and failing that, place it at the target.
      if (runMovement(next.userId, next, options) ||
        runMovement(next.userId, next, { ...options, ignoreOccupants: true })) return
    }
    cancelActiveMiniRoomMovement(movementRefFor(next.userId), cancelMiniRoomMovementRun)
    const driver = getMotionDriver(avatar)
    if (!snap && !next.present) {
      // Absent: freeze where it is on screen, dimmed, until it returns.
      const position = readMiniRoomAvatarPosition(driver.position)
      snapMiniRoomAvatarPosition(driver.position, position)
      setAvatars(current => ({ ...current, [next.userId]: { ...current[next.userId],
        x: position.x, y: position.y, targetX: undefined, targetY: undefined, motion: "idle",
        seatedHotspotId: undefined, present: false } }))
      return
    }
    // Place exactly: seated on its seat when the record carries one, as the
    // sender's phone shows it, otherwise at the nearest walkable point.
    const facing = hotspot?.facingOnArrival ?? avatar.facing
    const seated = hotspot?.kind === "seat" &&
      canMiniRoomAvatarUseMotion({ appearance: avatar.appearance, motion: "sitting", facing })
    const position = seated ? { x: hotspot.x, y: hotspot.y }
      : resolveRoomWorldInteractiveTarget({ geometry, target: next }) ?? next
    snapMiniRoomAvatarPosition(driver.position, position)
    setAvatars(current => ({ ...current, [next.userId]: { ...current[next.userId],
      x: position.x, y: position.y, targetX: undefined, targetY: undefined,
      motion: seated ? "sitting" : "idle", ...(seated ? { facing } : {}),
      seatedHotspotId: seated ? hotspot.id : undefined, present: next.present } }))
  }, [geometry, getMotionDriver, hotspots, movementRefFor, roomWorldHotspots, runMovement])

  const setRemotePresence = useCallback((userId: string, present: boolean) => {
    if (!present) cancelActiveMiniRoomMovement(movementRefFor(userId), cancelMiniRoomMovementRun)
    setAvatars(current => {
      const avatar = current[userId]
      if (!avatar || avatar.present === present) return current
      return { ...current, [userId]: { ...avatar, present, ...(!present ? { motion: "idle" as const } : {}) } }
    })
  }, [movementRefFor])

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
    const next = speechQueueRef.current.active
    if (!next) return
    const previous = activeBubbleRef.current
    if (previous?.id === next.key) return
    if (previous) {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      returnAvatarToIdle(previous.speakerUserId)
    }
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
      () => { if (activeBubbleRef.current?.id === bubble.id) finishActiveSpeechBubble() },
      Math.max(0, next.expiresAt - Date.now())
    )
  }, [finishActiveSpeechBubble, returnAvatarToIdle])
  // finishActiveSpeechBubble reaches this callback through the ref; it is set
  // at commit, before any effect or timer can finish a bubble.
  useLayoutEffect(() => {
    showNextSpeechBubbleRef.current = showNextSpeechBubble
  }, [showNextSpeechBubble])

  const addSpeechBubble = useCallback<MiniRoomStore["addSpeechBubble"]>((bubble) => {
    const now = Date.now()
    const key = `bubble_${++bubbleCounterRef.current}_${now}`
    speechQueueRef.current = enqueueMiniRoomSpeech(
      speechQueueRef.current,
      {
        key,
        speakerUserId: bubble.speakerUserId,
        body: bubble.body,
        lifetimeMs: bubbleLifetimeMs
      },
      now
    )
    showNextSpeechBubbleRef.current()
  }, [bubbleLifetimeMs])

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
    const list = Object.values(avatars).filter(avatar => avatar.present !== false)
    if (list.length < 2) return false
    const [a, b] = list
    return Math.hypot(a.x - b.x, a.y - b.y) <= PROXIMITY_CLOSE_DISTANCE
  }, [avatars])

  useEffect(() => {
    const list = Object.values(avatars).filter(avatar => avatar.present !== false)
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

  const avatarIdsKey = Object.keys(avatars).join("\u0000")
  // Stable per avatar id: the layer re-subscribes only when the set changes.
  const avatarPositions = useMemo(() => {
    const positions: Record<string, MiniRoomAvatarPosition> = {}
    for (const userId of avatarIdsKey.split("\u0000")) {
      const avatar = avatarsRef.current[userId]
      if (avatar) positions[userId] = getMotionDriver(avatar).position
    }
    return positions
  }, [avatarIdsKey, getMotionDriver])

  return {
    scene,
    hotspots,
    avatars,
    avatarPositions,
    sceneEpoch,
    bubbles,
    interaction,
    moveLocalAvatar,
    moveLocalAvatarToHotspot,
    applyRemoteAvatar,
    setRemotePresence,
    addSpeechBubble,
    sayPhrase,
    dismissSpeechBubble
  }
}

function createMiniRoomOccupants(
  avatars: Record<string, AvatarState>
): RoomWorldOccupant[] {
  return Object.values(avatars).filter(avatar => avatar.present !== false).map((avatar) => ({
    id: avatar.userId,
    x: avatar.targetX ?? avatar.x,
    y: avatar.targetY ?? avatar.y,
    blocksMovement: true
  }))
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
