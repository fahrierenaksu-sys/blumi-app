import { Image as ExpoImage } from "expo-image"
import {
  type AccessibilityValue,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native"
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Reanimated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { RoomRendererAvatarBody } from "./RoomRendererAvatarBody"
import {
  getRoomSceneItemKey,
  getRoomSceneReadinessKeys,
  getRoomSceneShadowKey,
  ROOM_SCENE_SHELL_KEY,
  useRoomSceneReadiness
} from "./roomSceneReadiness"
import { RoomFloorTapLayer } from "./RoomFloorTapLayer"
import { getRoomAvatarTapTarget } from "./roomAvatarTapTargetModel"
import { getRoomFurnitureTapTarget, isRoomFurnitureTapOnSeat } from "./roomFurnitureTapTargetModel"
import { useReducedMotion } from "../../../ui/animations"
import type { RoomWorldPoint } from "../../roomWorld/roomWorldGeometry"
import type {
  RoomShell,
  RoomPlacementLane,
  RoomV2FurnitureRenderItem,
  RoomV2LayeredSeatArt,
  RoomV2RenderItem
} from "../roomV2.types"
import { roomAvatar25d } from "../../avatar/roomAvatarSeam"
import { RoomRendererLayeredFurnitureFront, RoomRendererLayeredFurnitureShadow } from "./RoomRendererLayeredFurniture"
import {
  getRenderableRoomV2AvatarMotionProfile,
  getRoomV2AvatarSittingTranslateY,
  ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
} from "../roomV2AvatarMotion"
import {
  getAvatarMotionRotate,
  getAvatarMotionScaleY,
  getAvatarMotionTranslateY
} from "./roomRendererAvatarMotionStyle"
import {
  useRoomRendererAvatarLoops,
  useRoomRendererScreenFocused
} from "./useRoomRendererLoops"
import { animateTo, useMotion } from "../../../ui/motion"
import { getAppLocale } from "../../session/appLocale"
import { getPlacementGuideSpan } from "./roomRendererPlacementGuideModel"
import {
  getRoomV2AvatarAccessibilityValue,
  getRoomV2ItemAccessibility,
  getRoomV2StageAccessibilityLabel,
  shouldRoomV2ItemReceiveTap
} from "../roomV2Accessibility"
import {
  getRoomV2DepthPerspectiveScale,
  getRoomV2FurnitureImageResizeMode,
  getRoomV2FurnitureMobileRenderScale,
  isRoomV2LayeredFloorPiece
} from "../roomV2RenderSurface"
import { ROOM_V2_OUTSIDE_COLOR } from "../roomV2Camera"
import {
  RoomRendererLiveAvatarFrame,
  RoomRendererLiveAvatarLayoutContext,
  type RoomRendererLiveAvatarPosition
} from "./RoomRendererLiveAvatarFrame"

type RoomRendererPlacementState = "valid" | "invalid"
type RoomRendererStageMarkerTone = "target" | "blocked"

export interface RoomRendererStageMarker extends RoomWorldPoint {
  id: string
  tone?: RoomRendererStageMarkerTone
  /** The walk it marked is over: fade out, then `onStageMarkerFaded`. */
  leaving?: boolean
}

interface RoomRenderer2DProps {
  shell: RoomShell | null
  renderItems: RoomV2RenderItem[]
  stageMarkers?: RoomRendererStageMarker[]
  /** A leaving stage marker finished fading out (or vanished under Reduce Motion). */
  onStageMarkerFaded?: (markerId: string) => void
  debugPlacement?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  selectedInstanceId?: string
  placementStateByRenderId?: Record<string, RoomRendererPlacementState>
  showPlacementGuides?: boolean
  onItemTap?: (item: RoomV2RenderItem) => void
  onItemLongPress?: (item: RoomV2RenderItem) => void
  onItemLongPressMove?: (item: RoomV2RenderItem, point: { pageX: number; pageY: number }) => void
  /**
   * Release of a long-press drag, in window coordinates like the move. The
   * touched image may be mirrored, so its local coordinates are not a room point.
   */
  onItemLongPressRelease?: (item: RoomV2RenderItem, point: { pageX: number; pageY: number }) => void
  itemInteractionMode?: "edit" | "interact"
  onStagePress?: (point: RoomWorldPoint) => void
  /** Draw authored furniture contact-shadow layers (off unless a caller asks). */
  drawsContactShadows?: boolean
  accessibilityLabel?: string
  accessibilityValue?: AccessibilityValue
  motionEnabled?: boolean
  showDepthWash?: boolean
  /** Moves the matching avatar on the UI thread from shared values. */
  liveAvatarPosition?: RoomRendererLiveAvatarPosition
  /** Drawn on the floor, under every item (the editor's placement grid). */
  floorUnderlay?: ReactNode
  /**
   * The scene is complete: the shell, every furniture image and contact shadow
   * drawn here, and every avatar's full look have displayed (a failed image
   * counts, so it never blocks). Called once per mount; callers cap the wait.
   */
  onSceneReady?: () => void
  /**
   * An item's image is on screen (its readiness key, `furniture:<renderId>`), every time an item mounts. The
   * room editor hands a dropped piece back from its drag overlay on it. Unset: items render as before.
   */
  onItemDrawn?: (key: string) => void
  /**
   * Furniture another layer draws (MiniRoom sorts these among its avatars).
   * Their contact shadows stay here, on the floor under everything.
   */
  hiddenItemRenderIds?: ReadonlySet<string>
}

export function RoomRenderer2D(props: RoomRenderer2DProps) {
  const {
    shell,
    renderItems,
    stageMarkers,
    onStageMarkerFaded,
    debugPlacement = false,
    style,
    testID,
    selectedInstanceId,
    placementStateByRenderId,
    showPlacementGuides,
    onItemTap,
    onItemLongPress,
    onItemLongPressMove,
    onItemLongPressRelease,
    itemInteractionMode = "interact",
    onStagePress,
    drawsContactShadows = false,
    accessibilityLabel,
    accessibilityValue,
    motionEnabled = true,
    showDepthWash = true,
    liveAvatarPosition,
    floorUnderlay,
    onSceneReady,
    onItemDrawn,
    hiddenItemRenderIds
  } = props
  const [layoutSize, setLayoutSize] = useState({ width: 0, height: 0 })
  const reduceMotion = useReducedMotion()
  // Idle loops pause while the hosting screen is not focused.
  const motionPaused = !useRoomRendererScreenFocused()
  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout
    setLayoutSize({ width, height })
  }, [])
  const markDrawn = useRoomSceneReadiness(
    getRoomSceneReadinessKeys({ renderItems, hiddenRenderIds: hiddenItemRenderIds, drawsContactShadows }),
    onSceneReady
  )
  const handleItemDrawn = useMemo(
    () => markDrawn && onItemDrawn
      ? (key: string) => {
        markDrawn(key)
        onItemDrawn(key)
      }
      : markDrawn ?? onItemDrawn,
    [markDrawn, onItemDrawn]
  )
  const handleShellDrawn = useMemo(
    () => markDrawn ? () => markDrawn(ROOM_SCENE_SHELL_KEY) : undefined,
    [markDrawn]
  )

  if (!shell) {
    return <View testID={testID} style={style} />
  }

  const aspectRatio = shell.canvasSize.width / shell.canvasSize.height
  // room calibration: a 2.5D avatar seated in a layered piece draws between its back and front layers;
  // a piece with several seats gives each sitter its own seat's rules (her drawing, the front layer's split)
  const getLayeredSeat = (item: RoomV2RenderItem): { piece: RoomV2FurnitureRenderItem; seat: RoomV2LayeredSeatArt } | undefined => {
    if (item.kind !== "avatar" || !item.avatar25d || !item.seatRig) return undefined
    const piece = renderItems.find((candidate) => candidate.renderId === item.seatRig?.furnitureRenderId)
    if (piece?.kind !== "furniture" || !piece.layered25d || hiddenItemRenderIds?.has(piece.renderId)) return undefined
    const seatId = item.seatRig.seatId
    const seat = piece.layered25d.seats.find((candidate) => candidate.id === seatId) ?? piece.layered25d.seats[0]
    return seat ? { piece, seat } : undefined
  }
  const renderMainItem = (item: RoomV2RenderItem) => {
    if ((item.kind !== "furniture" && item.kind !== "avatar") || hiddenItemRenderIds?.has(item.renderId)) return null
    const layeredSeat = getLayeredSeat(item)
    return (
      <Fragment key={item.renderId}>
        <RoomRendererItem
          item={item}
          layeredSeat={layeredSeat?.seat}
          isSelected={selectedInstanceId === item.renderId}
          placementState={placementStateByRenderId?.[item.renderId]}
          onItemTap={shouldRoomV2ItemReceiveTap({
            kind: item.kind,
            mode: itemInteractionMode,
            interactionType: item.kind === "furniture" ? item.interactionType : undefined
          }) ? onItemTap : undefined}
          onItemLongPress={item.kind === "furniture" ? onItemLongPress : undefined}
          onItemLongPressMove={item.kind === "furniture" ? onItemLongPressMove : undefined}
          onItemLongPressRelease={item.kind === "furniture" ? onItemLongPressRelease : undefined}
          onStagePress={item.kind === "furniture" ? onStagePress : undefined}
          itemInteractionMode={itemInteractionMode}
          debugPlacement={debugPlacement}
          reduceMotion={reduceMotion || !motionEnabled}
          // Only avatars run motion loops; furniture keeps one value so a
          // focus change re-renders the avatars, not every item.
          motionPaused={item.kind === "avatar" ? motionPaused : false}
          liveAvatarPosition={liveAvatarPosition?.renderId === item.renderId ? liveAvatarPosition : undefined}
          stageWidthPx={layoutSize.width}
          stageHeightPx={layoutSize.height}
          onDrawn={handleItemDrawn}
          seatedFurnitureName={
            item.kind === "avatar" && item.seatRig
              ? renderItems.find(
                  (candidate) =>
                    candidate.kind === "furniture" &&
                    candidate.renderId === item.seatRig?.furnitureRenderId
                )?.name
              : undefined
          }
          testID={testID ? `${testID}-item-${item.renderId}` : undefined}
        />
        {layeredSeat ? (
          <RoomRendererLayeredFurnitureFront
            item={layeredSeat.piece}
            frontVisibleHeight={layeredSeat.seat.frontVisibleHeight}
            testID={testID ? `${testID}-item-${layeredSeat.piece.renderId}-front-${layeredSeat.seat.id}` : undefined}
          />
        ) : null}
      </Fragment>
    )
  }
  // Keep the floor hit target behind furniture. A root Pressable swallows
  // nested furniture taps on iOS, which makes a seat look like a walk target.
  const Root = View

  return (
    <Root
      testID={testID}
      onLayout={handleLayout}
      style={[styles.root, { aspectRatio }, style]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ExpoImage
          testID={testID ? `${testID}-shell` : undefined}
          source={shell.asset.source}
          contentFit="cover"
          cachePolicy="memory-disk"
          // Bundled room art keeps its pixels; never downscale it on the main thread.
          allowDownscaling={false}
          transition={0}
          onDisplay={handleShellDrawn}
          onError={handleShellDrawn}
          style={styles.shell}
        />
      </View>
      {showDepthWash ? (
        <View pointerEvents="none" style={styles.floorDepthWash} />
      ) : null}
      {floorUnderlay}
      {onStagePress ? (
        <RoomFloorTapLayer
          accessibilityLabel={accessibilityLabel ?? getRoomV2StageAccessibilityLabel(getAppLocale())}
          accessibilityValue={accessibilityValue}
          onTap={onStagePress}
          testID={testID ? `${testID}-floor` : undefined}
        />
      ) : null}
      {showPlacementGuides ? (
        <PlacementGuideLayer shell={shell} />
      ) : null}
      {stageMarkers?.map((marker) => (
        <StageMarker key={marker.id} marker={marker} reduceMotion={reduceMotion} onFaded={onStageMarkerFaded} />
      ))}
      {drawsContactShadows
        ? renderItems.map((item) =>
            item.kind === "furniture" && item.contactShadowAsset ? (
              <RoomRendererFurnitureContactShadow
                key={`${item.renderId}-contact-shadow`}
                item={item}
                onDrawn={markDrawn}
              />
            ) : null
          )
        : null}
      {/* a layered rug lies on the floor under the layered shadows, so a piece standing on it keeps its shadow */}
      {renderItems.filter(isRoomV2LayeredFloorPiece).map(renderMainItem)}
      {/* a layered piece's floor shadow stays here even when another layer draws the piece (MiniRoom), like the
          contact shadows: on the floor, under everything */}
      {renderItems.map((item) =>
        item.kind === "furniture" && item.layered25d?.shadowAsset ? (
          <RoomRendererLayeredFurnitureShadow key={`${item.renderId}-layered-shadow`} item={item} />
        ) : null
      )}
      {renderItems.filter((item) => !isRoomV2LayeredFloorPiece(item)).map(renderMainItem)}
    </Root>
  )
}

/**
 * One piece of furniture drawn exactly as the renderer draws it (same frame,
 * fit and mirroring), for a layer that sorts furniture among avatars. It is
 * placed in the same stage coordinates and never takes touches.
 */
export const RoomRendererFurnitureSprite = memo(function RoomRendererFurnitureSprite(
  props: { item: RoomV2FurnitureRenderItem; zIndex: number; onDisplay?: () => void }
) {
  const { item, zIndex, onDisplay } = props
  const perspectiveScale = getRoomRendererItemPerspectiveScale(item)
  const mobileFurnitureScale = getRoomV2FurnitureMobileRenderScale(item.kind)
  const renderedWidth = item.width * perspectiveScale * mobileFurnitureScale
  const renderedHeight = item.height * perspectiveScale * mobileFurnitureScale
  const drawPoint = getRoomRendererItemDrawPoint(item)
  const left = drawPoint.x - renderedWidth * item.anchor.x
  const top = drawPoint.y - renderedHeight * item.anchor.y
  return (
    <View
      pointerEvents="none"
      style={[
        styles.item,
        {
          left: `${left * 100}%`,
          top: `${top * 100}%`,
          width: `${renderedWidth * 100}%`,
          height: `${renderedHeight * 100}%`,
          zIndex
        }
      ]}
    >
      <View style={styles.itemContent}>
        <ExpoImage
          source={item.asset.source}
          contentFit={getRoomV2FurnitureImageResizeMode(item.sceneProjection) === "stretch" ? "fill" : "contain"}
          cachePolicy="memory-disk"
          allowDownscaling={false}
          transition={0}
          onDisplay={onDisplay}
          onError={onDisplay}
          style={[
            styles.itemImage,
            { transform: [{ scaleX: item.usesMirroredRotation ? -1 : 1 }] }
          ]}
        />
      </View>
    </View>
  )
}, (previous, next) =>
  previous.item === next.item && previous.zIndex === next.zIndex && previous.onDisplay === next.onDisplay)


/**
 * Draws only an authored contact-shadow layer. There is intentionally no
 * synthetic shadow fallback: legacy furniture remains unchanged and VNext
 * assets must provide their own calibrated shadow with the same floor pivot.
 */
const RoomRendererFurnitureContactShadow = memo(function RoomRendererFurnitureContactShadow(
  props: { item: RoomV2FurnitureRenderItem; onDrawn?: (key: string) => void }
) {
  const { item, onDrawn } = props
  const shadow = item.contactShadowAsset
  if (!shadow) return null

  const perspectiveScale = getRoomRendererItemPerspectiveScale(item)
  const mobileFurnitureScale = getRoomV2FurnitureMobileRenderScale(item.kind)
  const renderedWidth = item.width * perspectiveScale * mobileFurnitureScale
  const renderedHeight = item.height * perspectiveScale * mobileFurnitureScale
  const drawPoint = getRoomRendererItemDrawPoint(item)
  const left = drawPoint.x - renderedWidth * item.anchor.x
  const top = drawPoint.y - renderedHeight * item.anchor.y

  return (
    <View
      pointerEvents="none"
      testID={`${item.renderId}-contact-shadow`}
      style={[
        styles.item,
        styles.furnitureContactShadow,
        {
          left: `${left * 100}%`,
          top: `${top * 100}%`,
          width: `${renderedWidth * 100}%`,
          height: `${renderedHeight * 100}%`
        }
      ]}
    >
      <ExpoImage
        source={shadow.source}
        contentFit="contain"
        cachePolicy="memory-disk"
        allowDownscaling={false}
        transition={0}
        onDisplay={onDrawn ? () => onDrawn(getRoomSceneShadowKey(item.renderId)) : undefined}
        onError={onDrawn ? () => onDrawn(getRoomSceneShadowKey(item.renderId)) : undefined}
        style={styles.furnitureContactShadowImage}
      />
    </View>
  )
}, (previous, next) => previous.item === next.item && previous.onDrawn === next.onDrawn)

/**
 * The walk destination on the floor (roomTapMarkerModel owns its life): it
 * fades in when a walk starts and out when the walk is over, then reports
 * `onFaded` so the owner drops it. Under Reduce Motion it just appears and
 * disappears.
 */
const StageMarker = memo(function StageMarker(props: {
  marker: RoomRendererStageMarker
  reduceMotion: boolean
  onFaded?: (markerId: string) => void
}) {
  const { marker, reduceMotion, onFaded } = props
  const motion = useMotion()
  const opacity = useSharedValue(reduceMotion ? 1 : 0)
  const leaving = Boolean(marker.leaving)
  const markerId = marker.id
  useEffect(() => {
    if (!leaving) {
      opacity.value = reduceMotion ? 1 : animateTo(1, motion.fadeIn)
      return
    }
    if (reduceMotion) {
      opacity.value = 0
      onFaded?.(markerId)
      return
    }
    opacity.value = animateTo(0, motion.fadeOut, (finished) => {
      "worklet"
      if (finished && onFaded) scheduleOnRN(onFaded, markerId)
    })
  }, [leaving, markerId, motion.fadeIn, motion.fadeOut, onFaded, opacity, reduceMotion])
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.stageMarker,
        marker.tone === "blocked" ? styles.stageMarkerBlocked : null,
        { left: `${marker.x * 100}%`, top: `${marker.y * 100}%` },
        fadeStyle
      ]}
    >
      <View
        style={[
          styles.stageMarkerCore,
          marker.tone === "blocked" ? styles.stageMarkerCoreBlocked : null
        ]}
      />
    </Reanimated.View>
  )
}, (previous, next) =>
  previous.marker.id === next.marker.id &&
  previous.marker.x === next.marker.x &&
  previous.marker.y === next.marker.y &&
  previous.marker.tone === next.marker.tone &&
  previous.marker.leaving === next.marker.leaving &&
  previous.reduceMotion === next.reduceMotion &&
  previous.onFaded === next.onFaded
)

function PlacementGuideLayer(props: { shell: RoomShell }) {
  const { shell } = props
  if (!shell.placementLanes?.length || !shell.placeableArea) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {shell.placementLanes.map((lane) => (
        <View
          key={lane.id}
          style={[
            styles.placementGuide,
            getPlacementGuideStyle(lane, shell)
          ]}
        />
      ))}
    </View>
  )
}

const RoomRendererItem = memo(function RoomRendererItem(props: {
  item: RoomV2RenderItem
  /** A seated 2.5D avatar's layered seat (room calibration): her hip goes on the seat point. */
  layeredSeat?: RoomV2LayeredSeatArt
  isSelected?: boolean
  placementState?: RoomRendererPlacementState
  onItemTap?: (item: RoomV2RenderItem) => void
  onItemLongPress?: (item: RoomV2RenderItem) => void
  onItemLongPressMove?: (item: RoomV2RenderItem, point: { pageX: number; pageY: number }) => void
  /**
   * Release of a long-press drag, in window coordinates like the move. The
   * touched image may be mirrored, so its local coordinates are not a room point.
   */
  onItemLongPressRelease?: (item: RoomV2RenderItem, point: { pageX: number; pageY: number }) => void
  /** A tap beside a seat's drawn piece, inside its box, is a floor tap. */
  onStagePress?: (point: RoomWorldPoint) => void
  itemInteractionMode: "edit" | "interact"
  debugPlacement: boolean
  reduceMotion: boolean
  motionPaused: boolean
  liveAvatarPosition?: RoomRendererLiveAvatarPosition
  stageWidthPx: number
  stageHeightPx: number
  seatedFurnitureName?: string
  testID?: string
  /** Reports this item's image (or avatar look) on screen for scene readiness. */
  onDrawn?: (key: string) => void
}) {
  const {
    item,
    isSelected,
    placementState,
    onItemTap,
    onItemLongPress,
    onItemLongPressMove,
    onItemLongPressRelease,
    onStagePress,
    itemInteractionMode,
    debugPlacement,
    reduceMotion,
    motionPaused,
    liveAvatarPosition,
    stageWidthPx,
    stageHeightPx,
    seatedFurnitureName,
    layeredSeat,
    testID,
    onDrawn
  } = props
  const drawnKey = getRoomSceneItemKey(item)
  // Stable, so a memoized avatar renderer does not re-render with its item.
  const handleDrawn = useMemo(() => onDrawn ? () => onDrawn(drawnKey) : undefined, [drawnKey, onDrawn])
  const longPressActiveRef = useRef(false)
  const suppressPressRef = useRef(false)

  const perspectiveScale = getRoomRendererItemPerspectiveScale(item)
  const mobileFurnitureScale = getRoomV2FurnitureMobileRenderScale(item.kind)
  const renderedWidth = item.width * perspectiveScale * mobileFurnitureScale
  const renderedHeight = item.height * perspectiveScale * mobileFurnitureScale
  const drawPoint = getRoomRendererItemDrawPoint(item)
  const left = drawPoint.x - renderedWidth * item.anchor.x
  const top = drawPoint.y - renderedHeight * item.anchor.y
  // 2.5D room: a calibrated piece shows its floor cells or its wall strip (the editor's floor
  // overlay), not the old rectangle highlights around its drawing
  const showsFloorCells = item.kind === "furniture" &&
    (item.footprintCells !== undefined || item.wallPlacement !== undefined)
  const shouldShowFootprint =
    item.kind === "furniture" && Boolean(placementState) && !showsFloorCells
  const footprintStyle = shouldShowFootprint && item.kind === "furniture"
    ? getFurnitureFootprintStyle(item)
    : undefined
  const avatarMotion = item.kind === "avatar"
    ? getRenderableRoomV2AvatarMotionProfile(item)
    : {
      state: "idle" as const,
      treatment: "idleFallback" as const,
      usesRuntimeLocomotion: false,
      usesRuntimeGesture: false,
      usesAnimatedAssets: false
    }
  const { breathe, walk, gesture, usesIdleBreathe } = useRoomRendererAvatarLoops({
    isAvatar: item.kind === "avatar",
    avatarMotion,
    reduceMotion,
    paused: motionPaused
  })

  const sittingTranslateY = getRoomV2AvatarSittingTranslateY(
    item.kind === "avatar" ? item.seatRig : undefined,
    stageHeightPx
  )
  const avatarDirection = item.kind === "avatar" ? item.direction : undefined
  const avatar25dKeepsSize = item.kind === "avatar" && Boolean(item.avatar25d) && Boolean(roomAvatar25d.roomCalibration)
  const avatarMotionStyle = useAnimatedStyle(() => ({
    // ROOM-03: walking toward the back wall only shrinks slightly; no ghost opacity.
    transform: [
      { translateY: getAvatarMotionTranslateY(avatarMotion, breathe.value, walk.value, gesture.value, usesIdleBreathe, sittingTranslateY) },
      { scaleX: avatarDirection === "left" ? -1 : 1 },
      { scaleY: getAvatarMotionScaleY(avatarMotion, breathe.value, gesture.value, usesIdleBreathe) },
      // the 2.5D avatar keeps one size everywhere (room calibration): no back-facing shrink
      { scale: avatarDirection === "back" && !avatar25dKeepsSize ? 0.96 : 1 },
      { rotate: getAvatarMotionRotate(avatarMotion, gesture.value) }
    ]
  }))

  // If an interaction is provided, we need to allow touches. Otherwise pass through.
  const isTouchInteractive = Boolean(onItemTap || onItemLongPress || onItemLongPressMove)
  const pointerEvents = isTouchInteractive ? "auto" : "none"

  // A walking avatar keeps its UI-thread frame; its tap target sits inside the
  // frame (ROOM-01), so wrapping it in a Pressable never breaks the live walk.
  // A seat that is only tapped (My Room) takes taps on its drawn piece alone:
  // its box is the whole image canvas, mostly empty, and taps there walk.
  const seatTapTarget = item.kind === "furniture" && onItemTap && !onItemLongPress && !onItemLongPressMove
    ? getRoomFurnitureTapTarget({
      assetKey: item.asset.key,
      boxWidthPx: renderedWidth * stageWidthPx,
      boxHeightPx: renderedHeight * stageHeightPx,
      fit: getRoomV2FurnitureImageResizeMode(item.sceneProjection) === "stretch" ? "fill" : "contain",
      mirrored: item.usesMirroredRotation
    })
    : null
  const tapsInsideLiveFrame = Boolean(liveAvatarPosition && onItemTap)
  const tapsInsideTarget = tapsInsideLiveFrame || Boolean(seatTapTarget)
  const Wrapper = liveAvatarPosition
    ? RoomRendererLiveAvatarFrame
    : isTouchInteractive && !seatTapTarget ? Pressable : View
  const itemAccessibility = getRoomV2ItemAccessibility({
    kind: item.kind,
    name: item.name,
    interactionType: item.kind === "furniture" ? item.interactionType : undefined,
    mode: itemInteractionMode,
    locale: getAppLocale(),
    tappable: isTouchInteractive
  })
  const avatarAccessibilityValue = item.kind === "avatar"
    ? { text: getRoomV2AvatarAccessibilityValue({ state: item.state, direction: item.direction, seatedFurnitureName }, getAppLocale()) }
    : undefined
  // Only the drawn figure takes the avatar's taps; the rest of its box is
  // floor, so a tap right beside it walks there.
  const avatarTapTarget = tapsInsideLiveFrame
    ? getRoomAvatarTapTarget(
      item.width * mobileFurnitureScale * stageWidthPx,
      item.height * mobileFurnitureScale * stageHeightPx,
      // a calibrated 2.5D figure is its own size, taller than the box: its target is the figure
      avatar25dKeepsSize ? roomAvatar25d.roomCalibration?.avatarFigureHeightPx(stageHeightPx, item.kind === "avatar" ? item.avatar25d?.rig : undefined) : undefined
    )
    : undefined
  const liveAvatarLayout = liveAvatarPosition && {
    live: liveAvatarPosition,
    width: item.width * mobileFurnitureScale,
    height: item.height * mobileFurnitureScale,
    anchorX: item.anchor.x,
    anchorY: item.anchor.y,
    stageWidthPx,
    stageHeightPx
  }

  return (
    <RoomRendererLiveAvatarLayoutContext.Provider value={liveAvatarLayout}>
      <Wrapper
        accessible={tapsInsideTarget ? false : isTouchInteractive || item.kind === "avatar" ? true : undefined}
        accessibilityRole={isTouchInteractive && !tapsInsideTarget ? "button" : undefined}
        accessibilityLabel={tapsInsideTarget || (!isTouchInteractive && item.kind !== "avatar") ? undefined : itemAccessibility.label}
        accessibilityHint={tapsInsideTarget ? undefined : itemAccessibility.hint}
        accessibilityValue={tapsInsideTarget ? undefined : avatarAccessibilityValue}
        delayLongPress={onItemLongPressMove ? 0 : 360}
        onLongPress={() => {
          longPressActiveRef.current = true
          onItemLongPress?.(item)
        }}
        onPress={(event) => {
          event.stopPropagation()
          if (suppressPressRef.current) {
            suppressPressRef.current = false
            return
          }
          onItemTap?.(item)
        }}
        onPressOut={(event) => {
          if (!longPressActiveRef.current) return
          longPressActiveRef.current = false
          suppressPressRef.current = true
          onItemLongPressRelease?.(item, {
            pageX: event.nativeEvent.pageX,
            pageY: event.nativeEvent.pageY
          })
        }}
        onResponderMove={(event) => {
          if (!longPressActiveRef.current || !onItemLongPressMove) return
          onItemLongPressMove(item, {
            pageX: event.nativeEvent.pageX,
            pageY: event.nativeEvent.pageY
          })
        }}
        onStartShouldSetResponder={() => Boolean(onItemLongPressMove)}
        onMoveShouldSetResponder={() => Boolean(onItemLongPressMove)}
        onResponderTerminationRequest={() => !onItemLongPressMove}
        testID={testID}
        pointerEvents={tapsInsideTarget ? "box-none" : pointerEvents}
        style={[
          styles.item,
          {
            left: `${left * 100}%`,
            top: `${top * 100}%`,
            width: `${renderedWidth * 100}%`,
            height: `${renderedHeight * 100}%`
          }
        ]}
      >
        <View
          style={[
            styles.itemContent,
            isSelected ? styles.itemSelected : null,
            placementState === "valid" ? styles.itemPlacementValid : null,
            placementState === "invalid" ? styles.itemPlacementInvalid : null
          ]}
        >
          {isSelected && item.kind === "furniture" && !showsFloorCells ? (
            <View pointerEvents="none" style={styles.itemSelectionHalo} />
          ) : null}
          {placementState === "valid" && !showsFloorCells ? (
            <View
              pointerEvents="none"
              style={[
                styles.interactionAura,
                isSelected ? styles.interactionAuraSelected : null,
                styles.interactionAuraValid
              ]}
            />
          ) : null}
          {footprintStyle ? (
            <View
              pointerEvents="none"
              style={[
                styles.footprintPad,
                placementState === "valid" ? styles.footprintPadValid : null,
                placementState === "invalid" ? styles.footprintPadInvalid : null,
                footprintStyle
              ]}
            />
          ) : null}
          {item.kind === "avatar" ? (
            <RoomRendererAvatarBody
              avatar25d={item.avatar25d}
              calibratedFigureHeightPx={avatar25dKeepsSize
                ? roomAvatar25d.roomCalibration?.avatarFigureHeightPx(stageHeightPx, item.avatar25d?.rig)
                : undefined}
              outerMirrored={avatarDirection === "left"}
              seatPlacement={item.avatar25d ? {
                // a layered seat takes back exactly the drop the motion style applies (none when its state is not
                // drawn as sitting); the older seat path keeps its authored offsets
                outerPx: layeredSeat && avatar25dKeepsSize && avatarMotion.state !== "sitting" ? 0 : sittingTranslateY,
                seatPx: Math.max(0, sittingTranslateY - ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX),
                ...(item.seatRig?.approach ? {
                  approachPx: { dx: item.seatRig.approach.x * stageWidthPx, dy: item.seatRig.approach.y * stageHeightPx }
                } : {}),
                ...(layeredSeat && avatar25dKeepsSize ? {
                  hip: {
                    view: layeredSeat.view,
                    mirror: layeredSeat.mirror,
                    ...(layeredSeat.avatarClipBelowHip !== undefined
                      ? { clipBelowHipPx: layeredSeat.avatarClipBelowHip * stageHeightPx }
                      : {}),
                    ...(layeredSeat.soleDropBelowHip !== undefined
                      ? { soleDropPx: layeredSeat.soleDropBelowHip * stageHeightPx }
                      : {})
                  }
                } : {})
              } : undefined}
              state={avatarMotion.state}
              walksWithFrames={avatarMotion.usesAnimatedAssets}
              reduceMotion={reduceMotion}
              boxHeightPx={renderedHeight * stageHeightPx}
              stageWidthPx={stageWidthPx}
              stageHeightPx={stageHeightPx}
              live={liveAvatarPosition}
              motionStyle={avatarMotionStyle}
              onAllLayersShown={handleDrawn}
            />
          ) : (
            <ExpoImage
              source={item.asset.source}
              contentFit={getRoomV2FurnitureImageResizeMode(item.sceneProjection) === "stretch" ? "fill" : "contain"}
              cachePolicy="memory-disk"
              allowDownscaling={false}
              transition={0}
              onDisplay={handleDrawn}
              onError={handleDrawn}
              style={[
                styles.itemImage,
                { transform: [{ scaleX: item.usesMirroredRotation ? -1 : 1 }] }
              ]}
            />
          )}
          {debugPlacement ? (
            <>
              <View
                testID={testID ? `${testID}-debug-bounds` : undefined}
                style={styles.debugBounds}
              />
              <View
                testID={testID ? `${testID}-debug-anchor` : undefined}
                style={[
                  styles.debugAnchor,
                  {
                    left: `${item.anchor.x * 100}%`,
                    top: `${item.anchor.y * 100}%`
                  }
                ]}
              />
              <Text
                testID={testID ? `${testID}-debug-label` : undefined}
                numberOfLines={1}
                style={styles.debugLabel}
              >
                {item.name || item.renderId}
              </Text>
            </>
          ) : null}
          {tapsInsideLiveFrame ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={itemAccessibility.label}
              accessibilityHint={itemAccessibility.hint}
              accessibilityValue={avatarAccessibilityValue}
              onPress={(event) => { event.stopPropagation(); onItemTap?.(item) }}
              style={[styles.innerTapTarget, avatarTapTarget]}
            />
          ) : null}
          {seatTapTarget ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={itemAccessibility.label}
              accessibilityHint={itemAccessibility.hint}
              onPress={(event) => {
                event.stopPropagation()
                // Childless, so the location is inside this target.
                const boxX = seatTapTarget.left + event.nativeEvent.locationX
                const boxY = seatTapTarget.top + event.nativeEvent.locationY
                if (isRoomFurnitureTapOnSeat(seatTapTarget, boxX, boxY)) {
                  onItemTap?.(item)
                  return
                }
                onStagePress?.({
                  x: left + boxX / Math.max(1, stageWidthPx),
                  y: top + boxY / Math.max(1, stageHeightPx)
                })
              }}
              style={[styles.innerTapTarget, {
                left: seatTapTarget.left,
                top: seatTapTarget.top,
                width: seatTapTarget.width,
                height: seatTapTarget.height
              }]}
            />
          ) : null}
        </View>
      </Wrapper>
    </RoomRendererLiveAvatarLayoutContext.Provider>
  )
}, (previous, next) =>
  previous.item === next.item &&
  previous.isSelected === next.isSelected &&
  previous.placementState === next.placementState &&
  previous.onItemTap === next.onItemTap &&
  previous.onItemLongPress === next.onItemLongPress &&
  previous.onItemLongPressMove === next.onItemLongPressMove &&
  previous.onItemLongPressRelease === next.onItemLongPressRelease &&
  previous.onStagePress === next.onStagePress &&
  previous.debugPlacement === next.debugPlacement &&
  previous.reduceMotion === next.reduceMotion &&
  previous.motionPaused === next.motionPaused &&
  previous.liveAvatarPosition === next.liveAvatarPosition &&
  previous.stageWidthPx === next.stageWidthPx &&
  previous.stageHeightPx === next.stageHeightPx &&
  previous.seatedFurnitureName === next.seatedFurnitureName &&
  previous.layeredSeat === next.layeredSeat &&
  previous.testID === next.testID &&
  previous.onDrawn === next.onDrawn
)

function getFurnitureFootprintStyle(
  item: RoomV2FurnitureRenderItem
): ViewStyle {
  const footprint = item.placementFootprint ?? item.footprint ?? {
    width: item.width,
    height: item.height
  }
  const widthRatio = item.width > 0 ? footprint.width / item.width : 1
  const heightRatio = item.height > 0 ? footprint.height / item.height : 1
  const widthPercent = Math.max(8, Math.min(180, widthRatio * 100))
  const heightPercent = Math.max(6, Math.min(120, heightRatio * 100))
  const leftPercent = item.anchor.x * (100 - widthPercent)
  const topPercent = item.anchor.y * (100 - heightPercent)

  return {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    width: `${widthPercent}%`,
    height: `${heightPercent}%`
  }
}

/**
 * Where an item's anchor is drawn: its saved spot, plus the room calibration's move when it set one
 * (a piece flush against a back wall). Never stored; only the room calibration sets `renderOffset`.
 */
function getRoomRendererItemDrawPoint(item: RoomV2RenderItem): { x: number; y: number } {
  const offset = item.kind === "furniture" ? item.renderOffset : undefined
  return offset ? { x: item.x + offset.x, y: item.y + offset.y } : item
}

function getRoomRendererItemPerspectiveScale(item: RoomV2RenderItem): number {
  return getRoomV2DepthPerspectiveScale(item.y)
}

function getPlacementGuideStyle(
  lane: RoomPlacementLane,
  shell: RoomShell
): ViewStyle {
  const { minX, maxX } = getPlacementGuideSpan(lane, shell)
  return {
    left: `${minX * 100}%`,
    top: `${lane.y * 100}%`,
    width: `${Math.max(0, maxX - minX) * 100}%`
  }
}

const styles = StyleSheet.create({
  innerTapTarget: {
    position: "absolute",
    // above the item's image (itemImage zIndex 2): it took the seat's taps, so a tapped chair never sat
    zIndex: 5
  },
  root: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: ROOM_V2_OUTSIDE_COLOR
  },
  shell: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%"
  },
  floorDepthWash: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "58%",
    backgroundColor: "rgba(255, 216, 196, 0.1)"
  },
  placementGuide: {
    position: "absolute",
    height: 8,
    marginTop: -4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(255, 234, 244, 0.08)",
    shadowColor: "#FF8FBD",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }
  },
  stageMarker: {
    position: "absolute",
    width: 34,
    height: 18,
    marginLeft: -17,
    marginTop: -9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(143, 255, 209, 0.55)",
    backgroundColor: "rgba(143, 255, 209, 0.16)",
    shadowColor: "#8FFFD1",
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 3
  },
  stageMarkerBlocked: {
    borderColor: "rgba(255, 180, 200, 0.58)",
    backgroundColor: "rgba(255, 180, 200, 0.15)",
    shadowColor: "#FFB4C8"
  },
  stageMarkerCore: {
    width: 12,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(143, 255, 209, 0.88)"
  },
  stageMarkerCoreBlocked: {
    backgroundColor: "rgba(255, 180, 200, 0.9)"
  },
  item: {
    position: "absolute"
  },
  itemContent: {
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    borderRadius: 8,
    position: "relative"
  },
  itemSelected: {
    opacity: 1
  },
  itemSelectionHalo: {
    backgroundColor: "rgba(255, 214, 231, 0.16)",
    borderColor: "rgba(209, 55, 96, 0.82)",
    borderRadius: 14,
    borderWidth: 2,
    bottom: 1,
    left: 1,
    position: "absolute",
    right: 1,
    top: 1,
    zIndex: 4
  },
  itemPlacementValid: {
    opacity: 0.9
  },
  itemPlacementInvalid: {
    opacity: 0.64
  },
  itemImage: {
    width: "100%",
    height: "100%",
    zIndex: 2
  },
  furnitureContactShadow: {
    opacity: 0.92
  },
  furnitureContactShadowImage: {
    width: "100%",
    height: "100%"
  },
  interactionAura: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "4%",
    height: "10%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 234, 244, 0.12)"
  },
  interactionAuraSelected: {
    borderColor: "rgba(255, 255, 255, 0.58)",
    backgroundColor: "rgba(255, 111, 174, 0.18)"
  },
  interactionAuraValid: {
    borderColor: "rgba(111, 255, 193, 0.78)",
    backgroundColor: "rgba(111, 255, 193, 0.2)"
  },
  interactionAuraInvalid: {
    borderColor: "rgba(255, 95, 122, 0.9)",
    backgroundColor: "rgba(255, 95, 122, 0.2)"
  },
  footprintPad: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.26)",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    zIndex: 1
  },
  footprintPadValid: {
    borderColor: "rgba(111, 255, 193, 0.86)",
    backgroundColor: "rgba(111, 255, 193, 0.18)"
  },
  footprintPadInvalid: {
    borderColor: "rgba(255, 95, 122, 0.92)",
    backgroundColor: "rgba(255, 95, 122, 0.22)"
  },
  debugBounds: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: "#00E5FF",
    backgroundColor: "rgba(0, 229, 255, 0.08)"
  },
  debugAnchor: {
    position: "absolute",
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
    borderRadius: 4,
    backgroundColor: "#FFEF5A",
    borderWidth: 1,
    borderColor: "#110A12"
  },
  debugLabel: {
    position: "absolute",
    left: 0,
    top: -16,
    width: 76,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(17, 10, 18, 0.82)",
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800"
  }
})
