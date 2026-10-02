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
import { resolveMiniRoomRefusedSeatStand } from "./miniRoomSeatRefusalModel"
import { createMiniRoomEntryPlan } from "./miniRoomEntryModel"
import { withMiniRoomPresence } from "./miniRoomPresentation"
import type { RoomShellEntry } from "../../roomV2/roomV2.types"
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
  EMPTY_MINI_ROOM_SPEECH_STACK,
  dismissMiniRoomSpeech,
  expireMiniRoomSpeech,
  hasMiniRoomSpeechFrom,
  nextMiniRoomSpeechExpiry,
  pushMiniRoomSpeech,
  type MiniRoomSpeech,
  type MiniRoomSpeechStack
} from "./miniRoomSpeechStack"
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
  /** A seat this phone already knows the partner holds was tapped. */
  onSeatTaken?: (hotspotId: string) => void
  bubbleLifetimeMs?: number
}

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
  /**
   * A server record: never re-sent, and it ends exactly at its target (only
   * the path may route around this phone's view of the other avatar).
   */
  authoritative?: boolean
  /** Arrival facing for a standing target (a refused seat faces the seat). */
  arrivalFacing?: AvatarFacing
  /** Leave through this seat's exit when the avatar is already on its way in. */
  departFromHotspotId?: string
  /** Presentation only: start at the shell's door and walk in (an arrival). */
  entry?: RoomShellEntry
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
  const onSeatTaken = input.onSeatTaken
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
  // Every visible line (per-speaker stacks); one timer ends the next line.
  const speechRef = useRef<MiniRoomSpeechStack>(EMPTY_MINI_ROOM_SPEECH_STACK)
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishSpeechRef = useRef<(next: MiniRoomSpeechStack) => void>(() => undefined)
  const speechMotionTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  // Walks in from the door that are still running, with what runs when each lands.
  const arrivalWalksRef = useRef(new Map<string, { onLanded?: () => void }>())
  const arrivalCounterRef = useRef(0)
  const shellEntry = usesRoomV2Scene ? input.roomDecorScene?.shell?.entry : undefined
  /** Ends a running walk in; `landed` runs its callback (the avatar is in the room). */
  const endArrivalWalk = useCallback((userId: string, landed: boolean) => {
    const walk = arrivalWalksRef.current.get(userId)
    if (!walk) return
    arrivalWalksRef.current.delete(userId)
    if (landed) walk.onLanded?.()
  }, [])

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
    speechRef.current = EMPTY_MINI_ROOM_SPEECH_STACK
    setBubbles([])
    for (const timer of speechMotionTimersRef.current.values()) clearTimeout(timer)
    speechMotionTimersRef.current.clear()
    arrivalWalksRef.current.clear()
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
    const arrivalWalks = arrivalWalksRef.current
    return () => {
      arrivalWalks.clear()
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
      speechRef.current = EMPTY_MINI_ROOM_SPEECH_STACK
    }
  }, [])

  const runMovement = useCallback(
    (userId: string, point: RoomPoint, options?: MoveOptions): boolean => {
      const currentAvatars = avatarsRef.current
      const committedLocalAvatar = currentAvatars[userId]
      if (!committedLocalAvatar) return false
      const motionDriver = getMotionDriver(committedLocalAvatar)
      const entry = options?.entry
      // A retarget during a walk starts from where the avatar is on screen;
      // an arrival starts at the door, standing.
      const localAvatar = entry
        ? { ...committedLocalAvatar, x: entry.door.x, y: entry.door.y, seatedHotspotId: undefined }
        : { ...committedLocalAvatar, ...readMiniRoomAvatarPosition(motionDriver.position) }
      const occupants = options?.ignoreOccupants ? [] : createMiniRoomOccupants(currentAvatars)
      const seatHotspot = options?.roomWorldHotspot?.kind === "seat"
        ? options.roomWorldHotspot
        : undefined
      const departingHotspotId = localAvatar.seatedHotspotId ?? options?.departFromHotspotId
      const currentSeatHotspot = departingHotspotId
        ? roomWorldHotspots.find((hotspot) => hotspot.id === departingHotspotId)
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
      // An authoritative target is resolved without occupants, exactly as the
      // sender's phone accepted it, so both phones end at the same point.
      const target = seatPlan?.target ?? resolveRoomWorldInteractiveTarget({
        geometry: currentSeatGeometry,
        target: point,
        occupants: options?.authoritative ? [] : occupants,
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
        : exitPlan ?? (entry
          ? createMiniRoomEntryPlan({
            geometry: currentSeatGeometry,
            entry,
            to: target,
            clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
            timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
            occupants,
            movingOccupantId: userId
          })
          : createRoomWorldMovementPlan({
            geometry: currentSeatGeometry,
            from: localAvatar,
            to: target,
            clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
            timing: ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING,
            occupants,
            movingOccupantId: userId
          }))
      if (!plan) return false

      const activeMovementRef = movementRefFor(userId)
      const sendsLocalMove = userId === localUserId && !options?.authoritative
      if (sendsLocalMove && onLocalMove &&
        !onLocalMove(target, options?.hotspot?.id)) return false
      cancelActiveMiniRoomMovement(activeMovementRef, cancelMiniRoomMovementRun)
      // A newer step takes over a walk in: the partner is in the room.
      if (!entry) endArrivalWalk(userId, true)
      if (userId === localUserId) cancelPendingMiniRoomMovementCompletion(
        movementCompletionTimerRef,
        clearTimeout
      )

      const movingUserId = userId
      const finalSegment = plan.segments[plan.segments.length - 1]
      if (!finalSegment) return false
      const arrivalFacing =
        options?.hotspot?.facingOnArrival ?? options?.arrivalFacing ?? finalSegment.facing
      const arrivalMotion =
        options?.hotspot?.kind === "seat" &&
        canMiniRoomAvatarUseMotion({
          appearance: localAvatar.appearance,
          motion: "sitting",
          facing: arrivalFacing
        })
          ? "sitting"
          : "idle"

      if (sendsLocalMove) setPressedPoint(target)

      const arrivalSeatedHotspotId =
        options?.hotspot?.kind === "seat"
          ? options?.hotspot?.id
          : undefined
      // Draw order only: sitting down and standing up keep the seat's depth.
      const departingSeatHotspotId = currentSeatExit ? departingHotspotId : undefined
      let run: MiniRoomMovementRun | null = null
      run = startMiniRoomMovementRun({
        segments: plan.segments,
        arrival: {
          facing: arrivalFacing,
          motion: arrivalMotion
        },
        animator: motionDriver.animator,
        onSegmentStart: (segmentStartPose, segment, index) => {
          const depthSeatHotspotId = segment.isFinal && arrivalSeatedHotspotId
            ? arrivalSeatedHotspotId
            : index === 0 ? departingSeatHotspotId : undefined
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
                seatedHotspotId: undefined,
                depthSeatHotspotId,
                enteringFromDoor: entry ? true : undefined
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
                seatedHotspotId: arrivalSeatedHotspotId,
                depthSeatHotspotId: undefined,
                enteringFromDoor: undefined
              }
            }
          })
        },
        onArrival: () => {
          if (activeMovementRef.current === run) activeMovementRef.current = null
          if (entry) endArrivalWalk(userId, true)
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
    [endArrivalWalk, geometry, getMotionDriver, localUserId, onLocalMove, movementRefFor, roomWorldHotspots]
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
      const partnerHolds = Object.values(avatarsRef.current).some((avatar) =>
        avatar.userId !== localUserId && avatar.present !== false && avatar.seatedHotspotId === hotspotId)
      if (hotspot.kind === "seat" && partnerHolds) {
        onSeatTaken?.(hotspotId)
        return false
      }
      const target = roomWorldHotspot
        ? roomWorldHotspot.approachPoint ?? {
          x: roomWorldHotspot.x,
          y: roomWorldHotspot.y
        }
        : hotspot.approachPoint ?? { x: hotspot.x, y: hotspot.y }
      setSelectedHotspotId(hotspotId)
      return runMovement(localUserId, target, { hotspot, roomWorldHotspot })
    },
    [hotspots, localUserId, onSeatTaken, roomWorldHotspots, runMovement]
  )

  const resolveRefusedSeatStand = useCallback((hotspotId: string) => {
    const roomWorldHotspot = roomWorldHotspots.find(h => h.id === hotspotId)
    const hotspot = hotspots.find(h => h.id === hotspotId)
    if (!roomWorldHotspot && !hotspot) return undefined
    // Room V2 seats carry their rig (seat + approach); legacy map seats keep
    // the approach on the map hotspot.
    return resolveMiniRoomRefusedSeatStand(roomWorldHotspot?.approachPoint
      ? { geometry, seat: roomWorldHotspot, approach: roomWorldHotspot.approachPoint }
      : { geometry, seat: hotspot ?? roomWorldHotspot!, approach: hotspot?.approachPoint })
  }, [geometry, hotspots, roomWorldHotspots])

  const applyRemoteAvatar = useCallback((next: import("@blumi/contracts").MiniRoomAvatarMotion, snap = false) => {
    const avatar = avatarsRef.current[next.userId]
    if (!avatar) return
    const hotspot = next.hotspotId ? hotspots.find(h => h.id === next.hotspotId) : undefined
    const roomWorldHotspot = next.hotspotId ? roomWorldHotspots.find(h => h.id === next.hotspotId) : undefined
    // A refused seat claim stands beside that seat, as on every phone.
    const refused = !next.hotspotId && next.deniedHotspotId
      ? resolveRefusedSeatStand(next.deniedHotspotId) : undefined
    const target = refused?.point ?? next
    if (refused && next.userId === localUserId) setSelectedHotspotId(undefined)
    if (!snap && next.present) {
      setAvatars(current => ({ ...current, [next.userId]: withMiniRoomPresence(current[next.userId]!, true) }))
      const options: MoveOptions = hotspot ? { hotspot, roomWorldHotspot, authoritative: true }
        : { authoritative: true, ...(refused ? { arrivalFacing: refused.facing, departFromHotspotId: next.deniedHotspotId } : {}) }
      // This phone plans around its own view of the other avatar, which can
      // differ from the sender's for a moment. Never leave the partner behind:
      // route without that occupant, and failing that, place it at the target.
      if (runMovement(next.userId, target, options) ||
        runMovement(next.userId, target, { ...options, ignoreOccupants: true })) return
    }
    cancelActiveMiniRoomMovement(movementRefFor(next.userId), cancelMiniRoomMovementRun)
    // Placed exactly: an arrival in progress is over (silently if they left).
    endArrivalWalk(next.userId, next.present)
    const driver = getMotionDriver(avatar)
    if (!snap && !next.present) {
      // Absent: freeze where it is on screen, dimmed, until it returns.
      const position = readMiniRoomAvatarPosition(driver.position)
      snapMiniRoomAvatarPosition(driver.position, position)
      setAvatars(current => ({ ...current, [next.userId]: withMiniRoomPresence({ ...current[next.userId]!,
        x: position.x, y: position.y, targetX: undefined, targetY: undefined, motion: "idle",
        seatedHotspotId: undefined, depthSeatHotspotId: undefined, enteringFromDoor: undefined, arrivedByWalk: undefined
      }, false) }))
      return
    }
    // Place exactly: seated on its seat when the record carries one, as the
    // sender's phone shows it, otherwise at the nearest walkable point.
    const facing = hotspot?.facingOnArrival ?? refused?.facing ?? avatar.facing
    const seated = hotspot?.kind === "seat" &&
      canMiniRoomAvatarUseMotion({ appearance: avatar.appearance, motion: "sitting", facing })
    const position = seated ? { x: hotspot.x, y: hotspot.y }
      : resolveRoomWorldInteractiveTarget({ geometry, target }) ?? target
    snapMiniRoomAvatarPosition(driver.position, position)
    setAvatars(current => ({ ...current, [next.userId]: withMiniRoomPresence({ ...current[next.userId]!,
      x: position.x, y: position.y, targetX: undefined, targetY: undefined,
      motion: seated ? "sitting" : "idle", ...(seated || refused ? { facing } : {}),
      seatedHotspotId: seated ? hotspot.id : undefined, depthSeatHotspotId: undefined, enteringFromDoor: undefined
    }, next.present) }))
  }, [endArrivalWalk, geometry, getMotionDriver, hotspots, localUserId, movementRefFor, resolveRefusedSeatStand,
    roomWorldHotspots, runMovement])

  const presentArrival = useCallback<MiniRoomStore["presentArrival"]>((next, options) => {
    const avatar = avatarsRef.current[next.userId]
    if (!avatar || !next.present || next.userId === localUserId) return false
    const arrivalId = ++arrivalCounterRef.current
    const markArrival = (walkedIn: boolean) => setAvatars(current => current[next.userId]
      ? { ...current, [next.userId]: { ...withMiniRoomPresence(current[next.userId]!, true), arrivalId,
        arrivedByWalk: walkedIn || undefined } } : current)
    if (!options.walk) {
      // Reduce Motion: no walk; place at the authoritative spot and fade in there.
      applyRemoteAvatar(next, true)
      markArrival(false)
      return true
    }
    // A seat claim or a refused one is placed by the ordinary record path.
    if (!shellEntry || next.hotspotId || next.deniedHotspotId) return false
    const walkIn = (ignoreOccupants: boolean) =>
      runMovement(next.userId, next, { authoritative: true, entry: shellEntry, ignoreOccupants })
    if (!walkIn(false) && !walkIn(true)) return false
    arrivalWalksRef.current.set(next.userId, {})
    markArrival(true)
    return true
  }, [applyRemoteAvatar, localUserId, runMovement, shellEntry])

  const deferUntilArrivalLands = useCallback<MiniRoomStore["deferUntilArrivalLands"]>((userId, onLanded) => {
    const walk = arrivalWalksRef.current.get(userId)
    if (!walk) return false
    walk.onLanded = onLanded
    return true
  }, [])

  const setRemotePresence = useCallback((userId: string, present: boolean) => {
    if (!present) {
      cancelActiveMiniRoomMovement(movementRefFor(userId), cancelMiniRoomMovementRun)
      endArrivalWalk(userId, false)
    }
    setAvatars(current => {
      const avatar = current[userId]
      if (!avatar || avatar.present === present) return current
      return { ...current, [userId]: { ...withMiniRoomPresence(avatar, present),
        ...(!present ? { motion: "idle" as const, depthSeatHotspotId: undefined, enteringFromDoor: undefined,
          arrivedByWalk: undefined } : {}) } }
    })
  }, [endArrivalWalk, movementRefFor])

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

  /**
   * Shows `next` and arms one timer for the line that ends first. A speaker
   * whose last line left stops speaking.
   */
  const publishSpeech = useCallback((next: MiniRoomSpeechStack): void => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = null
    const previous = speechRef.current
    speechRef.current = next
    if (next !== previous) {
      setBubbles(next.map(toSpeechBubble))
      for (const speakerUserId of new Set(previous.map((line) => line.speakerUserId))) {
        if (!hasMiniRoomSpeechFrom(next, speakerUserId)) returnAvatarToIdle(speakerUserId)
      }
    }
    const expiry = nextMiniRoomSpeechExpiry(next)
    if (expiry === undefined) return
    bubbleTimerRef.current = setTimeout(() => {
      bubbleTimerRef.current = null
      publishSpeechRef.current(expireMiniRoomSpeech(speechRef.current, Date.now()))
    }, Math.max(0, expiry - Date.now()))
  }, [returnAvatarToIdle])
  // The expiry timer reaches the latest callback through the ref; it is set at
  // commit, before any timer can fire.
  useLayoutEffect(() => {
    publishSpeechRef.current = publishSpeech
  }, [publishSpeech])

  const addSpeechBubble = useCallback<MiniRoomStore["addSpeechBubble"]>((bubble) => {
    const now = Date.now()
    const speakerUserId = bubble.speakerUserId
    publishSpeech(pushMiniRoomSpeech(speechRef.current, {
      key: `bubble_${++bubbleCounterRef.current}_${now}`,
      speakerUserId,
      body: bubble.body,
      lifetimeMs: bubbleLifetimeMs
    }, now))

    setAvatars((current) => {
      const avatar = current[speakerUserId]
      if (!avatar || avatar.motion === "sitting") return current
      return { ...current, [speakerUserId]: { ...avatar, motion: "speaking" } }
    })
    const previousTimer = speechMotionTimersRef.current.get(speakerUserId)
    if (previousTimer) clearTimeout(previousTimer)
    const timer = setTimeout(() => {
      if (speechMotionTimersRef.current.get(speakerUserId) === timer) {
        speechMotionTimersRef.current.delete(speakerUserId)
      }
      setAvatars((current) => {
        const avatar = current[speakerUserId]
        if (!avatar || avatar.motion !== "speaking") return current
        return { ...current, [speakerUserId]: { ...avatar, motion: "idle" } }
      })
    }, 1200)
    speechMotionTimersRef.current.set(speakerUserId, timer)
  }, [bubbleLifetimeMs, publishSpeech])

  const sayPhrase = useCallback<MiniRoomStore["sayPhrase"]>(
    (userId, body, tone = "chat") => {
      addSpeechBubble({ speakerUserId: userId, body, tone })
    },
    [addSpeechBubble]
  )

  const dismissSpeechBubble = useCallback<MiniRoomStore["dismissSpeechBubble"]>(
    (bubbleId) => {
      publishSpeech(dismissMiniRoomSpeech(speechRef.current, bubbleId))
    },
    [publishSpeech]
  )

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
      selectedHotspotId
    }),
    [pressedPoint, selectedHotspotId]
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
    presentArrival,
    deferUntilArrivalLands,
    addSpeechBubble,
    sayPhrase,
    dismissSpeechBubble
  }
}

/** One bubble object per line, so a line that stays keeps its identity. */
const speechBubbles = new WeakMap<MiniRoomSpeech, SpeechBubble>()

function toSpeechBubble(line: MiniRoomSpeech): SpeechBubble {
  let bubble = speechBubbles.get(line)
  if (!bubble) {
    bubble = {
      id: line.key,
      speakerUserId: line.speakerUserId,
      body: line.body,
      tone: "chat",
      createdAt: line.startedAt,
      expiresAt: line.expiresAt
    }
    speechBubbles.set(line, bubble)
  }
  return bubble
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
