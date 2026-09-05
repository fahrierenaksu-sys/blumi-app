import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import * as Sentry from "@sentry/react-native"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type LayoutChangeEvent,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native"
import { uiTheme } from "../ui/theme"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { ROOM_AVATAR_CATALOG } from "../features/avatarV2/room/avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "../features/avatarV2/room/avatarRoomProjection"
import {
  createRoomAvatarRenderItem,
  getRoomAvatarAssetCoverage
} from "../features/avatarV2/room/avatarRoomSelectors"
import { resolveRoomAvatarSeatInteractionDecision } from "../features/avatarV2/room/avatarRoomSeatInteraction"
import {
  RoomRenderer2D,
  type RoomRendererStageMarker
} from "../features/roomV2/components/RoomRenderer2D"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2.mock"
import {
  insertRoomV2RenderItemSorted,
  resolveRoomV2Scene
} from "../features/roomV2/roomV2Selectors"
import { resolveRoomV2MyRoomCamera } from "../features/roomV2/roomV2Camera"
import { resolveMyRoomLayoutMetrics } from "../features/roomV2/myRoomLayoutMetrics"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import { getMyRoomCopy } from "../features/roomV2/myRoomCopy"
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
  getRoomWorldMovementFrame,
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
import type {
  RoomFurnitureRotation,
  RoomV2AvatarMotionState,
  RoomV2RenderItem
} from "../features/roomV2/roomV2.types"
import type { SessionActor } from "../features/session/sessionApi"
import type { CapabilityMap } from "@blumi/contracts"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { hapticError, hapticLight } from "../ui/haptics"
import {
  MOBILE_HTTP_BASE_URL
} from "../config/env"
import { showToast } from "../ui/toast"
import { useAppViewportMetrics } from "../ui/layout/useAppViewportMetrics"
import { updateRoomShowcaseVisibility } from "../features/discovery/roomShowcaseApi"

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
  const { userRoomDecor } = useRoomV2()
  const { avatar, catalog } = useAvatarV2()
  const viewport = useAppViewportMetrics({ bottomNavVisible: true })
  const [avatarPose, setAvatarPose] = useState<MyRoomAvatarPose>({
    ...MY_ROOM_AVATAR_SPAWN,
    state: "idle"
  })
  const avatarPoseRef = useRef(avatarPose)
  const animationFrameRef = useRef<number | null>(null)
  const transientPoseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movementFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [movementFeedback, setMovementFeedback] = useState<string | undefined>()
  const [stageMarker, setStageMarker] = useState<RoomRendererStageMarker | undefined>()
  const [stageWidth, setStageWidth] = useState(0)
  const [roomShowcasePublic, setRoomShowcasePublic] = useState(false)
  const roomShowcaseEnabled = sessionActor.session.mode === "production" &&
    resolvedCapabilities?.discovery_room_showcase === true

  const setRoomShowcase = useCallback(async (
    isPublic: boolean,
    headline: string | null
  ): Promise<void> => {
    try {
      const result = await updateRoomShowcaseVisibility(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { isPublic, headline }
      )
      setRoomShowcasePublic(result.isPublic)
      showToast({
        title: result.isPublic ? "Kart vitrini güncellendi" : "Oda karttan kaldırıldı",
        body: result.isPublic
          ? "Son kaydettiğin oda, kartının arkasında gösterilecek."
          : "Odan artık Discovery kartlarında görünmeyecek.",
        type: "success"
      })
    } catch (error) {
      Sentry.captureException(error, { tags: { feature: "room_showcase" } })
      showToast({
        title: "Kart vitrini kullanılamıyor",
        body: error instanceof Error ? error.message : copy.tryAgain,
        type: "warning"
      })
    }
  }, [copy.tryAgain, sessionActor])

  const openRoomShowcase = useCallback((): void => {
    if (!roomShowcaseEnabled) {
      showToast({
        title: "Kart vitrini henüz açık değil",
        body: "Bu özellik kademeli olarak açılıyor.",
        type: "info"
      })
      return
    }
    if (roomShowcasePublic) {
      Alert.alert(
        "Oda vitrini",
        "Son kaydettiğin oda Discovery kartının arkasında gösteriliyor.",
        [
          { text: "Kapat", style: "cancel" },
          {
            text: "Karttan kaldır",
            style: "destructive",
            onPress: () => { void setRoomShowcase(false, null) }
          }
        ]
      )
      return
    }
    Alert.prompt(
      "Oda vitrini",
      "Kartının yanında görünecek kısa başlık (isteğe bağlı, en fazla 30 karakter).",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kartında göster",
          onPress: (value?: string) => {
            const headline = value?.trim() || null
            void setRoomShowcase(true, headline)
          }
        }
      ],
      "plain-text",
      ""
    )
  }, [roomShowcaseEnabled, roomShowcasePublic, setRoomShowcase])
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
  const stageRendererTranslateY = usesWideStageCamera && baseRoomScene.shell
    ? getWideStageRendererTranslateY({
        stageWidth: resolvedStageWidth,
        stageHeight,
        shellCanvasWidth: baseRoomScene.shell.canvasSize.width,
        shellCanvasHeight: baseRoomScene.shell.canvasSize.height,
        avatarWorldY: avatarPose.y
      })
    : layoutMetrics.rendererTranslateY

  const projectedRoomAvatar = useMemo(
    () =>
      projectAvatarV2ToRoomAvatarAppearance({
        avatar,
        avatarCatalog: catalog,
        roomAvatarCatalog: ROOM_AVATAR_CATALOG
      }).appearance,
    [avatar, catalog]
  )
  const roomAvatar = useMemo(() => {
    const avatarSize = usesWideStageCamera
      ? MY_ROOM_AVATAR_SIZE.wide
      : MY_ROOM_AVATAR_SIZE.compact
    const seatedHotspot = seatedFurnitureRenderId
      ? roomWorldHotspots.find((hotspot) =>
        hotspot.kind === "seat" &&
        hotspot.sourceRenderId === seatedFurnitureRenderId &&
        (!seatedSeatId || hotspot.seatId === seatedSeatId)
      )
      : undefined
    return createRoomAvatarRenderItem({
      avatarId: "my-room-owner",
      name: sessionActor.profile.displayName,
      appearance: projectedRoomAvatar,
      x: avatarPose.x,
      y: avatarPose.y,
      width: avatarSize.width,
      height: avatarSize.height,
      renderId: "my_room_owner_avatar",
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
    roomWorldHotspots,
    sessionActor.profile.displayName,
    seatedFurnitureRenderId,
    seatedSeatId,
    usesWideStageCamera
  ])

  const renderItems = useMemo(
    () => insertRoomV2RenderItemSorted(baseRoomScene.renderItems, roomAvatar),
    [baseRoomScene.renderItems, roomAvatar]
  )

  useEffect(() => {
    avatarPoseRef.current = avatarPose
  }, [avatarPose])

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (transientPoseTimerRef.current !== null) {
      clearTimeout(transientPoseTimerRef.current)
    }
    if (movementFeedbackTimerRef.current !== null) {
      clearTimeout(movementFeedbackTimerRef.current)
    }
  }, [])

  const showMovementFeedback = useCallback((message: string): void => {
    if (movementFeedbackTimerRef.current !== null) {
      clearTimeout(movementFeedbackTimerRef.current)
    }
    setMovementFeedback(message)
    movementFeedbackTimerRef.current = setTimeout(() => {
      setMovementFeedback(undefined)
      movementFeedbackTimerRef.current = null
    }, MY_ROOM_MOVEMENT_FEEDBACK_DURATION_MS)
  }, [])

  useEffect(() => {
    const clearance = { clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE }
    if (isRoomWorldPointWalkable(roomWorldGeometry, avatarPoseRef.current, clearance)) return
    if (!isRoomWorldPointWalkable(roomWorldGeometry, MY_ROOM_AVATAR_SPAWN, clearance)) return
    const nextPose = {
      ...MY_ROOM_AVATAR_SPAWN,
      state: "idle" as const
    }
    avatarPoseRef.current = nextPose
    setAvatarPose(nextPose)
    setSeatedFurnitureRenderId(undefined)
    setSeatedSeatId(undefined)
  }, [roomWorldGeometry])

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
    if (transientPoseTimerRef.current !== null) {
      clearTimeout(transientPoseTimerRef.current)
      transientPoseTimerRef.current = null
    }
    const start = avatarPoseRef.current
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
      setStageMarker(undefined)
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
      setStageMarker(undefined)
      hapticError()
      showMovementFeedback(copy.makeRoom)
      return
    }
    const resolvedTarget = seatPlan?.target ?? resolveRoomWorldInteractiveTarget({
      geometry: movementGeometry,
      target,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
    })
    if (!resolvedTarget) {
      setStageMarker(undefined)
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
      avatarPoseRef.current = restingPose
      setAvatarPose(restingPose)
      setSeatedFurnitureRenderId(arrival?.seatedFurnitureRenderId)
      setSeatedSeatId(arrival?.seatedSeatId ?? arrival?.seat?.seatId)
      setStageMarker(undefined)
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
      setStageMarker(undefined)
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
      setStageMarker(undefined)
      hapticError()
      showMovementFeedback(copy.nearbyTile)
      return
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (movementFeedbackTimerRef.current !== null) {
      clearTimeout(movementFeedbackTimerRef.current)
      movementFeedbackTimerRef.current = null
    }
    setMovementFeedback(undefined)
    setStageMarker({
      id: `my_room_target_${Date.now()}`,
      x: resolvedTarget.x,
      y: resolvedTarget.y,
      tone: "target"
    })

    const animatePathSegment = (pathIndex: number): void => {
      const segment = plan.segments[pathIndex]
      const startedAt = Date.now()
      const segmentStartPose = getRoomWorldMovementSegmentStartPose(segment)

      const startingPose = {
        x: segmentStartPose.x,
        y: segmentStartPose.y,
        direction: segmentStartPose.facing,
        state: segmentStartPose.motion
      }
      avatarPoseRef.current = startingPose
      setAvatarPose(startingPose)

      const tick = (): void => {
        const frame = getRoomWorldMovementFrame({
          segment,
          startedAt,
          now: Date.now()
        })
        const runtimePose = getRoomWorldMovementFramePose({
          frame,
          segment,
          arrival: {
            facing: arrival?.direction,
            motion: arrival?.state
          }
        })
        const nextPose: MyRoomAvatarPose = {
          x: runtimePose.x,
          y: runtimePose.y,
          direction: runtimePose.facing,
          state: runtimePose.motion
        }
        avatarPoseRef.current = nextPose
        setAvatarPose(nextPose)

        if (!frame.isComplete) {
          animationFrameRef.current = requestAnimationFrame(tick)
          return
        }

        if (!segment.isFinal) {
          animatePathSegment(pathIndex + 1)
          return
        }

        animationFrameRef.current = null
        setSeatedFurnitureRenderId(arrival?.seatedFurnitureRenderId)
        setSeatedSeatId(arrival?.seatedSeatId ?? arrival?.seat?.seatId)
        setStageMarker(undefined)
        hapticLight()
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    animatePathSegment(0)
  }, [copy, roomWorldGeometry, roomWorldHotspots, seatedFurnitureRenderId, showMovementFeedback])

  const handlePoseAction = useCallback((state: MyRoomPoseActionState): void => {
    if (transientPoseTimerRef.current !== null) {
      clearTimeout(transientPoseTimerRef.current)
      transientPoseTimerRef.current = null
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    const nextPose: MyRoomAvatarPose = {
      ...avatarPoseRef.current,
      direction: state === "idle" ? avatarPoseRef.current.direction : "front",
      state
    }
    avatarPoseRef.current = nextPose
    setAvatarPose(nextPose)

    if (state === "idle") return

    transientPoseTimerRef.current = setTimeout(() => {
      const restingPose: MyRoomAvatarPose = {
        ...avatarPoseRef.current,
        state: "idle"
      }
      avatarPoseRef.current = restingPose
      setAvatarPose(restingPose)
      transientPoseTimerRef.current = null
    }, MY_ROOM_TRANSIENT_POSE_DURATION_MS)
  }, [])

  const handleWalkAction = useCallback((): void => {
    const currentPose = avatarPoseRef.current
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
  }, [copy.nearbyTile, moveAvatarToPoint, roomWorldGeometry, showMovementFeedback])
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
    if (item.renderId === "my_room_owner_avatar") {
      handleAvatarTap()
      return
    }
    if (item.kind !== "furniture" || item.interactionType !== "seat") return
    const seatCandidate = resolveRoomWorldSeatSelection({
      geometry: roomWorldGeometry,
      from: avatarPoseRef.current,
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
          <View>
            <Text style={styles.myRoomTitle}>{copy.title}</Text>
            <Text style={styles.myRoomSubtitle}>{copy.subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.profileOptions}
            style={styles.myRoomIconButton}
            onPress={() => navigation.navigate("You")}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={uiTheme.colors.textPrimary}
            />
          </Pressable>
        </View>

        <View style={styles.roomStack}>
          <View
            onLayout={handleStageLayout}
            style={[styles.stageCard, { height: stageHeight }]}
          >
            <View style={styles.stageBackdrop} pointerEvents="none" />
            <View style={styles.stageTopScrim} pointerEvents="none" />
            <RoomRenderer2D
              shell={baseRoomScene.shell}
              renderItems={renderItems}
              stageMarkers={stageMarker ? [stageMarker] : undefined}
              testID="my-room-production-stage"
              roomVNextRuntimeMode="disabled"
              accessibilityValue={{
                text: `shellId: ${baseRoomScene.shell?.id ?? "missing"}; savedItemCount: ${userRoomDecor.placedItems.length}; renderedFurnitureCount: ${baseRoomScene.renderItems.filter((item) => item.kind === "furniture").length}`
              }}
              onStagePress={moveAvatarToPoint}
              onItemTap={handleRoomItemTap}
              style={[
                styles.stageRenderer,
                {
                  width: stageRendererWidth,
                  transform: [{ translateY: stageRendererTranslateY }]
                }
              ]}
            />
            <View style={styles.stageHud} pointerEvents="none">
              <Ionicons name="heart" size={13} color="#D92A79" />
              <Text style={styles.stageHeaderText} numberOfLines={1}>
                {copy.cozyRoom}
              </Text>
            </View>
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
  },
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
  myRoomIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F2DDEA",
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
  stageTopScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 92,
    backgroundColor: "rgba(255, 111, 174, 0.1)",
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
