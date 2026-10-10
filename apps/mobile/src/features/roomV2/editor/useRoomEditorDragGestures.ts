import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState } from "react-native"
import type Animated from "react-native-reanimated"
import { Gesture } from "react-native-gesture-handler"
import {
  cancelAnimation,
  measure,
  ReduceMotion,
  useAnimatedRef,
  useSharedValue,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"
import { hapticError, hapticMedium, hapticRigid, hapticSelection } from "../../../ui/haptics"
import { animateSegment, animateSequence, animateTo, animateToAfter, useMotion } from "../../../ui/motion"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomV2FloorGridProjection } from "../roomV2FloorGrid"
import { getRoomSceneItemKey } from "../components/roomSceneReadiness"
import { resolvePlacedFurnitureRenderItem } from "../roomV2Selectors"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomV2FurnitureRenderItem,
  UserRoomDecor
} from "../roomV2.types"
import { ACTIVE_ROOM_FURNITURE_CATALOG } from "./roomEditorCatalog"
import {
  ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS,
  ROOM_EDITOR_DRAG_GHOST_OPACITY,
  getRoomEditorDragCellHaptic,
  ROOM_EDITOR_DRAG_LIFT_SCALE,
  ROOM_EDITOR_DRAG_OUTSIDE_CELL,
  ROOM_EDITOR_DRAG_SNAP_MS,
  ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT,
  createRoomEditorDragHitRects,
  createRoomEditorStageDragPreview,
  createRoomEditorTrayDragPreview,
  findRoomEditorDragHitRect,
  getRoomEditorDragCell,
  getRoomEditorDragCellWindowPoint,
  getRoomEditorDragFeedback,
  getRoomEditorDragFloorGrid,
  getRoomEditorDragGhostFrame,
  getRoomEditorDragShadowSpot,
  getRoomEditorDrawPoint,
  getRoomEditorStageDragPoint,
  isRoomEditorFloorLayerPiece,
  getRoomEditorTrayDrawOffset,
  getRoomEditorTrayDragPoint,
  getRoomEditorTrayUsesWallMagnet,
  hasRoomEditorDragCellChanged,
  resolveRoomEditorDragRelease,
  type RoomEditorDragGhostFrame,
  type RoomEditorDragShadowSpot,
  type RoomEditorDragHitRect
} from "./roomEditorDragModel"
import {
  ROOM_EDITOR_PLACE_JUICE,
  ROOM_EDITOR_SETTLE_FALL,
  ROOM_EDITOR_SETTLE_HANDOFF_CAP_MS,
  ROOM_EDITOR_SETTLE_HANDOFF_MS,
  ROOM_EDITOR_SETTLE_REBOUND,
  ROOM_EDITOR_SETTLE_REBOUND_SHARE,
  ROOM_EDITOR_SETTLE_REST,
  ROOM_EDITOR_SETTLE_SQUASH
} from "./roomEditorPlaceMotion"
import {
  getRoomPlacementSurfaceDropFeedback,
  type PlacementPreview,
  type StageWindowBounds
} from "./roomEditorPlacementModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import type { RoomEditorSelection } from "./useRoomEditorSelection"
import type { RoomEditorStageLayout } from "./useRoomEditorStageLayout"

/** What the floating drag ghost shows; its position lives in shared values. */
export interface RoomEditorDragGhostContent {
  session: number
  /**
   * The room piece this overlay stands in for while it is held (the room hides
   * it). Cleared at a valid drop so the placed piece takes over at once while
   * the overlay fades. Other users of the overlay omit it.
   */
  renderId?: string
  source: FurnitureItem["asset"]["source"]
  mirrored: boolean
  frame: RoomEditorDragGhostFrame
  /** Calibrated pieces: the soft shadow sits on the piece's floor cells; else under the drawing. */
  shadowSpot?: RoomEditorDragShadowSpot
  /** A wall piece on the wall magnet: it casts no floor shadow (the lit wall strip shows where it goes). */
  hangsOnWall?: boolean
  /**
   * A flat layered piece on the floor layer (a 2.5D rug). It never floats over the room: while the
   * room draws it on its cell, under furniture and avatars, the overlay stays hidden (see getRoomEditorGhostIsDrawnByRoom).
   */
  floorLayer?: boolean
}

/** Ghost anchor in window coordinates plus the overlay's window origin. */
export interface RoomEditorDragGhostValues {
  x: SharedValue<number>
  y: SharedValue<number>
  scale: SharedValue<number>
  opacity: SharedValue<number>
  /** 0 resting, 1 held up off the room (raises the piece over its shadow). */
  lift?: SharedValue<number>
  /** The settle on a drop: 0 at rest, 1 squashed (see getRoomEditorSquashScale). */
  squash?: SharedValue<number>
  overlayOrigin: SharedValue<{ x: number; y: number }>
}

type ActiveDrag =
  | {
    session: number
    source: "stage"
    renderId: string
    floor: RoomV2FloorGridProjection | null
    /** A wall piece on the wall magnet: JS places the held piece on each new wall spot. */
    wallMagnet: boolean
    startColumn: number
    startRow: number
  }
  | {
    session: number
    source: "tray"
    item: FurnitureItem
    instanceId: string
    rotation: PlacedRoomItem["rotation"]
    floor: RoomV2FloorGridProjection | null
    wallMagnet: boolean
    startColumn: number
    startRow: number
  }

const EMPTY_STAGE_BOUNDS: StageWindowBounds = { x: 0, y: 0, width: 0, height: 0 }

/**
 * Drag-to-move for the editor, on Gesture Handler pans. A touch-and-hold
 * (ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS) on a placed piece, or on an owned
 * tray card, lifts a ghost that follows the finger on the UI thread. A floor
 * piece's ghost snaps onto the floor-grid cell under it (a tray piece is held
 * ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT above the fingertip so that cell is in
 * view). JS hears only when the snapped cell changes (to show validity with
 * the tap placement rules, and to nudge the ghost when the footprint had to
 * be fitted onto the floor) and on release, which commits that same preview
 * through `commitTrayPlacementPreview`, the confirm control's path. Invalid
 * drops spring back; interrupted gestures and backgrounding restore the
 * piece. Taps stay on the Pressables: the pan fails when the finger moves
 * before the hold ends or, on the stage, when the touch starts off a piece, so
 * page scroll and iOS edge back keep the touch. The stage is measured on the
 * UI thread when a tray drag starts, so a scrolled page or a dock that changed
 * the stage's position never offsets the drop.
 */
export function useRoomEditorDragGestures(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  placedItems: UserRoomDecor["placedItems"]
  canPlaceAnotherRoomItem: (itemId: string) => boolean
  commitTrayPlacementPreview: (preview: PlacementPreview | undefined) => boolean
  /** A drag dropped a piece and it was committed (the stage plays its sparkle there). */
  onPlaced?: (item: RoomV2FurnitureRenderItem) => void
  selection: RoomEditorSelection
  stage: RoomEditorStageLayout
  inventory: Pick<
    RoomEditorInventoryState,
    "setSelectedInventoryItemId" | "setSelectedInventoryRotation"
  >
}) {
  const { scene } = input
  const { roomLayout, stageWindowBounds } = input.stage
  const motion = useMotion()
  const { reduceMotion } = motion
  const [ghost, setGhost] = useState<RoomEditorDragGhostContent | undefined>()
  const activeDragRef = useRef<ActiveDrag | null>(null)
  const lastDragPreviewRef = useRef<PlacementPreview | undefined>(undefined)

  const stageAnimatedRef = useAnimatedRef<Animated.View>()
  const hitRects = useSharedValue<RoomEditorDragHitRect[]>([])
  const stageSize = useSharedValue({ width: 0, height: 0 })
  const stageBounds = useSharedValue<StageWindowBounds>(EMPTY_STAGE_BOUNDS)
  const sceneFloor = useSharedValue<RoomV2FloorGridProjection | null>(null)
  // The active drag's grid and its stage rectangle in window coordinates.
  const dragFloor = useSharedValue<RoomV2FloorGridProjection | null>(null)
  // The active stage drag holds a wall piece on the wall magnet (it does not follow the finger).
  const dragWallMagnet = useSharedValue(false)
  const dragStage = useSharedValue<StageWindowBounds>(EMPTY_STAGE_BOUNDS)
  const dragSession = useSharedValue(0)
  const grabRenderId = useSharedValue("")
  const grabOffsetX = useSharedValue(0)
  const grabOffsetY = useSharedValue(0)
  const lastColumn = useSharedValue(ROOM_EDITOR_DRAG_OUTSIDE_CELL)
  const lastRow = useSharedValue(ROOM_EDITOR_DRAG_OUTSIDE_CELL)
  const ghostX = useSharedValue(0)
  const ghostY = useSharedValue(0)
  const ghostOriginX = useSharedValue(0)
  const ghostOriginY = useSharedValue(0)
  const ghostScale = useSharedValue(1)
  const ghostOpacity = useSharedValue(0)
  const ghostLift = useSharedValue(0)
  const ghostSquash = useSharedValue(0)
  // The held piece is drawn this far from its anchor (stage fractions), as the room draws it.
  const dragDrawOffsetX = useSharedValue(0)
  const dragDrawOffsetY = useSharedValue(0)
  // Where the grabbed piece is drawn right now (its lift starts exactly over it).
  const liftDrawOffsetX = useSharedValue(0)
  const liftDrawOffsetY = useSharedValue(0)
  const overlayOrigin = useSharedValue({ x: 0, y: 0 })

  useEffect(() => {
    hitRects.value = createRoomEditorDragHitRects(scene.renderItems, scene.shell)
  }, [hitRects, scene.renderItems, scene.shell])
  useEffect(() => {
    sceneFloor.value = scene.shell?.floorGrid
      ? getRoomEditorDragFloorGrid({ placementSurface: "floor" }, scene.shell)
      : null
  }, [sceneFloor, scene.shell])
  useEffect(() => {
    stageSize.value = { width: roomLayout.width, height: roomLayout.height }
  }, [roomLayout.height, roomLayout.width, stageSize])
  useEffect(() => {
    stageBounds.value = stageWindowBounds ?? EMPTY_STAGE_BOUNDS
  }, [stageBounds, stageWindowBounds])

  const clearGhost = useCallback((session: number) => {
    setGhost((current) => current?.session === session ? undefined : current)
  }, [])

  const { snappy, fadeOut } = motion
  const liftGhost = useCallback((anchorX: number, anchorY: number) => {
    "worklet"
    cancelAnimation(ghostX)
    cancelAnimation(ghostY)
    cancelAnimation(ghostScale)
    cancelAnimation(ghostOpacity)
    cancelAnimation(ghostLift)
    cancelAnimation(ghostSquash)
    ghostSquash.value = 0
    ghostX.value = anchorX
    ghostY.value = anchorY
    ghostOriginX.value = anchorX
    ghostOriginY.value = anchorY
    // Lift: the piece grows a touch and rises over its shadow (snappy).
    // Reduce Motion keeps its size; the shadow still shows it is held.
    ghostScale.value = reduceMotion ? 1 : animateTo(ROOM_EDITOR_DRAG_LIFT_SCALE, snappy)
    ghostLift.value = animateTo(1, snappy)
    ghostOpacity.value = ROOM_EDITOR_DRAG_GHOST_OPACITY
  }, [ghostLift, ghostOpacity, ghostOriginX, ghostOriginY, ghostScale, ghostSquash, ghostX, ghostY, reduceMotion, snappy])

  // A floor drag shows the piece on its snapped cell: a short glide, or a
  // jump under Reduce Motion. Only window coordinates change; no render.
  const moveGhostToWindowPoint = useCallback((x: number, y: number) => {
    "worklet"
    if (reduceMotion) {
      ghostX.value = x
      ghostY.value = y
      return
    }
    const timing = { duration: ROOM_EDITOR_DRAG_SNAP_MS, reduceMotion: ReduceMotion.Never }
    ghostX.value = withTiming(x, timing)
    ghostY.value = withTiming(y, timing)
  }, [ghostX, ghostY, reduceMotion])

  const moveGhostToCell = useCallback((column: number, row: number) => {
    "worklet"
    const floor = dragFloor.value
    if (!floor) return
    const target = getRoomEditorDragCellWindowPoint({
      floor,
      column,
      row,
      stage: dragStage.value,
      drawOffsetX: dragDrawOffsetX.value,
      drawOffsetY: dragDrawOffsetY.value
    })
    moveGhostToWindowPoint(target.x, target.y)
  }, [dragDrawOffsetX, dragDrawOffsetY, dragFloor, dragStage, moveGhostToWindowPoint])

  // JS fitted the footprint onto the floor at another cell than the one under
  // the finger: move the ghost there too, unless the finger has moved on.
  const placeGhostAtFittedPoint = useCallback((
    session: number,
    column: number,
    row: number,
    x: number,
    y: number
  ) => {
    "worklet"
    if (session !== dragSession.value || column !== lastColumn.value || row !== lastRow.value) return
    const stage = dragStage.value
    moveGhostToWindowPoint(stage.x + x * stage.width, stage.y + y * stage.height)
  }, [dragSession, dragStage, lastColumn, lastRow, moveGhostToWindowPoint])

  const springGhostBack = useCallback((session: number) => {
    "worklet"
    if (reduceMotion) {
      ghostX.value = ghostOriginX.value
      ghostY.value = ghostOriginY.value
      ghostScale.value = 1
      ghostLift.value = 0
      ghostOpacity.value = 0
      scheduleOnRN(clearGhost, session)
      return
    }
    ghostScale.value = animateTo(1, snappy)
    ghostLift.value = animateTo(0, snappy)
    ghostY.value = animateTo(ghostOriginY.value, snappy)
    ghostX.value = animateTo(ghostOriginX.value, snappy, (finished) => {
      "worklet"
      // A newer drag cancels this return; only a finished return hides.
      if (!finished) return
      ghostOpacity.value = 0
      scheduleOnRN(clearGhost, session)
    })
  }, [clearGhost, ghostLift, ghostOpacity, ghostOriginX, ghostOriginY, ghostScale, ghostX, ghostY, reduceMotion, snappy])

  // A valid drop. The placed piece already draws itself at its committed spot
  // and depth (the hold was released in the commit's render), so the overlay
  // only retreats: it sets down onto that piece while it fades, on a fixed
  // timing, and unmounts when the fade ends. Never on a spring's completion,
  // which would leave the overlay above avatars and furniture for ~1.5x the
  // visible motion (ENGINEERING_RULES motion rule 9).
  const settleGhost = useCallback((session: number, itemX: number, itemY: number) => {
    "worklet"
    const stage = dragStage.value
    const x = stage.x + itemX * stage.width
    const y = stage.y + itemY * stage.height
    if (reduceMotion) {
      ghostX.value = x
      ghostY.value = y
      ghostScale.value = 1
      ghostLift.value = 0
    } else {
      ghostX.value = animateTo(x, fadeOut)
      ghostY.value = animateTo(y, fadeOut)
      ghostScale.value = animateTo(1, fadeOut)
      ghostLift.value = animateTo(0, fadeOut)
    }
    ghostOpacity.value = animateTo(0, fadeOut, (finished) => {
      "worklet"
      // A newer drag cancels this fade and owns the overlay.
      if (finished) scheduleOnRN(clearGhost, session)
    })
  }, [clearGhost, dragStage, fadeOut, ghostLift, ghostOpacity, ghostScale, ghostX, ghostY, reduceMotion])

  // 2.5D room: the drop lands with a settle. The room keeps the
  // piece hidden while the held drawing falls the last points onto its cell,
  // squashes a little and springs back (authored, ~220 ms, transform only).
  // The fixed timeline, not a spring's rest, then gives the piece back to the
  // room (motion rule 9); the overlay stays opaque over it until the room says
  // its image is on screen (or a short cap passes), then fades. Fading at once
  // showed the floor through the piece for a few frames while it remounted.
  const handOffRef = useRef<{ session: number; drawnKey: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const fadeGhostAfterHandOff = useCallback((session: number) => {
    "worklet"
    if (session !== dragSession.value) return
    ghostOpacity.value = animateToAfter(ROOM_EDITOR_SETTLE_HANDOFF_MS, 0, fadeOut, (faded) => {
      "worklet"
      if (faded) scheduleOnRN(clearGhost, session)
    })
  }, [clearGhost, dragSession, fadeOut, ghostOpacity])
  const finishHandOff = useCallback((session: number) => {
    const handOff = handOffRef.current
    if (!handOff || handOff.session !== session) return
    clearTimeout(handOff.timer)
    handOffRef.current = null
    scheduleOnUI(fadeGhostAfterHandOff, session)
  }, [fadeGhostAfterHandOff])
  const releaseHold = useCallback((session: number, renderId: string) => {
    if (handOffRef.current) clearTimeout(handOffRef.current.timer)
    handOffRef.current = {
      session,
      drawnKey: getRoomSceneItemKey({ kind: "furniture", renderId }),
      timer: setTimeout(() => finishHandOff(session), ROOM_EDITOR_SETTLE_HANDOFF_CAP_MS)
    }
    setGhost((current) => current?.session === session ? { ...current, renderId: undefined } : current)
  }, [finishHandOff])
  // The room drew an item: if it is the piece just handed back, fade the overlay.
  const handleItemDrawn = useCallback((key: string) => {
    const handOff = handOffRef.current
    if (handOff && handOff.drawnKey === key) finishHandOff(handOff.session)
  }, [finishHandOff])
  useEffect(() => () => {
    if (handOffRef.current) clearTimeout(handOffRef.current.timer)
  }, [])
  const settleGhostWithSquash = useCallback((session: number, itemX: number, itemY: number, renderId: string) => {
    "worklet"
    const stage = dragStage.value
    ghostX.value = animateSegment(stage.x + itemX * stage.width, ROOM_EDITOR_SETTLE_FALL)
    ghostY.value = animateSegment(stage.y + itemY * stage.height, ROOM_EDITOR_SETTLE_FALL)
    ghostScale.value = animateSegment(1, ROOM_EDITOR_SETTLE_FALL)
    ghostLift.value = animateSegment(0, ROOM_EDITOR_SETTLE_FALL)
    ghostSquash.value = animateSequence(
      animateSegment(0, ROOM_EDITOR_SETTLE_FALL),
      animateSegment(1, ROOM_EDITOR_SETTLE_SQUASH),
      animateSegment(ROOM_EDITOR_SETTLE_REBOUND_SHARE, ROOM_EDITOR_SETTLE_REBOUND),
      animateSegment(0, ROOM_EDITOR_SETTLE_REST, (finished) => {
        "worklet"
        // A newer drag cancelled the settle and owns the overlay (its lift
        // replaced this ghost, so the room already draws the piece again).
        if (finished) scheduleOnRN(releaseHold, session, renderId)
      })
    )
  }, [dragStage, ghostLift, ghostScale, ghostSquash, ghostX, ghostY, releaseHold])

  const hideGhost = useCallback((session: number) => {
    ghostOpacity.value = 0
    ghostScale.value = 1
    ghostLift.value = 0
    ghostSquash.value = 0
    clearGhost(session)
  }, [clearGhost, ghostLift, ghostOpacity, ghostScale, ghostSquash])

  // Drag callbacks reach JS through scheduleOnRN; they read the latest render
  // through this ref so the gestures (and every tray card) keep one identity.
  const handlers = {
    computePreview(drag: ActiveDrag, column: number, row: number): PlacementPreview | undefined {
      if (drag.source === "stage") {
        return createRoomEditorStageDragPreview({
          copy: input.copy,
          scene,
          renderId: drag.renderId,
          floor: drag.floor,
          column,
          row
        })
      }
      return createRoomEditorTrayDragPreview({
        copy: input.copy,
        scene,
        // The UI thread measured the stage when this drag started.
        stageWindowBounds: dragStage.value.width > 0 ? dragStage.value : stageWindowBounds,
        item: drag.item,
        instanceId: drag.instanceId,
        rotation: drag.rotation,
        floor: drag.floor,
        column,
        row
      })
    },
    beginStageDrag(session: number, renderId: string, column: number, row: number) {
      const item = scene.renderItems.find((entry) => entry.renderId === renderId)
      if (!item || item.kind !== "furniture") {
        hideGhost(session)
        return
      }
      const placedItem = input.placedItems.find((entry) => entry.instanceId === renderId)
      const floor = getRoomEditorDragFloorGrid(item, scene.shell)
      activeDragRef.current = {
        session,
        source: "stage",
        renderId,
        floor,
        wallMagnet: item.wallPlacement !== undefined,
        startColumn: column,
        startRow: row
      }
      hapticMedium()
      input.selection.setPlacementFeedback(undefined)
      input.selection.setPlacementPreview(undefined)
      input.selection.setSelectedInstanceId(renderId)
      input.inventory.setSelectedInventoryItemId(placedItem?.itemId)
      input.inventory.setSelectedInventoryRotation(item.rotation)
      setGhost({
        session,
        renderId,
        source: item.asset.source,
        mirrored: item.usesMirroredRotation,
        frame: getRoomEditorDragGhostFrame(item, roomLayout),
        shadowSpot: getRoomEditorDragShadowSpot(item, roomLayout),
        hangsOnWall: item.wallPlacement !== undefined,
        ...(isRoomEditorFloorLayerPiece(item) ? { floorLayer: true } : {})
      })
    },
    beginTrayDrag(
      session: number,
      itemId: string,
      rotation: PlacedRoomItem["rotation"],
      column: number,
      row: number
    ) {
      const item = ACTIVE_ROOM_FURNITURE_CATALOG.find((entry) => entry.id === itemId)
      if (!item || !input.canPlaceAnotherRoomItem(itemId)) {
        hapticError()
        input.selection.setPlacementFeedback(input.copy.feedback.alreadyPlaced)
        hideGhost(session)
        return
      }
      // Keep the JS copy of the stage position fresh for taps too.
      input.stage.measureStageWindow()
      const instanceId = `${item.id}_${Date.now()}`
      const floor = getRoomEditorDragFloorGrid(item, scene.shell)
      activeDragRef.current = {
        session,
        source: "tray",
        item,
        instanceId,
        rotation,
        floor,
        wallMagnet: getRoomEditorTrayUsesWallMagnet(item, rotation),
        startColumn: column,
        startRow: row
      }
      const renderItem = resolvePlacedFurnitureRenderItem({ instanceId, itemId, x: 0.5, y: 0.5, rotation }, item)
      const stage = dragStage.value.width > 0 ? dragStage.value : stageWindowBounds ?? roomLayout
      hapticMedium()
      input.selection.setSelectedInstanceId(instanceId)
      input.inventory.setSelectedInventoryItemId(itemId)
      input.inventory.setSelectedInventoryRotation(rotation)
      input.selection.updatePlacementPreview(undefined)
      input.selection.updatePlacementFeedback(getRoomPlacementSurfaceDropFeedback(item, input.copy))
      if (renderItem) {
        setGhost({
          session,
          renderId: instanceId,
          source: renderItem.asset.source,
          mirrored: renderItem.usesMirroredRotation,
          frame: getRoomEditorDragGhostFrame(renderItem, stage),
          shadowSpot: getRoomEditorDragShadowSpot(renderItem, stage),
          hangsOnWall: renderItem.wallPlacement !== undefined,
          ...(isRoomEditorFloorLayerPiece(renderItem) ? { floorLayer: true } : {})
        })
      }
    },
    moveDrag(session: number, column: number, row: number) {
      const drag = activeDragRef.current
      if (!drag || drag.session !== session) return
      const preview = handlers.computePreview(drag, column, row)
      const cellHaptic = getRoomEditorDragCellHaptic(lastDragPreviewRef.current, preview, drag.wallMagnet)
      if (cellHaptic === "selection") hapticSelection()
      else if (cellHaptic === "rigid") hapticRigid()
      lastDragPreviewRef.current = preview
      // A floor piece on its fitted cell, a wall piece on its wall spot: the held drawing goes there.
      if ((drag.floor || drag.wallMagnet) && preview) {
        const drawPoint = getRoomEditorDrawPoint(preview.item)
        scheduleOnUI(placeGhostAtFittedPoint, session, column, row, drawPoint.x, drawPoint.y)
      }
      input.selection.updatePlacementPreview(preview)
      input.selection.updatePlacementFeedback(
        drag.source === "tray" && column === ROOM_EDITOR_DRAG_OUTSIDE_CELL
          ? getRoomPlacementSurfaceDropFeedback(drag.item, input.copy)
          : getRoomEditorDragFeedback(preview, input.copy)
      )
    },
    releaseDrag(session: number, column: number, row: number) {
      const drag = activeDragRef.current
      if (!drag || drag.session !== session) return
      activeDragRef.current = null
      const moved = column !== drag.startColumn || row !== drag.startRow
      const inside = column !== ROOM_EDITOR_DRAG_OUTSIDE_CELL
      const preview = moved || drag.source === "tray"
        ? handlers.computePreview(drag, column, row)
        : undefined
      const release = resolveRoomEditorDragRelease({ source: drag.source, moved, inside, preview })
      lastDragPreviewRef.current = undefined
      if (release === "commit" && preview) {
        if (!input.commitTrayPlacementPreview(preview)) {
          scheduleOnUI(springGhostBack, session)
          return
        }
        const drawPoint = getRoomEditorDrawPoint(preview.item)
        if (preview.item.kind === "furniture" && isRoomEditorFloorLayerPiece(preview.item)) {
          // A rug was already drawn by the room on its floor layer all through the drag: nothing falls or fades over it.
          hideGhost(session)
          input.onPlaced?.(preview.item)
          return
        }
        if (ROOM_EDITOR_PLACE_JUICE && !reduceMotion && preview.item.kind === "furniture") {
          scheduleOnUI(settleGhostWithSquash, session, drawPoint.x, drawPoint.y, preview.item.renderId)
          input.onPlaced?.(preview.item)
          return
        }
        // Batched with the commit: the placed piece reappears at its new spot
        // and depth in the same render, while the overlay fades above it.
        setGhost((current) => current?.session === session ? { ...current, renderId: undefined } : current)
        scheduleOnUI(settleGhost, session, drawPoint.x, drawPoint.y)
        return
      }
      input.selection.updatePlacementPreview(undefined)
      if (drag.source === "tray") input.selection.setSelectedInstanceId(undefined)
      if (release === "reject") {
        hapticError()
        input.selection.updatePlacementFeedback(preview?.feedback ?? input.copy.feedback.chooseCompatibleSurface)
        scheduleOnUI(springGhostBack, session)
        return
      }
      input.selection.updatePlacementFeedback(undefined)
      if (drag.source === "tray") {
        scheduleOnUI(springGhostBack, session)
      } else {
        hideGhost(session)
      }
    },
    cancelDrag(session: number) {
      const drag = activeDragRef.current
      if (!drag || drag.session !== session) return
      activeDragRef.current = null
      input.selection.updatePlacementPreview(undefined)
      input.selection.updatePlacementFeedback(undefined)
      if (drag.source === "tray") input.selection.setSelectedInstanceId(undefined)
      hideGhost(session)
    }
  }
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const beginStageDrag = useCallback((session: number, renderId: string, column: number, row: number) => {
    handlersRef.current.beginStageDrag(session, renderId, column, row)
  }, [])
  const beginTrayDrag = useCallback((
    session: number,
    itemId: string,
    rotation: PlacedRoomItem["rotation"],
    column: number,
    row: number
  ) => {
    handlersRef.current.beginTrayDrag(session, itemId, rotation, column, row)
  }, [])
  const moveDrag = useCallback((session: number, column: number, row: number) => {
    handlersRef.current.moveDrag(session, column, row)
  }, [])
  const releaseDrag = useCallback((session: number, column: number, row: number) => {
    handlersRef.current.releaseDrag(session, column, row)
  }, [])
  const cancelDrag = useCallback((session: number) => {
    handlersRef.current.cancelDrag(session)
  }, [])

  // Restores the piece and hides the ghost for whatever drag is active. Later
  // frames of that gesture carry its old session and are ignored.
  const cancelActiveDrag = useCallback(() => {
    const drag = activeDragRef.current
    if (drag) cancelDrag(drag.session)
  }, [cancelDrag])

  // Backgrounding mid-drag restores the piece even if the touch is never
  // cancelled back to the gesture.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancelActiveDrag()
    })
    return () => subscription.remove()
  }, [cancelActiveDrag])

  const stageDragGesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS)
    .shouldCancelWhenOutside(false)
    .maxPointers(1)
    .onTouchesDown((event, stateManager) => {
      "worklet"
      if (event.numberOfTouches > 1) return
      const touch = event.changedTouches[0]
      const size = stageSize.value
      if (!touch || size.width <= 0 || size.height <= 0) {
        stateManager.fail()
        return
      }
      const measured = measure(stageAnimatedRef)
      if (!measured || measured.width <= 0 || measured.height <= 0) {
        stateManager.fail()
        return
      }
      const x = (touch.absoluteX - measured.pageX) / measured.width
      const y = (touch.absoluteY - measured.pageY) / measured.height
      const rects = hitRects.value
      const index = findRoomEditorDragHitRect(rects, x, y)
      if (index < 0) {
        stateManager.fail()
        return
      }
      grabRenderId.value = rects[index].renderId
      grabOffsetX.value = x - rects[index].anchorX
      grabOffsetY.value = y - rects[index].anchorY
      liftDrawOffsetX.value = rects[index].drawOffsetX
      liftDrawOffsetY.value = rects[index].drawOffsetY
      dragDrawOffsetX.value = rects[index].usesFloorGrid ? rects[index].cellDrawOffsetX : rects[index].drawOffsetX
      dragDrawOffsetY.value = rects[index].usesFloorGrid ? rects[index].cellDrawOffsetY : rects[index].drawOffsetY
      dragFloor.value = rects[index].usesFloorGrid ? sceneFloor.value : null
      dragWallMagnet.value = rects[index].usesWallMagnet
    })
    .onStart((event) => {
      "worklet"
      const session = dragSession.value + 1
      dragSession.value = session
      // Child-relative event.x/y are unreliable when a furniture Pressable
      // owns the touch. Both the preview and overlay use the measured room.
      const measured = measure(stageAnimatedRef)
      dragStage.value = measured && measured.width > 0
        ? { x: measured.pageX, y: measured.pageY, width: measured.width, height: measured.height }
        : stageBounds.value
      const bounds = dragStage.value
      const cell = getRoomEditorDragCell(getRoomEditorStageDragPoint({
        localX: event.absoluteX - bounds.x,
        localY: event.absoluteY - bounds.y,
        stageWidth: bounds.width,
        stageHeight: bounds.height,
        grabOffsetX: grabOffsetX.value,
        grabOffsetY: grabOffsetY.value
      }), dragFloor.value)
      lastColumn.value = cell.column
      lastRow.value = cell.row
      liftGhost(
        event.absoluteX + (liftDrawOffsetX.value - grabOffsetX.value) * bounds.width,
        event.absoluteY + (liftDrawOffsetY.value - grabOffsetY.value) * bounds.height
      )
      scheduleOnRN(beginStageDrag, session, grabRenderId.value, cell.column, cell.row)
    })
    .onUpdate((event) => {
      "worklet"
      const size = dragStage.value
      const floor = dragFloor.value
      // Plain-grid pieces follow the finger; floor pieces sit on their cell, wall-magnet pieces on their spot.
      if (!floor && !dragWallMagnet.value) {
        ghostX.value = event.absoluteX + (dragDrawOffsetX.value - grabOffsetX.value) * size.width
        ghostY.value = event.absoluteY + (dragDrawOffsetY.value - grabOffsetY.value) * size.height
      }
      const cell = getRoomEditorDragCell(getRoomEditorStageDragPoint({
        localX: event.absoluteX - size.x,
        localY: event.absoluteY - size.y,
        stageWidth: size.width,
        stageHeight: size.height,
        grabOffsetX: grabOffsetX.value,
        grabOffsetY: grabOffsetY.value
      }), floor)
      if (hasRoomEditorDragCellChanged(lastColumn.value, lastRow.value, cell.column, cell.row)) {
        lastColumn.value = cell.column
        lastRow.value = cell.row
        if (floor) moveGhostToCell(cell.column, cell.row)
        scheduleOnRN(moveDrag, dragSession.value, cell.column, cell.row)
      }
    })
    .onEnd((_event, success) => {
      "worklet"
      if (!success) {
        scheduleOnRN(cancelDrag, dragSession.value)
        return
      }
      scheduleOnRN(releaseDrag, dragSession.value, lastColumn.value, lastRow.value)
    }), [
    beginStageDrag,
    cancelDrag,
    dragDrawOffsetX,
    dragDrawOffsetY,
    dragFloor,
    dragSession,
    dragStage,
    dragWallMagnet,
    ghostX,
    ghostY,
    grabOffsetX,
    liftDrawOffsetX,
    liftDrawOffsetY,
    grabOffsetY,
    grabRenderId,
    hitRects,
    lastColumn,
    lastRow,
    liftGhost,
    moveDrag,
    moveGhostToCell,
    releaseDrag,
    sceneFloor,
    stageAnimatedRef,
    stageBounds,
    stageSize
  ])

  const createTrayDragGesture = useCallback((
    item: FurnitureItem,
    owned: boolean,
    placed: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => {
    const itemId = item.id
    const trayFloor = getRoomEditorDragFloorGrid(item, scene.shell)
    const trayWallMagnet = getRoomEditorTrayUsesWallMagnet(item, rotation)
    // Only the calibrated room draws pieces away from their anchor.
    const trayDrawOffset = ROOM_EDITOR_PLACE_JUICE
      ? getRoomEditorTrayDrawOffset(item, rotation, scene.shell)
      : { x: 0, y: 0 }
    const trayDrawOffsetX = trayDrawOffset.x
    const trayDrawOffsetY = trayDrawOffset.y
    const lift = ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT
    return Gesture.Pan()
      .enabled(owned && !placed)
      .activateAfterLongPress(ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS)
      .shouldCancelWhenOutside(false)
      .maxPointers(1)
      .onStart((event) => {
        "worklet"
        const session = dragSession.value + 1
        dragSession.value = session
        // Measure where the stage is now (scroll, dock height), on this thread.
        const measured = measure(stageAnimatedRef)
        dragStage.value = measured && measured.width > 0
          ? { x: measured.pageX, y: measured.pageY, width: measured.width, height: measured.height }
          : stageBounds.value
        dragFloor.value = trayFloor
        dragDrawOffsetX.value = trayDrawOffsetX
        dragDrawOffsetY.value = trayDrawOffsetY
        const point = getRoomEditorTrayDragPoint({
          absoluteX: event.absoluteX,
          absoluteY: event.absoluteY,
          lift,
          bounds: dragStage.value
        })
        const cell = getRoomEditorDragCell(point, trayFloor)
        lastColumn.value = cell.column
        lastRow.value = cell.row
        const bounds = dragStage.value
        liftGhost(
          event.absoluteX + trayDrawOffsetX * bounds.width,
          event.absoluteY - lift + trayDrawOffsetY * bounds.height
        )
        if (trayFloor && point.inside) moveGhostToCell(cell.column, cell.row)
        scheduleOnRN(beginTrayDrag, session, itemId, rotation, cell.column, cell.row)
      })
      .onUpdate((event) => {
        "worklet"
        const point = getRoomEditorTrayDragPoint({
          absoluteX: event.absoluteX,
          absoluteY: event.absoluteY,
          lift,
          bounds: dragStage.value
        })
        // Over the floor a floor piece sits on its cell; elsewhere it is held
        // just above the fingertip.
        const snapsToFloor = trayFloor !== null && point.inside
        // Over the room a wall-magnet piece sits on its wall spot (JS moves it there).
        const holdsOnWall = trayWallMagnet && point.inside
        if (!snapsToFloor && !holdsOnWall) {
          const bounds = dragStage.value
          ghostX.value = event.absoluteX + trayDrawOffsetX * bounds.width
          ghostY.value = event.absoluteY - lift + trayDrawOffsetY * bounds.height
        }
        const cell = getRoomEditorDragCell(point, trayFloor)
        if (hasRoomEditorDragCellChanged(lastColumn.value, lastRow.value, cell.column, cell.row)) {
          lastColumn.value = cell.column
          lastRow.value = cell.row
          if (snapsToFloor) moveGhostToCell(cell.column, cell.row)
          scheduleOnRN(moveDrag, dragSession.value, cell.column, cell.row)
        }
      })
      .onEnd((_event, success) => {
        "worklet"
        if (!success) {
          scheduleOnRN(cancelDrag, dragSession.value)
          return
        }
        scheduleOnRN(releaseDrag, dragSession.value, lastColumn.value, lastRow.value)
      })
  }, [
    beginTrayDrag,
    cancelDrag,
    dragDrawOffsetX,
    dragDrawOffsetY,
    dragFloor,
    dragSession,
    dragStage,
    ghostX,
    ghostY,
    lastColumn,
    lastRow,
    liftGhost,
    moveDrag,
    moveGhostToCell,
    releaseDrag,
    scene.shell,
    stageAnimatedRef,
    stageBounds
  ])

  const ghostValues = useMemo<RoomEditorDragGhostValues>(() => ({
    x: ghostX,
    y: ghostY,
    scale: ghostScale,
    opacity: ghostOpacity,
    lift: ghostLift,
    squash: ghostSquash,
    overlayOrigin
  }), [ghostLift, ghostOpacity, ghostScale, ghostSquash, ghostX, ghostY, overlayOrigin])

  return {
    stageAnimatedRef,
    stageDragGesture,
    createTrayDragGesture,
    cancelActiveDrag,
    handleItemDrawn,
    ghost,
    ghostValues
  }
}

export type RoomEditorDragGestures = ReturnType<typeof useRoomEditorDragGestures>
