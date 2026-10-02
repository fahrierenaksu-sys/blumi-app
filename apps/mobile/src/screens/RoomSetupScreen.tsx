import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import { BlumiSetupShell } from "../features/session/setupFlow/BlumiSetupShell"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { ROOM_AVATAR_CATALOG } from "../features/avatarV2/room/avatarRoomCatalog"
import { projectAvatarV2ToRoomAvatarAppearance } from "../features/avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../features/avatarV2/room/avatarRoomSelectors"
import { RoomRenderer2D } from "../features/roomV2/components/RoomRenderer2D"
import {
  getRoomSetupStageHeight,
  getRoomSetupTaskCardMinHeight
} from "../features/roomV2/roomSetupLayoutModel"
import type { RoomV2RenderItem, UserRoomDecor } from "../features/roomV2/roomV2.types"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2Catalog"
import {
  createRoomV2AvatarRenderItem,
  insertRoomV2RenderItemSorted,
  resolvePlacedFurnitureRenderItem,
  resolveRoomV2Scene,
  validateRoomV2FurniturePlacement
} from "../features/roomV2/roomV2Selectors"
import {
  hasPlacedStarterBed,
  placeStarterBed,
  rotateStarterBed,
  STARTER_ROOM_BED_DEFAULT_POINT,
  STARTER_ROOM_BED_ITEM_ID
} from "../features/roomV2/roomStarterModel"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import { LinearGradient } from "../ui/linearGradient"
import { useReducedMotionPreference } from "../ui/animations"
import { hapticError, hapticLight, hapticMedium, hapticSelection } from "../ui/haptics"
import { GestureDetector } from "react-native-gesture-handler"
import Animated, { FadeIn } from "react-native-reanimated"
import { RoomEditorDragGhost } from "../features/roomV2/editor/RoomEditorDragGhost"
import { useRoomSetupBedDrag } from "../features/session/setupFlow/useRoomSetupBedDrag"
import { blumiEntryTheme as uiTheme } from "../ui/theme"
import { getSetupLayoutMetrics } from "../features/session/setupFlow/setupFlowShellModel"
import {
  useOnboardingHardwareBack,
  useOnboardingSignOut
} from "./components/onboardingScreenActions"
import { getAppLocale } from "../features/session/appLocale"
import { getRoomSetupCopy } from "../features/roomV2/roomSetupCopy"
import {
  resolveRoomSetupMutationFeedback,
  resolveRoomSetupStatusLine
} from "../features/roomV2/roomSetupPlacementFeedback"
import { PressableScale } from "../ui/PressableScale"

export interface RoomSetupScreenProps {
  isSubmitting: boolean
  errorMessage: string | null
  onComplete: (decor: UserRoomDecor) => Promise<void>
  onBackToAvatar: () => void
  onEditProfile: () => void
  onSignOut: () => Promise<void>
  completionLabel?: string
  motionActive?: boolean
}

export function RoomSetupScreen({
  isSubmitting,
  errorMessage,
  onComplete,
  onBackToAvatar,
  onEditProfile: _onEditProfile,
  onSignOut,
  completionLabel,
  motionActive = true
}: RoomSetupScreenProps) {
  const { fontScale, height, width } = useWindowDimensions()
  const { reduceMotion } = useReducedMotionPreference()
  const setupMetrics = getSetupLayoutMetrics({ fontScale, height, width })
  const {
    persistenceState,
    userRoomDecor,
    setUserRoomDecor
  } = useRoomV2()
  const copy = getRoomSetupCopy(getAppLocale())
  const { avatar, catalog: avatarCatalog } = useAvatarV2()
  const roomFrameRef = useRef<View>(null)
  const [bedSelected, setBedSelected] = useState(false)
  const [placementMessage, setPlacementMessage] = useState("")
  const [placementErrorMessage, setPlacementErrorMessage] = useState("")
  const starterBed = useMemo(
    () => ROOM_V2_FURNITURE_CATALOG.find(
      (item) => item.id === STARTER_ROOM_BED_ITEM_ID
    ),
    []
  )
  const onboardingDecor = useMemo(
    () => ({
      roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
      placedItems: userRoomDecor.placedItems
        .filter((item) => item.itemId === STARTER_ROOM_BED_ITEM_ID)
        .slice(0, 1)
        .map((item) => ({ ...item }))
    }),
    [userRoomDecor.placedItems]
  )
  const scene = useMemo(
    () => resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
      decor: onboardingDecor,
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    }),
    [onboardingDecor]
  )
  const starterRoomReady = useMemo(() => {
    if (
      !hasPlacedStarterBed(userRoomDecor) ||
      userRoomDecor.roomShellId !== DEFAULT_ROOM_V2_SHELL_ID
    ) {
      return false
    }
    const placedBed = userRoomDecor.placedItems[0]
    const candidate = starterBed
      ? resolvePlacedFurnitureRenderItem(placedBed, starterBed)
      : null
    if (!candidate) return false
    const emptyScene = resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
      decor: {
        roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
        placedItems: []
      },
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
    return validateRoomV2FurniturePlacement({
      scene: emptyScene,
      candidate
    }).isValid
  }, [starterBed, userRoomDecor])
  const roomTaskCardMinHeight = getRoomSetupTaskCardMinHeight(
    setupMetrics.compact,
    starterRoomReady
  )
  // Keep the complete room silhouette in view while reserving enough space
  // for the room confirmation surface and fixed CTA dock.
  const roomStageHeight = getRoomSetupStageHeight(setupMetrics.compact, height)
  const roomAvatarAppearance = useMemo(
    () => projectAvatarV2ToRoomAvatarAppearance({
      avatar,
      avatarCatalog,
      roomAvatarCatalog: ROOM_AVATAR_CATALOG
    }).appearance,
    [avatar, avatarCatalog]
  )
  const storyScene = useMemo(() => {
    const avatarState = "idle" as const
    const direction = "front" as const
    const layers = getRoomAvatarRenderLayers({
      appearance: roomAvatarAppearance,
      catalog: ROOM_AVATAR_CATALOG,
      direction,
      state: avatarState
    })
    const bed = scene.renderItems.find((item) => item.kind === "furniture")
    const avatarItem = createRoomV2AvatarRenderItem({
      avatarId: "setup-avatar",
      renderId: "setup-avatar",
      name: copy.avatarName,
      layers,
      x: bed ? Math.min(0.84, Math.max(0.16, bed.x + 0.22)) : 0.72,
      y: bed ? Math.min(0.84, Math.max(0.62, bed.y + 0.04)) : 0.76,
      width: 0.28,
      height: 0.5,
      direction,
      state: avatarState
    })
    return {
      ...scene,
      renderItems: insertRoomV2RenderItemSorted(scene.renderItems, avatarItem)
    }
  }, [copy.avatarName, roomAvatarAppearance, scene])
  const placedBed = useMemo(
    () => storyScene.renderItems.find(
      (item) => item.kind === "furniture" && item.itemId === STARTER_ROOM_BED_ITEM_ID
    ),
    [storyScene.renderItems]
  )
  const placeBedAtPoint = useCallback((point: { x: number; y: number }): void => {
    if (persistenceState === "loading") {
      setPlacementMessage(copy.placement.roomLoading)
      return
    }
    if (!starterBed) return
    const baseDecor = {
      roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
      placedItems: []
    }
    const baseScene = resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
      decor: baseDecor,
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
    const nextDecor = placeStarterBed(
      baseDecor,
      point,
      userRoomDecor.placedItems[0]?.rotation ?? "front"
    )
    const candidate = resolvePlacedFurnitureRenderItem(
      nextDecor.placedItems[0],
      starterBed
    )
    if (
      !candidate ||
      !validateRoomV2FurniturePlacement({
        scene: baseScene,
        candidate
      }).isValid
    ) {
      hapticError()
      setPlacementMessage(copy.placement.chooseAnotherSpot)
      return
    }
    const feedback = resolveRoomSetupMutationFeedback({
      accepted: setUserRoomDecor(nextDecor),
      action: "placed",
      copy
    })
    setPlacementErrorMessage(feedback.errorMessage)
    if (feedback.message === undefined) return
    setBedSelected(feedback.selectBed)
    setPlacementMessage(feedback.message)
    hapticLight()
  }, [copy, persistenceState, setUserRoomDecor, starterBed, userRoomDecor.placedItems])

  const rotatePlacedBed = useCallback((): void => {
    if (!starterBed || !hasPlacedStarterBed(userRoomDecor)) return
    const nextDecor = rotateStarterBed(userRoomDecor)
    const candidate = resolvePlacedFurnitureRenderItem(
      nextDecor.placedItems[0],
      starterBed
    )
    const emptyScene = resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
      decor: {
        roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
        placedItems: []
      },
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
    if (
      !candidate ||
      !validateRoomV2FurniturePlacement({
        scene: emptyScene,
        candidate
      }).isValid
    ) {
      setPlacementMessage(copy.placement.moveInBeforeRotating)
      return
    }
    const feedback = resolveRoomSetupMutationFeedback({
      accepted: setUserRoomDecor(nextDecor),
      action: "rotated",
      copy
    })
    setPlacementErrorMessage(feedback.errorMessage)
    if (feedback.message !== undefined) setPlacementMessage(feedback.message)
  }, [copy, setUserRoomDecor, starterBed, userRoomDecor])

  const handlePlacedBedLongPress = useCallback((): void => {
    hapticMedium()
    setBedSelected(true)
    setPlacementMessage(copy.placement.longPressMove)
  }, [copy])

  const placeBedAtWindowPoint = useCallback((pageX: number, pageY: number): void => {
    roomFrameRef.current?.measureInWindow((x, y, width, height) => {
      if (
        width <= 0 ||
        height <= 0 ||
        pageX < x ||
        pageX > x + width ||
        pageY < y ||
        pageY > y + height
      ) {
        hapticError()
        setPlacementMessage(copy.placement.dragToFloor)
        return
      }
      placeBedAtPoint({
        x: (pageX - x) / width,
        y: (pageY - y) / height
      })
    })
  }, [copy, placeBedAtPoint])

  const bedDrag = useRoomSetupBedDrag({
    enabled: Boolean(starterBed),
    reduceMotion,
    handlers: useMemo(() => ({
      onLift: () => {
        hapticSelection()
        setBedSelected(true)
        setPlacementMessage(copy.placement.tapOrDrag)
      },
      onDrop: placeBedAtWindowPoint,
      onTap: () => {
        setBedSelected(true)
        placeBedAtPoint(STARTER_ROOM_BED_DEFAULT_POINT)
      }
    }), [copy, placeBedAtPoint, placeBedAtWindowPoint])
  })
  const { liftGhostAt, showGhostAt, releaseGhost } = bedDrag
  const placedBedMovingRef = useRef(false)

  // Moving the placed bed: the ghost follows the finger and the room is
  // written once, on release (it was written on every move before).
  const handlePlacedBedLongPressMove = useCallback((
    item: RoomV2RenderItem,
    point: { pageX: number; pageY: number }
  ): void => {
    if (item.kind !== "furniture" || item.itemId !== STARTER_ROOM_BED_ITEM_ID) return
    if (!placedBedMovingRef.current) {
      placedBedMovingRef.current = true
      liftGhostAt(point.pageX, point.pageY)
      return
    }
    showGhostAt(point.pageX, point.pageY)
  }, [liftGhostAt, showGhostAt])

  const handlePlacedBedLongPressRelease = useCallback((
    item: RoomV2RenderItem,
    point: { x: number; y: number }
  ): void => {
    if (item.kind !== "furniture" || item.itemId !== STARTER_ROOM_BED_ITEM_ID) return
    placedBedMovingRef.current = false
    releaseGhost()
    placeBedAtPoint(point)
  }, [placeBedAtPoint, releaseGhost])

  const bedGhostSource = starterBed
    ? starterBed.visualContract?.directions.front.thumbnailAsset?.source ?? starterBed.asset.source
    : undefined

  const { busy } = useOnboardingSignOut(onSignOut, isSubmitting)
  useOnboardingHardwareBack(onBackToAvatar, busy)
  const statusLine = resolveRoomSetupStatusLine({
    persistenceState,
    errorMessage: placementErrorMessage,
    message: placementMessage,
    showMessage: !starterRoomReady && bedSelected,
    copy
  })

  return (
    <View style={styles.screenRoot}>
    <BlumiSetupShell
      backDisabled={busy}
      feedback={errorMessage ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      motionActive={motionActive}
      onBack={onBackToAvatar}
      onPrimaryAction={() => {
        if (!starterRoomReady) return
        void onComplete(onboardingDecor).catch(() => undefined)
      }}
      primaryActionBusy={isSubmitting}
      primaryActionDisabled={busy || !starterRoomReady}
      primaryActionLabel={completionLabel ?? copy.completionLabel}
      primaryActionTestID="room-setup-submit"
      reduceMotion={reduceMotion}
      headerTitle={copy.headerTitle}
      headerProgressStyle="fraction"
      hideHeading
      hideProgressRail
      immersiveBottomSheet
      stageInteractive
      stageHeight={roomStageHeight}
      step="room"
      taskCardMinHeight={roomTaskCardMinHeight}
      taskCardTone="sheet"
      stage={(
        <View
          ref={roomFrameRef}
          style={styles.stageFrame}
        >
          <RoomRenderer2D
            shell={storyScene.shell}
            renderItems={storyScene.renderItems}
            motionEnabled={false}
            itemInteractionMode="edit"
            onItemLongPress={handlePlacedBedLongPress}
            onItemLongPressMove={handlePlacedBedLongPressMove}
            onItemLongPressRelease={handlePlacedBedLongPressRelease}
            onStagePress={bedSelected || starterRoomReady ? placeBedAtPoint : undefined}
            showDepthWash={false}
            accessibilityLabel={copy.roomAccessibilityLabel}
            style={styles.roomSceneSurface}
            testID="onboarding-room-preview"
          />
          {starterRoomReady && placedBed ? (
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.88)",
                "rgba(255,244,248,0.76)",
                "rgba(255,255,255,0.82)"
              ]}
              end={{ x: 0.92, y: 1 }}
              start={{ x: 0.08, y: 0 }}
              style={[
                styles.bedEditorToolbar,
                {
                  left: `${Math.max(17, Math.min(83, placedBed.x * 100))}%`,
                  top: `${Math.max(4, placedBed.y * 100 - 30)}%`
                }
              ]}
            >
              <View pointerEvents="none" style={styles.bedToolbarHighlight} />
              <View
                accessible
                accessibilityLabel={copy.moveBedAccessibilityLabel}
                style={styles.bedMoveHint}
              >
                <Ionicons color={uiTheme.colors.primary} name="move" size={16} />
              </View>
              <View pointerEvents="none" style={styles.bedToolbarDivider} />
              <PressableScale
                accessibilityLabel={copy.rotateBedAccessibilityLabel}
                accessibilityRole="button"
                hitSlop={6}
                onPress={rotatePlacedBed}
                style={styles.bedRotateAction}
                testID="starter-bed-rotate"
              >
                <Ionicons color={uiTheme.colors.primary} name="refresh" size={16} />
              </PressableScale>
            </LinearGradient>
          ) : null}
        </View>
      )}
    >
      <View
        style={[
          styles.roomFirstSheet,
          setupMetrics.dense ? styles.roomFirstSheetDense : null
        ]}
      >
        <View style={styles.roomFirstSummary}>
          <Text accessibilityRole="header" style={styles.roomFirstTitle}>
            {copy.summaryTitle}
          </Text>
          <Text style={styles.roomFirstDescription}>
            {starterRoomReady
              ? copy.bedPlacedSummary
              : copy.bedPendingSummary}
          </Text>
          <View style={styles.giftChip}>
            <Text maxFontSizeMultiplier={1.3} style={styles.giftChipText}>{copy.giftBadge}</Text>
          </View>
        </View>
        <View style={styles.roomFirstStatus}>
          {starterRoomReady ? (
            <Animated.View
              accessible
              accessibilityLabel={copy.bedPlacedAccessibilityLabel}
              entering={reduceMotion ? undefined : FadeIn.duration(200)}
              style={styles.placementCompleteCard}
              testID="starter-bed-card"
            >
              <View style={styles.placementCompleteIcon}>
                <Ionicons color="#FFFFFF" name="checkmark" size={14} />
              </View>
              <Text maxFontSizeMultiplier={1.4} style={styles.placementCompleteText}>{copy.bedPlacedCard}</Text>
            </Animated.View>
          ) : starterBed ? (
            <GestureDetector gesture={bedDrag.cardGesture}>
            <View
              accessible
              onAccessibilityTap={() => {
                setBedSelected(true)
                placeBedAtPoint(STARTER_ROOM_BED_DEFAULT_POINT)
              }}
              accessibilityLabel={copy.starterItemAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected: bedSelected }}
              style={styles.starterItemLiquidFrame}
              testID="starter-bed-card"
            >
              <View style={[
                styles.starterItemCard,
                bedSelected ? styles.starterItemCardSelected : null
              ]}>
                <LinearGradient
                  colors={["rgba(255,255,255,0.96)", "rgba(255,241,247,0.78)"]}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={styles.starterItemImageFrame}
                >
                  <Image
                    resizeMode="contain"
                    source={
                      starterBed.visualContract?.directions.front.thumbnailAsset?.source ??
                      starterBed.asset.source
                    }
                    style={styles.starterItemImage}
                  />
                </LinearGradient>
                <View style={styles.starterItemCopy}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.starterItemTitle}>{copy.starterItemTitle}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={styles.starterItemHint}>{copy.starterItemHint}</Text>
                </View>
                <View style={styles.starterItemAction}>
                  <Ionicons color="#FFFFFF" name="add" size={20} />
                </View>
              </View>
            </View>
            </GestureDetector>
          ) : null}
        </View>
        {statusLine?.tone === "alert" ? (
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={styles.placementMessage}
          >
            {statusLine.text}
          </Text>
        ) : statusLine?.tone === "polite" ? (
          <Text accessibilityLiveRegion="polite" style={styles.placementMessage}>
            {statusLine.text}
          </Text>
        ) : null}
      </View>
    </BlumiSetupShell>
      <RoomEditorDragGhost
        ghost={bedGhostSource !== undefined && bedDrag.ghostSession !== null
          ? { session: bedDrag.ghostSession, source: bedGhostSource, mirrored: false, frame: BED_GHOST_FRAME }
          : undefined}
        values={bedDrag.ghostValues}
      />
    </View>
  )
}

/** The lifted bed floats just above the finger so the finger never hides it. */
const BED_GHOST_FRAME = { offsetX: -60, offsetY: -96, width: 120, height: 90 }

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  stageFrame: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    height: "100%",
    width: "100%"
  },
  roomSceneSurface: {
    backgroundColor: uiTheme.colors.backgroundWarm,
    width: "100%"
  },
  bedEditorToolbar: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.88)",
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    flexDirection: "row",
    height: 36,
    justifyContent: "space-between",
    marginLeft: -42,
    marginTop: -18,
    overflow: "hidden",
    position: "absolute",
    width: 84,
    ...uiTheme.shadow.soft
  },
  bedToolbarHighlight: {
    backgroundColor: "rgba(255,255,255,0.46)",
    borderRadius: uiTheme.radius.full,
    height: 16,
    left: 8,
    position: "absolute",
    right: 8,
    top: 3
  },
  bedMoveHint: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 38
  },
  bedToolbarDivider: {
    backgroundColor: "rgba(198, 61, 89, 0.14)",
    height: 20,
    width: 1
  },
  bedRotateAction: {
    alignItems: "center",
    borderRadius: uiTheme.radius.full,
    height: 34,
    justifyContent: "center",
    width: 38
  },
  roomFirstSheet: {
    alignItems: "center",
    alignSelf: "stretch",
    marginTop: -20,
    gap: uiTheme.spacing.md,
    paddingHorizontal: uiTheme.spacing.xs,
    paddingBottom: uiTheme.spacing.xs,
    paddingTop: uiTheme.spacing.sm
  },
  roomFirstSheetDense: {
    gap: uiTheme.spacing.sm,
    marginTop: -10,
    paddingTop: uiTheme.spacing.xs
  },
  roomFirstSummary: {
    alignItems: "center",
    gap: uiTheme.spacing.xs
  },
  roomFirstStatus: {
    alignSelf: "stretch",
    marginBottom: uiTheme.spacing.md
  },
  giftChip: {
    alignItems: "center",
    backgroundColor: "rgba(255, 224, 236, 0.86)",
    borderRadius: uiTheme.radius.full,
    paddingHorizontal: 11,
    paddingVertical: 5
  },
  giftChipText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primary,
    fontWeight: "800",
    letterSpacing: 0.6
  },
  roomFirstTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  roomFirstDescription: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  },
  starterItemLiquidFrame: {
    borderRadius: uiTheme.radius.lg
  },
  starterItemCard: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    padding: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(225,204,217,0.76)",
    backgroundColor: "rgba(255,255,255,0.72)"
  },
  starterItemCardSelected: {
    backgroundColor: "rgba(255,239,246,0.92)",
    borderColor: "rgba(209,55,96,0.46)",
    ...uiTheme.shadow.soft
  },
  starterItemImageFrame: {
    width: 68,
    height: 62,
    borderRadius: uiTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.96)",
    ...uiTheme.shadow.soft
  },
  starterItemImage: {
    width: 60,
    height: 54
  },
  starterItemCopy: {
    flex: 1,
    gap: 2
  },
  starterItemTitle: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.primaryDeep
  },
  starterItemHint: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary
  },
  starterItemAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primaryDeep,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    ...uiTheme.shadow.soft
  },
  placementCompleteCard: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 247, 250, 0.78)",
    borderColor: "rgba(198, 61, 89, 0.22)",
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    justifyContent: "center",
    minHeight: 62,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 8
  },
  placementCompleteIcon: {
    alignItems: "center",
    backgroundColor: uiTheme.colors.primary,
    borderRadius: 13,
    height: 26,
    justifyContent: "center",
    width: 26
  },
  placementCompleteText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep,
    textAlign: "center"
  },
  placementMessage: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep,
    minHeight: 36,
    textAlign: "center"
  },
  error: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.dangerInk,
    textAlign: "center"
  }
})
