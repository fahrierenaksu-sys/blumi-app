import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type AccessibilityValue,
  Image,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { RoomAvatarRenderer2D } from "../../avatarV2/room/components/RoomAvatarRenderer2D"
import { useReducedMotion } from "../../../ui/animations"
import { IS_BLUMI_ROOM_VNEXT_RUNTIME_PROOF } from "../../../config/env"
import type { RoomWorldPoint } from "../../roomWorld/roomWorldGeometry"
import type {
  RoomShell,
  RoomPlacementLane,
  RoomV2AvatarRenderItem,
  RoomV2FurnitureRenderItem,
  RoomV2RenderItem
} from "../roomV2.types"
import {
  getRenderableRoomV2AvatarMotionProfile,
  getRoomV2AvatarSittingTranslateY
} from "../roomV2AvatarMotion"
import { getRoomV2AvatarAccessibilityValue } from "../roomV2Accessibility"
import {
  getRoomV2DepthPerspectiveScale,
  getRoomV2FurnitureImageResizeMode,
  getRoomV2FurnitureMobileRenderScale,
  getRoomV2SeatedFurnitureRenderIds
} from "../roomV2RenderSurface"
import type { RoomVNextRuntimeMode } from "../roomVNextRuntimeGate"

type RoomRendererPlacementState = "valid" | "invalid"
type RoomRendererStageMarkerTone = "target" | "blocked"

export interface RoomRendererStageMarker extends RoomWorldPoint {
  id: string
  tone?: RoomRendererStageMarkerTone
}

interface RoomRenderer2DProps {
  shell: RoomShell | null
  renderItems: RoomV2RenderItem[]
  stageMarkers?: RoomRendererStageMarker[]
  debugPlacement?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  selectedInstanceId?: string
  placementStateByRenderId?: Record<string, RoomRendererPlacementState>
  showPlacementGuides?: boolean
  onItemTap?: (item: RoomV2RenderItem) => void
  onItemLongPress?: (item: RoomV2RenderItem) => void
  onItemLongPressMove?: (item: RoomV2RenderItem, point: { pageX: number; pageY: number }) => void
  onItemLongPressRelease?: (item: RoomV2RenderItem, point: RoomWorldPoint) => void
  itemInteractionMode?: "edit" | "interact"
  onStagePress?: (point: RoomWorldPoint) => void
  /** Explicit QA-only switch; omitted callers stay on the legacy renderer. */
  roomVNextRuntimeMode?: RoomVNextRuntimeMode
  accessibilityLabel?: string
  accessibilityValue?: AccessibilityValue
  motionEnabled?: boolean
  showDepthWash?: boolean
}

export function RoomRenderer2D(props: RoomRenderer2DProps) {
  const {
    shell,
    renderItems,
    stageMarkers,
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
    roomVNextRuntimeMode = IS_BLUMI_ROOM_VNEXT_RUNTIME_PROOF
      ? "candidate-proof"
      : "disabled",
    accessibilityLabel,
    accessibilityValue,
    motionEnabled = true,
    showDepthWash = true
  } = props
  const [layoutSize, setLayoutSize] = useState({ width: 0, height: 0 })
  const reduceMotion = useReducedMotion()
  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout
    setLayoutSize({ width, height })
  }, [])
  const handleStagePress = useCallback((event: GestureResponderEvent): void => {
    if (!onStagePress || layoutSize.width <= 0 || layoutSize.height <= 0) return
    const { locationX, locationY } = event.nativeEvent
    onStagePress({
      x: Math.max(0, Math.min(1, locationX / layoutSize.width)),
      y: Math.max(0, Math.min(1, locationY / layoutSize.height))
    })
  }, [layoutSize.height, layoutSize.width, onStagePress])

  if (!shell) {
    return <View testID={testID} style={style} />
  }

  const aspectRatio = shell.canvasSize.width / shell.canvasSize.height
  const seatedFurnitureRenderIds = getRoomV2SeatedFurnitureRenderIds(renderItems)
  // Keep the floor hit target behind furniture. A root Pressable swallows
  // nested furniture taps on iOS, which makes a seat look like a walk target.
  const Root = View

  return (
    <Root
      testID={testID}
      onLayout={handleLayout}
      style={[
        styles.root,
        {
          aspectRatio
        },
        style
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image
          testID={testID ? `${testID}-shell` : undefined}
          source={shell.asset.source}
          resizeMode="cover"
          style={styles.shell}
        />
      </View>
      {showDepthWash ? (
        <View pointerEvents="none" style={styles.floorDepthWash} />
      ) : null}
      {onStagePress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? "Walk in room"}
          accessibilityValue={accessibilityValue}
          onPress={handleStagePress}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {showPlacementGuides ? (
        <PlacementGuideLayer shell={shell} />
      ) : null}
      {stageMarkers?.map((marker) => (
        <StageMarker key={marker.id} marker={marker} reduceMotion={reduceMotion} />
      ))}
      {roomVNextRuntimeMode !== "disabled"
        ? renderItems.map((item) =>
            item.kind === "furniture" && item.contactShadowAsset ? (
              <RoomRendererFurnitureContactShadow
                key={`${item.renderId}-contact-shadow`}
                item={item}
              />
            ) : null
          )
        : null}
      {renderItems.map((item) => (
        item.kind === "furniture" || item.kind === "avatar" ? (
          <RoomRendererItem
            key={item.renderId}
            item={item}
            isSelected={selectedInstanceId === item.renderId}
            placementState={placementStateByRenderId?.[item.renderId]}
            onTap={
              onItemTap && item.kind === "furniture"
                ? () => onItemTap(item)
                : undefined
            }
            onLongPress={
              onItemLongPress && item.kind === "furniture"
                ? () => onItemLongPress(item)
                : undefined
            }
            onLongPressMove={
              onItemLongPressMove && item.kind === "furniture"
                ? (point) => onItemLongPressMove(item, point)
                : undefined
            }
            onLongPressRelease={
              onItemLongPressRelease && item.kind === "furniture"
                ? (point) => onItemLongPressRelease(item, point)
                : undefined
            }
            itemInteractionMode={itemInteractionMode}
            debugPlacement={debugPlacement}
            reduceMotion={reduceMotion || !motionEnabled}
            stageWidthPx={layoutSize.width}
            stageHeightPx={layoutSize.height}
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
        ) : null
      ))}
      {renderItems.map((item) => (
        item.kind === "furniture" &&
        (item.frontOcclusion || item.foregroundOcclusionAsset) &&
        seatedFurnitureRenderIds.has(item.renderId) ? (
          <RoomRendererFurnitureFrontOcclusion
            key={`${item.renderId}-front-occlusion`}
            item={item}
          />
        ) : null
      ))}
    </Root>
  )
}

/**
 * Furniture is sorted behind a seated avatar so the avatar can enter the
 * cushion. Re-drawing only the calibrated foreground crop after all items
 * restores the physical occlusion at the seat edge without covering the
 * avatar's torso or introducing a painted placeholder mask.
 */
const RoomRendererFurnitureFrontOcclusion = memo(function RoomRendererFurnitureFrontOcclusion(
  props: { item: RoomV2FurnitureRenderItem }
) {
  const { item } = props
  const perspectiveScale = getRoomRendererItemPerspectiveScale(item)
  const mobileFurnitureScale = getRoomV2FurnitureMobileRenderScale(item.kind)
  const renderedWidth = item.width * perspectiveScale * mobileFurnitureScale
  const renderedHeight = item.height * perspectiveScale * mobileFurnitureScale
  const left = item.x - renderedWidth * item.anchor.x
  const top = item.y - renderedHeight * item.anchor.y
  const occlusion = item.frontOcclusion
  if (item.foregroundOcclusionAsset) {
    return (
      <View
        pointerEvents="none"
        testID={`${item.renderId}-front-occlusion`}
        style={[
          styles.furnitureFrontOcclusion,
          {
            left: `${left * 100}%`,
            top: `${top * 100}%`,
            width: `${renderedWidth * 100}%`,
            height: `${renderedHeight * 100}%`
          }
        ]}
      >
        <Image
          source={item.foregroundOcclusionAsset.source}
          resizeMode="contain"
          style={styles.furnitureFrontOcclusionImage}
        />
      </View>
    )
  }
  if (!occlusion || occlusion.width <= 0 || occlusion.height <= 0) return null

  return (
    <View
      pointerEvents="none"
      testID={`${item.renderId}-front-occlusion`}
      style={[
        styles.furnitureFrontOcclusion,
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
          styles.furnitureFrontOcclusionCrop,
          {
            left: `${occlusion.left * 100}%`,
            top: `${occlusion.top * 100}%`,
            width: `${occlusion.width * 100}%`,
            height: `${occlusion.height * 100}%`
          }
        ]}
      >
        <Image
          source={item.asset.source}
          resizeMode="contain"
          style={{
            position: "absolute",
            left: `${(-occlusion.left / occlusion.width) * 100}%`,
            top: `${(-occlusion.top / occlusion.height) * 100}%`,
            width: `${(1 / occlusion.width) * 100}%`,
            height: `${(1 / occlusion.height) * 100}%`
          }}
        />
      </View>
    </View>
  )
}, (previous, next) => previous.item === next.item)

/**
 * Draws only an authored contact-shadow layer. There is intentionally no
 * synthetic shadow fallback: legacy furniture remains unchanged and VNext
 * assets must provide their own calibrated shadow with the same floor pivot.
 */
const RoomRendererFurnitureContactShadow = memo(function RoomRendererFurnitureContactShadow(
  props: { item: RoomV2FurnitureRenderItem }
) {
  const { item } = props
  const shadow = item.contactShadowAsset
  if (!shadow) return null

  const perspectiveScale = getRoomRendererItemPerspectiveScale(item)
  const mobileFurnitureScale = getRoomV2FurnitureMobileRenderScale(item.kind)
  const renderedWidth = item.width * perspectiveScale * mobileFurnitureScale
  const renderedHeight = item.height * perspectiveScale * mobileFurnitureScale
  const left = item.x - renderedWidth * item.anchor.x
  const top = item.y - renderedHeight * item.anchor.y

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
      <Image
        source={shadow.source}
        resizeMode="contain"
        style={styles.furnitureContactShadowImage}
      />
    </View>
  )
}, (previous, next) => previous.item === next.item)

const StageMarker = memo(function StageMarker(props: {
  marker: RoomRendererStageMarker
  reduceMotion: boolean
}) {
  const { marker, reduceMotion } = props
  const pulseRef = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduceMotion) {
      pulseRef.stopAnimation()
      pulseRef.setValue(0)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRef, {
          toValue: 1,
          duration: 620,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulseRef, {
          toValue: 0,
          duration: 620,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      pulseRef.setValue(0)
    }
  }, [pulseRef, reduceMotion])

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.stageMarker,
        marker.tone === "blocked" ? styles.stageMarkerBlocked : null,
        {
          left: `${marker.x * 100}%`,
          top: `${marker.y * 100}%`,
          opacity: pulseRef.interpolate({
            inputRange: [0, 1],
            outputRange: [0.82, 1]
          }),
          transform: [
            {
              scale: pulseRef.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1.08]
              })
            }
          ]
        }
      ]}
    >
      <View
        style={[
          styles.stageMarkerCore,
          marker.tone === "blocked" ? styles.stageMarkerCoreBlocked : null
        ]}
      />
    </Animated.View>
  )
}, (previous, next) =>
  previous.marker.id === next.marker.id &&
  previous.marker.x === next.marker.x &&
  previous.marker.y === next.marker.y &&
  previous.marker.tone === next.marker.tone &&
  previous.reduceMotion === next.reduceMotion
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
  isSelected?: boolean
  placementState?: RoomRendererPlacementState
  onTap?: () => void
  onLongPress?: () => void
  onLongPressMove?: (point: { pageX: number; pageY: number }) => void
  onLongPressRelease?: (point: RoomWorldPoint) => void
  itemInteractionMode: "edit" | "interact"
  debugPlacement: boolean
  reduceMotion: boolean
  stageWidthPx: number
  stageHeightPx: number
  seatedFurnitureName?: string
  testID?: string
}) {
  const {
    item,
    isSelected,
    placementState,
    onTap,
    onLongPress,
    onLongPressMove,
    onLongPressRelease,
    itemInteractionMode,
    debugPlacement,
    reduceMotion,
    stageWidthPx,
    stageHeightPx,
    seatedFurnitureName,
    testID
  } = props
  const breatheRef = useRef(new Animated.Value(0)).current
  const walkRef = useRef(new Animated.Value(0)).current
  const gestureRef = useRef(new Animated.Value(0)).current
  const longPressActiveRef = useRef(false)
  const suppressPressRef = useRef(false)

  const perspectiveScale = getRoomRendererItemPerspectiveScale(item)
  const mobileFurnitureScale = getRoomV2FurnitureMobileRenderScale(item.kind)
  const renderedWidth = item.width * perspectiveScale * mobileFurnitureScale
  const renderedHeight = item.height * perspectiveScale * mobileFurnitureScale
  const left = item.x - renderedWidth * item.anchor.x
  const top = item.y - renderedHeight * item.anchor.y
  const shouldShowFootprint =
    item.kind === "furniture" && Boolean(placementState)
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
  const usesIdleBreathe =
    item.kind === "avatar" &&
    avatarMotion.state === "idle" &&
    !avatarMotion.usesAnimatedAssets &&
    !reduceMotion

  useEffect(() => {
    if (!usesIdleBreathe) {
      breatheRef.setValue(0)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheRef, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(breatheRef, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      breatheRef.setValue(0)
    }
  }, [breatheRef, usesIdleBreathe])

  useEffect(() => {
    if (
      item.kind !== "avatar" ||
      avatarMotion.state !== "walking" ||
      !avatarMotion.usesRuntimeLocomotion
    ) {
      walkRef.setValue(0)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(walkRef, {
          toValue: 1,
          duration: 190,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(walkRef, {
          toValue: 0,
          duration: 190,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      walkRef.setValue(0)
    }
  }, [avatarMotion.state, avatarMotion.usesRuntimeLocomotion, item.kind, walkRef])

  useEffect(() => {
    if (
      item.kind !== "avatar" ||
      reduceMotion ||
      !avatarMotion.usesRuntimeGesture
    ) {
      gestureRef.setValue(0)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(gestureRef, {
          toValue: 1,
          duration: avatarMotion.state === "dancing" ? 260 : 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(gestureRef, {
          toValue: 0,
          duration: avatarMotion.state === "dancing" ? 260 : 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      gestureRef.setValue(0)
    }
  }, [avatarMotion.state, avatarMotion.usesRuntimeGesture, gestureRef, item.kind, reduceMotion])

  // If onTap is provided, we need to allow touches. Otherwise pass through.
  const isTouchInteractive = Boolean(onTap || onLongPress || onLongPressMove)
  const pointerEvents = isTouchInteractive ? "auto" : "none"

  const Wrapper = isTouchInteractive ? Pressable : View

  const resolvePressPoint = useCallback((locationX: number, locationY: number) => ({
    x: Math.max(0, Math.min(1, left + locationX / Math.max(1, stageWidthPx))),
    y: Math.max(0, Math.min(1, top + locationY / Math.max(1, stageHeightPx)))
  }), [left, stageHeightPx, stageWidthPx, top])

  return (
    <Wrapper
      accessible={isTouchInteractive || item.kind === "avatar" ? true : undefined}
      accessibilityRole={isTouchInteractive ? "button" : undefined}
      accessibilityLabel={
        isTouchInteractive && item.kind === "furniture"
          ? itemInteractionMode === "edit"
            ? `Select ${item.name} to move, rotate, or remove`
            : item.interactionType === "seat"
              ? `Sit on ${item.name}`
              : `Interact with ${item.name}`
          : item.kind === "avatar"
            ? item.name ?? "Room avatar"
            : undefined
      }
      accessibilityValue={
        item.kind === "avatar"
          ? {
              text: getRoomV2AvatarAccessibilityValue({
                state: item.state,
                direction: item.direction,
                seatedFurnitureName
              })
            }
          : undefined
      }
      delayLongPress={onLongPressMove ? 0 : 360}
      onLongPress={() => {
        longPressActiveRef.current = true
        onLongPress?.()
      }}
      onPress={(event) => {
        event.stopPropagation()
        if (suppressPressRef.current) {
          suppressPressRef.current = false
          return
        }
        onTap?.()
      }}
      onPressOut={(event) => {
        if (!longPressActiveRef.current) return
        longPressActiveRef.current = false
        suppressPressRef.current = true
        onLongPressRelease?.(
          resolvePressPoint(event.nativeEvent.locationX, event.nativeEvent.locationY)
        )
      }}
      onResponderMove={(event) => {
        if (!longPressActiveRef.current || !onLongPressMove) return
        onLongPressMove({
          pageX: event.nativeEvent.pageX,
          pageY: event.nativeEvent.pageY
        })
      }}
      onStartShouldSetResponder={() => Boolean(onLongPressMove)}
      onMoveShouldSetResponder={() => Boolean(onLongPressMove)}
      onResponderTerminationRequest={() => !onLongPressMove}
      testID={testID}
      pointerEvents={pointerEvents}
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
        {isSelected && item.kind === "furniture" ? (
          <View pointerEvents="none" style={styles.itemSelectionHalo} />
        ) : null}
        {placementState === "valid" ? (
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
          <Animated.View
            style={[
              styles.avatarImage,
              {
                opacity: item.direction === "back" ? 0.84 : 1,
                transform: [
                  { translateX: getAvatarMotionTranslateX(avatarMotion, gestureRef) },
                  { translateY: getAvatarMotionTranslateY(avatarMotion, breatheRef, walkRef, gestureRef, usesIdleBreathe, item.kind === "avatar" ? item.seatRig : undefined, stageHeightPx) },
                  { scaleX: item.direction === "left" ? -1 : 1 },
                  { scaleY: getAvatarMotionScaleY(avatarMotion, breatheRef, gestureRef, usesIdleBreathe) },
                  { scale: item.direction === "back" ? 0.96 : 1 },
                  { rotate: getAvatarMotionRotate(avatarMotion, gestureRef) }
                ]
              }
            ]}
          >
            <RoomAvatarRenderer2D layers={item.layers} />
          </Animated.View>
        ) : (
          <Image
            source={item.asset.source}
            resizeMode={getRoomV2FurnitureImageResizeMode(item.sceneProjection)}
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
      </View>
    </Wrapper>
  )
}, (previous, next) =>
  previous.item === next.item &&
  previous.isSelected === next.isSelected &&
  previous.placementState === next.placementState &&
  previous.onTap === next.onTap &&
  previous.onLongPress === next.onLongPress &&
  previous.onLongPressMove === next.onLongPressMove &&
  previous.onLongPressRelease === next.onLongPressRelease &&
  previous.debugPlacement === next.debugPlacement &&
  previous.reduceMotion === next.reduceMotion &&
  previous.stageWidthPx === next.stageWidthPx &&
  previous.stageHeightPx === next.stageHeightPx &&
  previous.seatedFurnitureName === next.seatedFurnitureName &&
  previous.testID === next.testID
)

function getAvatarMotionTranslateY(
  motion: ReturnType<typeof getRenderableRoomV2AvatarMotionProfile>,
  breatheRef: Animated.Value,
  walkRef: Animated.Value,
  gestureRef: Animated.Value,
  usesIdleBreathe: boolean,
  seatRig?: RoomV2AvatarRenderItem["seatRig"],
  stageHeightPx?: number
): Animated.AnimatedInterpolation<string | number> | number {
  if (motion.state === "walking" && motion.usesRuntimeLocomotion) {
    return walkRef.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -3]
    })
  }
  if (motion.state === "sitting") {
    return getRoomV2AvatarSittingTranslateY(seatRig, stageHeightPx)
  }
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -5]
    })
  }
  if (motion.state === "waving" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -2]
    })
  }
  if (motion.usesAnimatedAssets || !usesIdleBreathe) return 0
  return breatheRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1.5]
  })
}

function getAvatarMotionScaleY(
  motion: ReturnType<typeof getRenderableRoomV2AvatarMotionProfile>,
  breatheRef: Animated.Value,
  gestureRef: Animated.Value,
  usesIdleBreathe: boolean
): Animated.AnimatedInterpolation<string | number> | number {
  if (motion.state === "sitting") return 1
  if (motion.usesAnimatedAssets) return 1
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.045]
    })
  }
  if (!usesIdleBreathe) return 1
  return breatheRef.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018]
  })
}

function getAvatarMotionRotate(
  motion: ReturnType<typeof getRenderableRoomV2AvatarMotionProfile>,
  gestureRef: Animated.Value
): Animated.AnimatedInterpolation<string | number> | string {
  if (motion.usesAnimatedAssets) return "0deg"
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: ["-4deg", "4deg"]
    })
  }
  if (motion.state === "waving" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: ["-1deg", "3deg"]
    })
  }
  return "0deg"
}

function getAvatarMotionTranslateX(
  motion: ReturnType<typeof getRenderableRoomV2AvatarMotionProfile>,
  gestureRef: Animated.Value
): Animated.AnimatedInterpolation<string | number> | number {
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [-2.5, 2.5]
    })
  }
  return 0
}

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

function getPlacementGuideSpan(
  lane: RoomPlacementLane,
  shell: RoomShell
): { minX: number; maxX: number } {
  const fallbackMinX = lane.minX ?? shell.placeableArea?.minX ?? 0
  const fallbackMaxX = lane.maxX ?? shell.placeableArea?.maxX ?? 1
  const polygonSpan = getPolygonHorizontalSpanAtY(shell.walkablePolygon, lane.y)
  if (!polygonSpan) {
    return {
      minX: fallbackMinX,
      maxX: fallbackMaxX
    }
  }

  return {
    minX: Math.max(fallbackMinX, polygonSpan.minX),
    maxX: Math.min(fallbackMaxX, polygonSpan.maxX)
  }
}

function getPolygonHorizontalSpanAtY(
  polygon: RoomShell["walkablePolygon"],
  y: number
): { minX: number; maxX: number } | null {
  if (!polygon || polygon.length < 3) return null
  const intersections: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const crosses =
      (start.y <= y && end.y > y) ||
      (end.y <= y && start.y > y)
    if (!crosses) continue
    const dy = end.y - start.y
    if (Math.abs(dy) <= 0.0001) continue
    const t = (y - start.y) / dy
    intersections.push(start.x + (end.x - start.x) * t)
  }
  if (intersections.length < 2) return null
  intersections.sort((a, b) => a - b)
  return {
    minX: intersections[0],
    maxX: intersections[intersections.length - 1]
  }
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#110A12"
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
  furnitureFrontOcclusion: {
    position: "absolute",
    zIndex: 20
  },
  furnitureFrontOcclusionCrop: {
    position: "absolute",
    overflow: "hidden"
  },
  furnitureFrontOcclusionImage: {
    width: "100%",
    height: "100%"
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    zIndex: 2
  },
  avatarGroundShadow: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "2%",
    height: "9%",
    borderRadius: 999,
    backgroundColor: "rgba(38, 17, 42, 0.62)",
    shadowColor: "#5D2339",
    shadowOpacity: 0.26,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    transform: [{ rotate: "-3deg" }],
    zIndex: 1
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
