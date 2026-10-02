import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useFocusEffect } from "@react-navigation/native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { uiTheme } from "../ui/theme"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { resolveMyRoomAvatarSource } from "../features/avatarV2/myRoomAvatarSource"
import { ROOM_AVATAR_CATALOG } from "../features/avatarV2/room/avatarRoomCatalog"
import { projectAvatarV2ToRoomAvatarAppearance } from "../features/avatarV2/room/avatarRoomProjection"
import {
  createRoomAvatarRenderItem,
  getRoomAvatarAssetCoverage
} from "../features/avatarV2/room/avatarRoomSelectors"
import { resolveRoomAvatarSeatInteractionDecision } from "../features/avatarV2/room/avatarRoomSeatInteraction"
import { RoomRenderer2D } from "../features/roomV2/components/RoomRenderer2D"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2Catalog"
import {
  resolveRoomV2Scene
} from "../features/roomV2/roomV2Selectors"
import { resolveRoomV2MyRoomCamera } from "../features/roomV2/roomV2Camera"
import { resolveMyRoomLayoutMetrics } from "../features/roomV2/myRoomLayoutMetrics"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import { getMyRoomCopy, getMyRoomEditorCopy } from "../features/roomV2/myRoomCopy"
import { getMyRoomStageAccessibilityValue } from "../features/roomV2/myRoomStageModel"
import {
  MyRoomStageLoadingStatus,
  MyRoomStageVeil,
  useMyRoomStageCover
} from "../features/roomV2/components/MyRoomStageVeil"
import { formatRoomOwnerLabel } from "../features/roomV2/roomOwnerLabel"
import { getAppLocale } from "../features/session/authLocale"
import {
  isRoomWorldPointWalkable,
  omitRoomWorldBlockers,
  type RoomWorldGeometry,
  type RoomWorldPoint
} from "../features/roomWorld/roomWorldGeometry"
import {
  createRoomWorldGeometryFromRoomV2Scene,
  createRoomWorldHotspotsFromRoomV2Scene
} from "../features/roomWorld/roomWorldRoomV2Projection"
import {
  combineRoomWorldMovementPlans,
  createRoomWorldMovementPlan,
  createRoomWorldSeatExitMovementPlan,
  createRoomWorldSeatMovementPlan,
  getRoomWorldMovementFramePose,
  getRoomWorldMovementSegmentStartPose,
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING,
  resolveRoomWorldInteractiveTarget,
  resolveRoomWorldSeatSelection
} from "../features/roomWorld/roomWorldRuntime"
import {
  getMyRoomPointDistance,
  getMyRoomWalkActionTarget,
  getWideStageRendererTranslateY,
  MY_ROOM_AVATAR_SIZE,
  MY_ROOM_AVATAR_SPAWN,
  MY_ROOM_MOVEMENT_FEEDBACK_DURATION_MS,
  MY_ROOM_MOVEMENT_NO_OP_DISTANCE,
  MY_ROOM_TRANSIENT_POSE_DURATION_MS
} from "../features/roomWorld/myRoomInteractionModel"
import {
  createMyRoomAvatarDepthNeighbours,
  createMyRoomWalkTimeline,
  getMyRoomAvatarDepthIndex
} from "../features/roomWorld/myRoomAvatarWalkModel"
import { useMyRoomAvatarWalk } from "../features/roomWorld/useMyRoomAvatarWalk"
import {
  INITIAL_ROOM_TAP_MARKER_STATE,
  reduceRoomTapMarker
} from "../features/roomWorld/roomTapMarkerModel"
import type {
  RoomFurnitureRotation,
  RoomV2AvatarMotionState,
  RoomV2RenderItem
} from "../features/roomV2/roomV2.types"
import type { SessionActor } from "../features/session/sessionApi"
import type { CapabilityMap } from "@blumi/contracts"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { hapticError, hapticLight } from "../ui/haptics"
import { useAppViewportMetrics } from "../ui/layout/useAppViewportMetrics"
import { useMyRoomShowcase } from "../features/roomV2/useMyRoomShowcase"
import { MyRoomProfileButton } from "../features/profile/MyRoomProfileButton"
import {
  cancelMyRoomMotionTasks,
  createMyRoomMotionLifecycle,
  resolveMyRoomPoseAfterBlur,
  scheduleMyRoomMotionCallback
} from "./myRoomMotionLifecycle"

type MyRoomNavProps = {
  navigation: NativeStackNavigationProp<RootStackParamList>
  route: { key: string; name: string }
}

type MyRoomScreenProps = MyRoomNavProps & {
  sessionActor: SessionActor
  resolvedCapabilities?: CapabilityMap
}

const ACTIVE_ROOM_FURNITURE_CATALOG = ROOM_V2_FURNITURE_CATALOG
const ACTIVE_ROOM_SHELL_CATALOG = ROOM_V2_SHELL_CATALOG
const MY_ROOM_OWNER_AVATAR_RENDER_ID = "my_room_owner_avatar"
interface MyRoomAvatarPose extends RoomWorldPoint {
  direction: RoomFurnitureRotation
  state: RoomV2AvatarMotionState
}

type MyRoomPoseActionState = Extract<
  RoomV2AvatarMotionState,
  "idle" | "waving" | "dancing"
>

export function MyRoomScreen({
  navigation,
  sessionActor,
  resolvedCapabilities
}: MyRoomScreenProps) {
  const copy = getMyRoomCopy(getAppLocale())
  const roomOwnerLabel = formatRoomOwnerLabel(sessionActor.profile.displayName, getAppLocale())
  const { userRoomDecor, persistenceState } = useRoomV2()
  const { covered: stageCovered, markPainted: handleShellDisplay } =
    useMyRoomStageCover(persistenceState === "loading")
  const { avatar, catalog } = useAvatarV2()
  const displayedAvatar = useMemo(() => resolveMyRoomAvatarSource(
    avatar,
    sessionActor.profile.avatar,
    sessionActor.session.mode === "production"
  ), [avatar, sessionActor.profile.avatar, sessionActor.session.mode])
  const viewport = useAppViewportMetrics({ bottomNavVisible: true })
  const [avatarPose, setAvatarPose] = useState<MyRoomAvatarPose>({
    ...MY_ROOM_AVATAR_SPAWN,
    state: "idle"
  })
  const avatarPoseRef = useRef(avatarPose)
  const motionLifecycle = useMemo(() => createMyRoomMotionLifecycle(), [])
  const isMountedRef = useRef(false)
  // The generation of the UI-thread walk in flight, or null when none runs.
  const liveWalkRef = useRef<number | null>(null)
  const transientPoseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movementFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [movementFeedback, setMovementFeedback] = useState<string | undefined>()
  // The walk destination marker; roomTapMarkerModel guarantees it leaves
  // with its walk, however that walk ends.
  const [tapMarker, dispatchTapMarker] = useReducer(reduceRoomTapMarker, INITIAL_ROOM_TAP_MARKER_STATE)
  const markerCounterRef = useRef(0)
  const stageMarkers = useMemo(() => tapMarker.marker
    ? [{
        id: String(tapMarker.marker.id),
        x: tapMarker.marker.x,
        y: tapMarker.marker.y,
        tone: "target" as const,
        leaving: tapMarker.marker.leaving
      }]
    : undefined, [tapMarker.marker])
  const handleStageMarkerFaded = useCallback((markerId: string): void => {
    dispatchTapMarker({ type: "faded", markerId: Number(markerId) })
  }, [])
  const [stageWidth, setStageWidth] = useState(0)
  const { roomShowcasePublic, openRoomShowcase } = useMyRoomShowcase({
    sessionActor,
    resolvedCapabilities,
    tryAgainCopy: copy.tryAgain
  })
  const [seatedFurnitureRenderId, setSeatedFurnitureRenderId] = useState<string>()
  const [seatedSeatId, setSeatedSeatId] = useState<string>()

  const baseRoomScene = useMemo(
    () =>
      resolveRoomV2Scene({
        roomShellCatalog: ACTIVE_ROOM_SHELL_CATALOG,
        furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG,
        decor: userRoomDecor,
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      }),
    [userRoomDecor]
  )
  const roomWorldGeometry = useMemo(
    () => createRoomWorldGeometryFromRoomV2Scene(baseRoomScene),
    [baseRoomScene]
  )
  const roomWorldHotspots = useMemo(
    () => createRoomWorldHotspotsFromRoomV2Scene(baseRoomScene),
    [baseRoomScene]
  )
  const shellCamera = resolveRoomV2MyRoomCamera(
    baseRoomScene.shell?.myRoomCamera
  )
  const resolvedStageWidth = stageWidth || viewport.contentWidth
  const layoutMetrics = resolveMyRoomLayoutMetrics({
    viewportWidth: viewport.safeWidth,
    contentWidth: resolvedStageWidth,
    availableContentHeight: viewport.contentHeight,
    bottomContentInset: viewport.bottomContentInset,
    camera: shellCamera
  })
  const stageHeight = layoutMetrics.stageHeight
  const usesWideStageCamera = layoutMetrics.usesWideStageCamera
  const stageRendererWidth = layoutMetrics.rendererWidth
  const seatedHotspot = useMemo(() => seatedFurnitureRenderId
    ? roomWorldHotspots.find((hotspot) =>
      hotspot.kind === "seat" &&
      hotspot.sourceRenderId === seatedFurnitureRenderId &&
      (!seatedSeatId || hotspot.seatId === seatedSeatId)
    )
    : undefined, [roomWorldHotspots, seatedFurnitureRenderId, seatedSeatId])
  const avatarDepthNeighbours = useMemo(() => createMyRoomAvatarDepthNeighbours(
    baseRoomScene.renderItems,
    { layer: "furniture", renderId: MY_ROOM_OWNER_AVATAR_RENDER_ID }
  ), [baseRoomScene.renderItems])
  // The walk runs on the UI thread; React takes the live point only when the
  // avatar passes in front of or behind furniture (render order changes).
  const syncAvatarRenderOrder = useCallback((x: number, y: number): void => {
    if (liveWalkRef.current === null) return
    const nextPose = { ...avatarPoseRef.current, x, y }
    avatarPoseRef.current = nextPose
    setAvatarPose(nextPose)
  }, [])
  const avatarWalk = useMyRoomAvatarWalk({
    initial: MY_ROOM_AVATAR_SPAWN,
    depthNeighbours: avatarDepthNeighbours,
    fixedDepth: seatedHotspot?.renderDepth,
    onDepthIndexChange: syncAvatarRenderOrder
  })
  const liveAvatarY = avatarWalk.y
  const liveAvatarPosition = useMemo(() => ({
    renderId: MY_ROOM_OWNER_AVATAR_RENDER_ID,
    x: avatarWalk.x,
    y: avatarWalk.y,
    walkPath: avatarWalk.path
  }), [avatarWalk.path, avatarWalk.x, avatarWalk.y])
  const wideStageCamera = usesWideStageCamera && baseRoomScene.shell
    ? {
        stageWidth: resolvedStageWidth,
        stageHeight,
        shellCanvasWidth: baseRoomScene.shell.canvasSize.width,
        shellCanvasHeight: baseRoomScene.shell.canvasSize.height
      }
    : null
  const fixedRendererTranslateY = layoutMetrics.rendererTranslateY
  // The wide-stage camera follows the live avatar point on the UI thread.
  const stageCameraStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: wideStageCamera
        ? getWideStageRendererTranslateY({ ...wideStageCamera, avatarWorldY: liveAvatarY.value })
        : fixedRendererTranslateY
    }]
  }))

  const projectedRoomAvatar = useMemo(
    () =>
      projectAvatarV2ToRoomAvatarAppearance({
        avatar: displayedAvatar,
        avatarCatalog: catalog,
        roomAvatarCatalog: ROOM_AVATAR_CATALOG
      }).appearance,
    [displayedAvatar, catalog]
  )
  const roomAvatar = useMemo(() => {
    const avatarSize = usesWideStageCamera
      ? MY_ROOM_AVATAR_SIZE.wide
      : MY_ROOM_AVATAR_SIZE.compact
    return createRoomAvatarRenderItem({
      avatarId: "my-room-owner",
      name: sessionActor.profile.displayName,
      appearance: projectedRoomAvatar,
      x: avatarPose.x,
      y: avatarPose.y,
      width: avatarSize.width,
      height: avatarSize.height,
      renderId: MY_ROOM_OWNER_AVATAR_RENDER_ID,
      direction: avatarPose.direction,
      state: avatarPose.state,
      depth: seatedHotspot?.renderDepth ?? avatarPose.y,
      seatRig: avatarPose.state === "sitting" && seatedHotspot?.seatHeight !== undefined
        ? {
            furnitureRenderId: seatedFurnitureRenderId!,
            seatId: seatedHotspot.seatId ?? seatedHotspot.id,
            seatHeight: seatedHotspot.seatHeight,
            facing: seatedHotspot.facing ?? avatarPose.direction
          }
        : undefined
    })
  }, [
    avatarPose.direction,
    avatarPose.state,
    avatarPose.x,
    avatarPose.y,
    projectedRoomAvatar,
    seatedHotspot,
    sessionActor.profile.displayName,
    seatedFurnitureRenderId,
    usesWideStageCamera
  ])

  // The avatar's place in the draw order: by its feet against each
  // footprint's front edge (the same rule the UI thread uses while walking).
  const renderItems = useMemo(() => {
    const index = seatedHotspot?.renderDepth === undefined
      ? getMyRoomAvatarDepthIndex(avatarDepthNeighbours, roomAvatar.depth, roomAvatar.x, roomAvatar.y)
      : getMyRoomAvatarDepthIndex(avatarDepthNeighbours, roomAvatar.depth)
    return [
      ...baseRoomScene.renderItems.slice(0, index),
      roomAvatar,
      ...baseRoomScene.renderItems.slice(index)
    ]
  }, [avatarDepthNeighbours, baseRoomScene.renderItems, roomAvatar, seatedHotspot?.renderDepth])

  useEffect(() => {
    avatarPoseRef.current = avatarPose
  }, [avatarPose])

  // A running walk stops where the avatar is, and React takes that point.
  const stopLiveWalk = useCallback((): void => {
    const point = avatarWalk.stop()
    const stoppedPose = { ...avatarPoseRef.current, x: point.x, y: point.y }
    avatarPoseRef.current = stoppedPose
    setAvatarPose(stoppedPose)
  }, [avatarWalk])

  // The avatar pose including the live point of a walk in flight.
  const readAvatarPose = useCallback((): MyRoomAvatarPose => liveWalkRef.current === null
    ? avatarPoseRef.current
    : { ...avatarPoseRef.current, x: avatarWalk.x.value, y: avatarWalk.y.value }, [avatarWalk])

  const cancelPendingMotionWork = useCallback((): void => {
    motionLifecycle.blur()
    cancelMyRoomMotionTasks({
      refs: {
        animationFrame: liveWalkRef,
        transientPoseTimer: transientPoseTimerRef,
        movementFeedbackTimer: movementFeedbackTimerRef
      },
      cancelFrame: stopLiveWalk,
      clearTimer: clearTimeout
    })
  }, [motionLifecycle, stopLiveWalk])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      cancelPendingMotionWork()
    }
  }, [cancelPendingMotionWork])

  useFocusEffect(useCallback(() => {
    motionLifecycle.focus()
    return () => {
      cancelPendingMotionWork()
      if (!isMountedRef.current) return

      const currentPose = avatarPoseRef.current
      const restingPose = resolveMyRoomPoseAfterBlur(currentPose)
      if (restingPose !== currentPose) {
        avatarPoseRef.current = restingPose
        setAvatarPose(restingPose)
      }
      // A walk interrupted before arrival must not leave stale seat ownership
      // or a partially completed seat transition behind.
      if (currentPose.state === "walking") {
        setSeatedFurnitureRenderId(undefined)
        setSeatedSeatId(undefined)
      }
      dispatchTapMarker({ type: "walk_ended" })
      setMovementFeedback(undefined)
    }
  }, [cancelPendingMotionWork, motionLifecycle]))

  const showMovementFeedback = useCallback((message: string): void => {
    if (!motionLifecycle.isFocused()) return
    if (movementFeedbackTimerRef.current !== null) {
      clearTimeout(movementFeedbackTimerRef.current)
    }
    setMovementFeedback(message)
    const generation = motionLifecycle.currentGeneration()
    movementFeedbackTimerRef.current = scheduleMyRoomMotionCallback(
      motionLifecycle,
      generation,
      (callback) => setTimeout(callback, MY_ROOM_MOVEMENT_FEEDBACK_DURATION_MS),
      () => {
        movementFeedbackTimerRef.current = null
        setMovementFeedback(undefined)
      }
    )
  }, [motionLifecycle])

  useEffect(() => {
    const clearance = { clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE }
    if (isRoomWorldPointWalkable(roomWorldGeometry, readAvatarPose(), clearance)) return
    if (!isRoomWorldPointWalkable(roomWorldGeometry, MY_ROOM_AVATAR_SPAWN, clearance)) return
    if (liveWalkRef.current !== null) {
      // Placing the avatar cancels the UI-thread walk; its steps must not land.
      liveWalkRef.current = null
      motionLifecycle.begin()
      dispatchTapMarker({ type: "walk_ended" })
    }
    const nextPose = {
      ...MY_ROOM_AVATAR_SPAWN,
      state: "idle" as const
    }
    avatarPoseRef.current = nextPose
    setAvatarPose(nextPose)
    avatarWalk.place(nextPose)
    setSeatedFurnitureRenderId(undefined)
    setSeatedSeatId(undefined)
  }, [avatarWalk, motionLifecycle, readAvatarPose, roomWorldGeometry])

  const moveAvatarToPoint = useCallback((
    target: RoomWorldPoint,
    arrival?: {
      direction?: RoomFurnitureRotation
      state?: Extract<RoomV2AvatarMotionState, "idle" | "walking" | "sitting">
      geometry?: RoomWorldGeometry
      seatedFurnitureRenderId?: string
      seatedSeatId?: string
      seat?: {
        approach: RoomWorldPoint
        point: RoomWorldPoint
        furnitureRenderId: string
        seatId: string
      }
    }
  ): void => {
    if (!motionLifecycle.isFocused()) return
    if (transientPoseTimerRef.current !== null) {
      clearTimeout(transientPoseTimerRef.current)
      transientPoseTimerRef.current = null
    }
    const start = readAvatarPose()
    const currentSeatHotspots = seatedFurnitureRenderId
      ? roomWorldHotspots.filter((hotspot) =>
        hotspot.kind === "seat" && hotspot.sourceRenderId === seatedFurnitureRenderId
      )
      : []
    const currentSeatHotspot = currentSeatHotspots.reduce<typeof currentSeatHotspots[number] | undefined>(
      (closest, hotspot) => {
        if (!closest) return hotspot
        const closestDistance = getMyRoomPointDistance(start, closest)
        const hotspotDistance = getMyRoomPointDistance(start, hotspot)
        return hotspotDistance < closestDistance ? hotspot : closest
      },
      undefined
    )
    const currentSeatExit = currentSeatHotspot?.exitPoint && seatedFurnitureRenderId
      ? { point: currentSeatHotspot.exitPoint, furnitureRenderId: seatedFurnitureRenderId }
      : undefined
    const defaultGeometry = currentSeatExit
      ? roomWorldGeometry
      : seatedFurnitureRenderId
      ? omitRoomWorldBlockers(roomWorldGeometry, [seatedFurnitureRenderId])
      : roomWorldGeometry
    const movementGeometry = arrival?.geometry ?? defaultGeometry
    const seatDeparturePlan = arrival?.seat && currentSeatExit
      ? createRoomWorldSeatExitMovementPlan({
        geometry: roomWorldGeometry,
        from: start,
        exit: currentSeatExit.point,
        target: arrival.seat.approach,
        seatedFurnitureRenderId: currentSeatExit.furnitureRenderId,
        clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
        timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
      })
      : undefined
    if (arrival?.seat && currentSeatExit && !seatDeparturePlan) {
      hapticError()
      showMovementFeedback(copy.makeRoom)
      return
    }
    const seatPlan = arrival?.seat
      ? createRoomWorldSeatMovementPlan({
        geometry: movementGeometry,
        from: seatDeparturePlan?.target ?? start,
        approach: arrival.seat.approach,
        seat: arrival.seat.point,
        seatedFurnitureRenderId: arrival.seat.furnitureRenderId,
        clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
        timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
      })
      : null
    if (arrival?.seat && !seatPlan) {
      hapticError()
      showMovementFeedback(copy.makeRoom)
      return
    }
    // The floor point under the finger, or the reachable spot right next to it.
    const resolvedTarget = seatPlan?.target ?? resolveRoomWorldInteractiveTarget({
      geometry: movementGeometry,
      target,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      from: start
    })
    if (!resolvedTarget) {
      hapticError()
      showMovementFeedback(copy.chooseOpenFloor)
      return
    }
    if (getMyRoomPointDistance(start, resolvedTarget) <= MY_ROOM_MOVEMENT_NO_OP_DISTANCE) {
      const restingPose: MyRoomAvatarPose = {
        x: start.x,
        y: start.y,
        direction: arrival?.direction ?? start.direction,
        state: arrival?.state ?? "idle"
      }
      // A walk in flight keeps walking, as the next animation frame used to
      // overwrite this pose immediately.
      if (liveWalkRef.current === null) {
        avatarPoseRef.current = restingPose
        setAvatarPose(restingPose)
      }
      setSeatedFurnitureRenderId(arrival?.seatedFurnitureRenderId)
      setSeatedSeatId(arrival?.seatedSeatId ?? arrival?.seat?.seatId)
      hapticLight()
      showMovementFeedback(restingPose.state === "sitting" ? copy.settledIn : copy.alreadyHere)
      return
    }
    const exitPlan = !seatPlan && currentSeatExit
      ? createRoomWorldSeatExitMovementPlan({
        geometry: roomWorldGeometry,
        from: start,
        exit: currentSeatExit.point,
        target: resolvedTarget,
        seatedFurnitureRenderId: currentSeatExit.furnitureRenderId,
        clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
        timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
      })
      : null
    if (!seatPlan && currentSeatExit && !exitPlan) {
      hapticError()
      showMovementFeedback(copy.chooseOpenFloor)
      return
    }
    const plan = seatPlan
      ? seatDeparturePlan
        ? combineRoomWorldMovementPlans([seatDeparturePlan, seatPlan])
        : seatPlan
      : exitPlan ?? createRoomWorldMovementPlan({
        geometry: movementGeometry,
        from: start,
        to: resolvedTarget,
        clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
        timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
      })
    if (!plan) {
      hapticError()
      showMovementFeedback(copy.nearbyTile)
      return
    }

    const motionGeneration = motionLifecycle.begin()
    if (liveWalkRef.current !== null) {
      // The new walk continues from wherever the running one has reached.
      liveWalkRef.current = null
      avatarWalk.stop()
    }
    if (movementFeedbackTimerRef.current !== null) {
      clearTimeout(movementFeedbackTimerRef.current)
      movementFeedbackTimerRef.current = null
    }
    setMovementFeedback(undefined)
    // The marker shows where the avatar is going: the resolved destination.
    markerCounterRef.current += 1
    const markerId = markerCounterRef.current
    dispatchTapMarker({ type: "walk_started", markerId, point: plan.target })

    // React takes a pose at each step start and on arrival; every frame in
    // between runs on the UI thread (useMyRoomAvatarWalk).
    const commitSegmentStartPose = (pathIndex: number): void => {
      const segmentStartPose = getRoomWorldMovementSegmentStartPose(plan.segments[pathIndex]!)
      const startingPose: MyRoomAvatarPose = {
        x: segmentStartPose.x,
        y: segmentStartPose.y,
        direction: segmentStartPose.facing,
        state: segmentStartPose.motion
      }
      avatarPoseRef.current = startingPose
      setAvatarPose(startingPose)
    }
    commitSegmentStartPose(0)
    liveWalkRef.current = motionGeneration
    avatarWalk.start(createMyRoomWalkTimeline(plan), (pathIndex) => {
      if (!motionLifecycle.isCurrent(motionGeneration)) return
      const segment = plan.segments[pathIndex]!
      if (!segment.isFinal) {
        commitSegmentStartPose(pathIndex + 1)
        return
      }
      liveWalkRef.current = null
      const runtimePose = getRoomWorldMovementFramePose({
        frame: { x: segment.to.x, y: segment.to.y, facing: segment.facing, progress: 1, isComplete: true },
        segment,
        arrival: {
          facing: arrival?.direction,
          motion: arrival?.state
        }
      })
      const arrivedPose: MyRoomAvatarPose = {
        x: runtimePose.x,
        y: runtimePose.y,
        direction: runtimePose.facing,
        state: runtimePose.motion
      }
      avatarPoseRef.current = arrivedPose
      setAvatarPose(arrivedPose)
      setSeatedFurnitureRenderId(arrival?.seatedFurnitureRenderId)
      setSeatedSeatId(arrival?.seatedSeatId ?? arrival?.seat?.seatId)
      dispatchTapMarker({ type: "arrived", markerId })
      hapticLight()
    })
  }, [avatarWalk, copy, motionLifecycle, readAvatarPose, roomWorldGeometry, roomWorldHotspots, seatedFurnitureRenderId, showMovementFeedback])

  const handlePoseAction = useCallback((state: MyRoomPoseActionState): void => {
    if (!motionLifecycle.isFocused()) return
    const motionGeneration = motionLifecycle.begin()
    if (movementFeedbackTimerRef.current !== null) {
      clearTimeout(movementFeedbackTimerRef.current)
      movementFeedbackTimerRef.current = null
    }
    setMovementFeedback(undefined)
    if (transientPoseTimerRef.current !== null) {
      clearTimeout(transientPoseTimerRef.current)
      transientPoseTimerRef.current = null
    }
    if (liveWalkRef.current !== null) {
      liveWalkRef.current = null
      stopLiveWalk()
      // The walk is over where the avatar stopped: its marker goes too.
      dispatchTapMarker({ type: "walk_ended" })
    }

    const nextPose: MyRoomAvatarPose = {
      ...avatarPoseRef.current,
      direction: state === "idle" ? avatarPoseRef.current.direction : "front",
      state
    }
    avatarPoseRef.current = nextPose
    setAvatarPose(nextPose)

    if (state === "idle") return

    transientPoseTimerRef.current = scheduleMyRoomMotionCallback(
      motionLifecycle,
      motionGeneration,
      (callback) => setTimeout(callback, MY_ROOM_TRANSIENT_POSE_DURATION_MS),
      () => {
        const restingPose: MyRoomAvatarPose = {
          ...avatarPoseRef.current,
          state: "idle"
        }
        avatarPoseRef.current = restingPose
        setAvatarPose(restingPose)
        transientPoseTimerRef.current = null
      }
    )
  }, [motionLifecycle, stopLiveWalk])

  const handleWalkAction = useCallback((): void => {
    const currentPose = readAvatarPose()
    const target = getMyRoomWalkActionTarget({
      geometry: roomWorldGeometry,
      from: currentPose
    })
    if (!target) {
      hapticError()
      showMovementFeedback(copy.nearbyTile)
      return
    }
    moveAvatarToPoint(target, {
      direction: "front",
      state: "idle"
    })
  }, [copy.nearbyTile, moveAvatarToPoint, readAvatarPose, roomWorldGeometry, showMovementFeedback])
  const handleAvatarTap = useCallback(() => {
    const currentState = avatarPoseRef.current.state
    if (currentState === "idle") {
      handlePoseAction("waving")
    } else if (currentState === "waving") {
      handlePoseAction("dancing")
    } else if (currentState === "dancing") {
      handleWalkAction()
    } else {
      handlePoseAction("idle")
    }
  }, [handlePoseAction, handleWalkAction])

  const handleRoomItemTap = useCallback((item: RoomV2RenderItem): void => {
    if (item.renderId === MY_ROOM_OWNER_AVATAR_RENDER_ID) {
      handleAvatarTap()
      return
    }
    if (item.kind !== "furniture" || item.interactionType !== "seat") return
    const seatCandidate = resolveRoomWorldSeatSelection({
      geometry: roomWorldGeometry,
      from: readAvatarPose(),
      hotspots: roomWorldHotspots,
      seatedFurnitureRenderId: item.renderId,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
    })
    const seatHotspot = seatCandidate?.hotspot
    const seatApproach = seatCandidate?.approach
    if (!seatHotspot || !seatApproach) {
      hapticError()
      showMovementFeedback(copy.makeRoom)
      return
    }
    const seatDirection = seatHotspot.facing ?? item.rotation
    const sittingCoverage = getRoomAvatarAssetCoverage({
      appearance: projectedRoomAvatar,
      catalog: ROOM_AVATAR_CATALOG,
      direction: seatDirection,
      state: "sitting"
    })
    const seatDecision = resolveRoomAvatarSeatInteractionDecision({
      coverage: sittingCoverage,
      seatDirection
    })
    if (!seatDecision.canSit) {
      hapticError()
      showMovementFeedback(seatDecision.feedback)
      return
    }
    moveAvatarToPoint({ x: seatHotspot.x, y: seatHotspot.y }, {
      direction: seatDirection,
      state: seatDecision.state,
      geometry: seatHotspot.approachPoint ? undefined : omitRoomWorldBlockers(roomWorldGeometry, [item.renderId]),
      seatedFurnitureRenderId: item.renderId,
      seatedSeatId: seatHotspot.seatId ?? seatHotspot.id,
      seat: {
        approach: seatApproach,
        point: { x: seatHotspot.x, y: seatHotspot.y },
        furnitureRenderId: item.renderId,
        seatId: seatHotspot.seatId ?? seatHotspot.id
      }
    })
  }, [
    copy.makeRoom,
    handleAvatarTap,
    moveAvatarToPoint,
    projectedRoomAvatar,
    readAvatarPose,
    roomWorldGeometry,
    roomWorldHotspots,
    showMovementFeedback
  ])

  const handleStageLayout = useCallback((event: LayoutChangeEvent): void => {
    const nextWidth = Math.round(event.nativeEvent.layout.width)
    setStageWidth((current) => current === nextWidth ? current : nextWidth)
  }, [])

  return (
    <SafeAreaView contentGutter={false} style={styles.myRoomRoot}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: viewport.horizontalGutter,
            paddingBottom: layoutMetrics.contentBottomPadding
          }
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.myRoomTitle}>{copy.title}</Text>
            <Text style={styles.myRoomSubtitle}>{copy.subtitle}</Text>
          </View>
          <MyRoomProfileButton
            displayName={sessionActor.profile.displayName}
            userId={sessionActor.profile.userId}
            onPress={() => navigation.navigate("You")}
          />
        </View>

        <View style={styles.roomStack}>
          <View
            onLayout={handleStageLayout}
            style={[styles.stageCard, { height: stageHeight }]}
          >
            <View style={styles.stageBackdrop} pointerEvents="none" />
            {persistenceState === "loading" ? (
              <MyRoomStageLoadingStatus label={getMyRoomEditorCopy(getAppLocale()).preparing} />
            ) : <Animated.View style={stageCameraStyle}><RoomRenderer2D
              shell={baseRoomScene.shell}
              liveAvatarPosition={liveAvatarPosition}
              renderItems={renderItems}
              stageMarkers={stageMarkers}
              onStageMarkerFaded={handleStageMarkerFaded}
              testID="my-room-production-stage"
              roomVNextRuntimeMode="disabled"
              accessibilityValue={{ text: getMyRoomStageAccessibilityValue({ savedItemCount: userRoomDecor.placedItems.length, locale: getAppLocale() }) }}
              onStagePress={moveAvatarToPoint}
              onItemTap={handleRoomItemTap}
              style={[styles.stageRenderer, { width: stageRendererWidth }]}
              onShellDisplay={handleShellDisplay}
            /></Animated.View>}
            <MyRoomStageVeil covered={stageCovered} />
            {roomOwnerLabel ? (
              <View style={styles.stageHud} pointerEvents="none">
                <Ionicons name="heart" size={13} color="#D92A79" />
                <Text style={styles.stageHeaderText} numberOfLines={1}>
                  {roomOwnerLabel}
                </Text>
              </View>
            ) : null}
            {movementFeedback ? (
              <View style={styles.movementFeedbackPill} pointerEvents="none">
                <Ionicons name="footsteps" size={14} color="#FFB4C8" />
                <Text style={styles.movementFeedbackText} numberOfLines={1}>
                  {movementFeedback}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.roomControlPanel}>
            <View style={styles.stageActionDock}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.openWardrobe}
                style={({ pressed }) => [
                  styles.stageActionItem,
                  pressed ? styles.stageActionButtonPressed : null
                ]}
                onPress={() => navigation.navigate("WardrobeV2")}
              >
                <Ionicons name="shirt-outline" size={19} color="#702344" />
                <Text style={styles.stageActionText} numberOfLines={1}>
                  {copy.wardrobeShort}
                </Text>
              </Pressable>
              <View style={styles.stageActionDivider} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.editRoom}
                style={({ pressed }) => [
                  styles.stageActionItem,
                  styles.stageActionItemPrimary,
                  pressed ? styles.stageActionButtonPressed : null
                ]}
                onPress={() => navigation.navigate("MyRoomEditor")}
              >
                <Ionicons name="brush" size={19} color="#FFFFFF" />
                <Text style={[styles.stageActionText, styles.stageActionTextPrimary]} numberOfLines={1}>
                  {copy.editRoom}
                </Text>
              </Pressable>
              <View style={styles.stageActionDivider} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.showcase}
                style={({ pressed }) => [
                  styles.stageActionItem,
                  pressed ? styles.stageActionButtonPressed : null
                ]}
                onPress={openRoomShowcase}
              >
                <Ionicons
                  name={roomShowcasePublic ? "eye" : "card-outline"}
                  size={19}
                  color="#702344"
                />
                <Text style={styles.stageActionText} numberOfLines={1}>
                  {roomShowcasePublic ? copy.showcasePublicShort : copy.showcaseShort}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#070B1D",
  },
  myRoomRoot: {
    flex: 1,
    backgroundColor: uiTheme.colors.background,
  },
  content: {
    gap: uiTheme.spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.xs,
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: 0,
    gap: uiTheme.spacing.sm,
  },
  headerText: { flex: 1 },
  title: {
    ...uiTheme.font.heading,
    color: "#FFFFFF",
  },
  subtitle: {
    ...uiTheme.font.caption,
    marginTop: 3,
    color: "rgba(255,255,255,0.62)",
  },
  myRoomTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
  },
  myRoomSubtitle: {
    ...uiTheme.font.caption,
    marginTop: 3,
    color: uiTheme.colors.textSecondary,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  roomStack: {
    gap: 0,
    overflow: "hidden",
    borderRadius: 34,
    backgroundColor: "#E8B698",
    borderWidth: 1,
    borderColor: "rgba(255, 183, 217, 0.18)",
    ...uiTheme.shadow.deep,
  },
  roomControlPanel: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#E8B698",
  },
  stageActionDock: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#FFF8F6",
    borderWidth: 1,
    borderColor: "#F0E1E7",
    overflow: "hidden",
    ...uiTheme.shadow.soft,
  },
  stageActionItem: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 5,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  stageActionItemPrimary: {
    flex: 1.45,
    margin: 5,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: uiTheme.colors.primaryDeep,
  },
  stageActionButtonPressed: {
    opacity: 0.82,
    backgroundColor: "rgba(197, 38, 114, 0.08)",
  },
  stageActionText: {
    ...uiTheme.font.captionBold,
    flexShrink: 1,
    fontSize: 11,
    color: "#702344",
    textAlign: "center",
  },
  stageActionTextActive: {
    color: "#C52672",
  },
  stageActionTextPrimary: {
    color: "#FFFFFF",
  },
  stageActionDivider: {
    width: 1,
    alignSelf: "center",
    height: 32,
    backgroundColor: "rgba(112, 35, 68, 0.14)",
  },
  stageCard: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderTopLeftRadius: 33,
    borderTopRightRadius: 33,
    backgroundColor: "#E8B698",
  },
  stageBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#E8B698",
  },
  stageRenderer: {
    backgroundColor: "#E8B698",
  },
  stageHud: {
    position: "absolute",
    left: 14,
    top: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 250, 248, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(217, 42, 121, 0.16)",
  },
  qaPreviewPill: {
    position: "absolute",
    top: 62,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "84%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(52, 35, 12, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255, 235, 159, 0.52)",
  },
  qaPreviewText: {
    ...uiTheme.font.captionBold,
    color: "#FFF7D6",
    fontSize: 10.5,
  },
  movementFeedbackPill: {
    position: "absolute",
    alignSelf: "center",
    top: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    maxWidth: 170,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(34, 9, 22, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 180, 200, 0.28)",
  },
  movementFeedbackText: {
    ...uiTheme.font.captionBold,
    color: "#FFEAF4",
    fontSize: 11,
  },
  stageHeaderText: {
    ...uiTheme.font.captionBold,
    color: "#702344",
  },
})
