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
  withDelay,
  withSequence,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"
import { hapticError, hapticMedium, hapticRigid, hapticSelection } from "../../../ui/haptics"
import { animateTo, useMotion } from "../../../ui/motion"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomV2FloorGridProjection } from "../roomV2FloorGrid"
import { resolvePlacedFurnitureRenderItem } from "../roomV2Selectors"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  UserRoomDecor
} from "../roomV2.types"
import { ACTIVE_ROOM_FURNITURE_CATALOG } from "./roomEditorCatalog"
import {
  ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS,
  ROOM_EDITOR_DRAG_GHOST_OPACITY,
  ROOM_EDITOR_DRAG_SETTLE_FADE_MS,
  getRoomEditorDragCellHaptic,
  ROOM_EDITOR_DRAG_DROP_SQUASH_SCALE,
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
  getRoomEditorStageDragPoint,
  getRoomEditorTrayDragPoint,
  hasRoomEditorDragCellChanged,
  resolveRoomEditorDragRelease,
  type RoomEditorDragGhostFrame,
  type RoomEditorDragHitRect
} from "./roomEditorDragModel"
import { getRoomEditorDragGhostPlate, type RoomEditorFloorShape } from "./roomEditorFloorGridModel"
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
  source: FurnitureItem["asset"]["source"]
  mirrored: boolean
  frame: RoomEditorDragGhostFrame
  /** Floor-grid drags: the footprint plate tinted by `tone`. */
  plate?: RoomEditorFloorShape
}

/** Ghost anchor in window coordinates plus the overlay's window origin. */
export interface RoomEditorDragGhostValues {
  x: SharedValue<number>
  y: SharedValue<number>
  scale: SharedValue<number>
  opacity: SharedValue<number>
  /** 0 resting, 1 held up off the room (raises the piece over its shadow). */
  lift?: SharedValue<number>
  overlayOrigin: SharedValue<{ x: number; y: number }>
  /** 0 no verdict yet (or off the stage), 1 valid spot, 2 invalid spot. Editor drags only. */
  tone?: SharedValue<number>
}

/** Ghost tone values (a shared value, so the plate recolours without a render). */
export const ROOM_EDITOR_GHOST_TONE = { none: 0, valid: 1, invalid: 2 } as const

type ActiveDrag =
  | {
    session: number
    source: "stage"
    renderId: string
    floor: RoomV2FloorGridProjection | null
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
    startColumn: number
    startRow: number
  }

/** Drop: the piece comes down and squashes over this long before it settles. */
const ROOM_EDITOR_DRAG_DROP_MS = 80
/** The settled ghost stays over the placed piece this long, then fades. */
const ROOM_EDITOR_DRAG_SETTLE_HOLD_MS = 140

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
  const ghostTone = useSharedValue<number>(ROOM_EDITOR_GHOST_TONE.none)
  const ghostLift = useSharedValue(0)
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

  const { snappy } = motion
  const liftGhost = useCallback((anchorX: number, anchorY: number) => {
    "worklet"
    cancelAnimation(ghostX)
    cancelAnimation(ghostY)
    cancelAnimation(ghostScale)
    cancelAnimation(ghostOpacity)
    cancelAnimation(ghostLift)
    ghostX.value = anchorX
    ghostY.value = anchorY
    ghostOriginX.value = anchorX
    ghostOriginY.value = anchorY
    // Lift: the piece grows a touch and rises over its shadow (snappy).
    // Reduce Motion keeps its size; the shadow still shows it is held.
    ghostScale.value = reduceMotion ? 1 : animateTo(ROOM_EDITOR_DRAG_LIFT_SCALE, snappy)
    ghostLift.value = animateTo(1, snappy)
    ghostOpacity.value = ROOM_EDITOR_DRAG_GHOST_OPACITY
    ghostTone.value = ROOM_EDITOR_GHOST_TONE.none
  }, [ghostLift, ghostOpacity, ghostOriginX, ghostOriginY, ghostScale, ghostTone, ghostX, ghostY, reduceMotion, snappy])

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
    const target = getRoomEditorDragCellWindowPoint({ floor, column, row, stage: dragStage.value })
    moveGhostToWindowPoint(target.x, target.y)
  }, [dragFloor, dragStage, moveGhostToWindowPoint])

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

  // A valid drop: the piece is already placed under the ghost, so the ghost
  // settles from its lift scale and fades into it (ROOM-10).
  const settleGhost = useCallback((session: number) => {
    "worklet"
    if (reduceMotion) {
      ghostOpacity.value = 0
      ghostScale.value = 1
      ghostLift.value = 0
      scheduleOnRN(clearGhost, session)
      return
    }
    // Drop: down onto the floor, a small squash, then settle (snappy).
    ghostLift.value = withTiming(0, { duration: ROOM_EDITOR_DRAG_DROP_MS, reduceMotion: ReduceMotion.Never })
    ghostScale.value = withSequence(
      withTiming(ROOM_EDITOR_DRAG_DROP_SQUASH_SCALE, { duration: ROOM_EDITOR_DRAG_DROP_MS, reduceMotion: ReduceMotion.Never }),
      animateTo(1, snappy)
    )
    ghostOpacity.value = withDelay(
      ROOM_EDITOR_DRAG_SETTLE_HOLD_MS,
      withTiming(0, { duration: ROOM_EDITOR_DRAG_SETTLE_FADE_MS, reduceMotion: ReduceMotion.Never }, (finished) => {
        "worklet"
        if (finished) scheduleOnRN(clearGhost, session)
      }),
      ReduceMotion.Never
    )
  }, [clearGhost, ghostLift, ghostOpacity, ghostScale, reduceMotion, snappy])

  const hideGhost = useCallback((session: number) => {
    ghostOpacity.value = 0
    ghostScale.value = 1
    ghostLift.value = 0
    ghostTone.value = ROOM_EDITOR_GHOST_TONE.none
    clearGhost(session)
  }, [clearGhost, ghostLift, ghostOpacity, ghostScale, ghostTone])

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
      activeDragRef.current = { session, source: "stage", renderId, floor, startColumn: column, startRow: row }
      hapticMedium()
      input.selection.setPlacementFeedback(undefined)
      input.selection.setPlacementPreview(undefined)
      input.selection.setSelectedInstanceId(renderId)
      input.inventory.setSelectedInventoryItemId(placedItem?.itemId)
      input.inventory.setSelectedInventoryRotation(item.rotation)
      setGhost({
        session,
        source: item.asset.source,
        mirrored: item.usesMirroredRotation,
        frame: getRoomEditorDragGhostFrame(item, roomLayout),
        plate: floor ? getRoomEditorDragGhostPlate(item, roomLayout) : undefined
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
      activeDragRef.current = { session, source: "tray", item, instanceId, rotation, floor, startColumn: column, startRow: row }
      const renderItem = resolvePlacedFurnitureRenderItem({ instanceId, itemId, x: 0.5, y: 0.5, rotation }, item)
      const stage = dragStage.value.width > 0 ? dragStage.value : stageWindowBounds ?? roomLayout
      hapticMedium()
      input.selection.setSelectedInstanceId(instanceId)
      input.selection.updatePlacementPreview(undefined)
      input.selection.updatePlacementFeedback(getRoomPlacementSurfaceDropFeedback(item, input.copy))
      if (renderItem) {
        setGhost({
          session,
          source: renderItem.asset.source,
          mirrored: renderItem.usesMirroredRotation,
          frame: getRoomEditorDragGhostFrame(renderItem, stage),
          plate: floor ? getRoomEditorDragGhostPlate(renderItem, stage) : undefined
        })
      }
    },
    moveDrag(session: number, column: number, row: number) {
      const drag = activeDragRef.current
      if (!drag || drag.session !== session) return
      const preview = handlers.computePreview(drag, column, row)
      const cellHaptic = getRoomEditorDragCellHaptic(lastDragPreviewRef.current, preview)
      if (cellHaptic === "selection") hapticSelection()
      else if (cellHaptic === "rigid") hapticRigid()
      lastDragPreviewRef.current = preview
      ghostTone.value = !preview
        ? ROOM_EDITOR_GHOST_TONE.none
        : preview.isValid ? ROOM_EDITOR_GHOST_TONE.valid : ROOM_EDITOR_GHOST_TONE.invalid
      if (drag.floor && preview) {
        scheduleOnUI(placeGhostAtFittedPoint, session, column, row, preview.item.x, preview.item.y)
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
        input.commitTrayPlacementPreview(preview)
        scheduleOnUI(settleGhost, session)
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
      const x = touch.x / size.width
      const y = touch.y / size.height
      const rects = hitRects.value
      const index = findRoomEditorDragHitRect(rects, x, y)
      if (index < 0) {
        stateManager.fail()
        return
      }
      grabRenderId.value = rects[index].renderId
      grabOffsetX.value = x - rects[index].anchorX
      grabOffsetY.value = y - rects[index].anchorY
      dragFloor.value = rects[index].usesFloorGrid ? sceneFloor.value : null
    })
    .onStart((event) => {
      "worklet"
      const session = dragSession.value + 1
      dragSession.value = session
      const size = stageSize.value
      // The pan's own view is the stage, so its window origin is exact.
      dragStage.value = {
        x: event.absoluteX - event.x,
        y: event.absoluteY - event.y,
        width: size.width,
        height: size.height
      }
      const cell = getRoomEditorDragCell(getRoomEditorStageDragPoint({
        localX: event.x,
        localY: event.y,
        stageWidth: size.width,
        stageHeight: size.height,
        grabOffsetX: grabOffsetX.value,
        grabOffsetY: grabOffsetY.value
      }), dragFloor.value)
      lastColumn.value = cell.column
      lastRow.value = cell.row
      liftGhost(
        event.absoluteX - grabOffsetX.value * size.width,
        event.absoluteY - grabOffsetY.value * size.height
      )
      scheduleOnRN(beginStageDrag, session, grabRenderId.value, cell.column, cell.row)
    })
    .onUpdate((event) => {
      "worklet"
      const size = stageSize.value
      const floor = dragFloor.value
      // Plain-grid pieces follow the finger; floor pieces sit on their cell.
      if (!floor) {
        ghostX.value = event.absoluteX - grabOffsetX.value * size.width
        ghostY.value = event.absoluteY - grabOffsetY.value * size.height
      }
      const cell = getRoomEditorDragCell(getRoomEditorStageDragPoint({
        localX: event.x,
        localY: event.y,
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
    dragFloor,
    dragSession,
    dragStage,
    ghostX,
    ghostY,
    grabOffsetX,
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
        const point = getRoomEditorTrayDragPoint({
          absoluteX: event.absoluteX,
          absoluteY: event.absoluteY,
          lift,
          bounds: dragStage.value
        })
        const cell = getRoomEditorDragCell(point, trayFloor)
        lastColumn.value = cell.column
        lastRow.value = cell.row
        liftGhost(event.absoluteX, event.absoluteY - lift)
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
        if (!snapsToFloor) {
          ghostX.value = event.absoluteX
          ghostY.value = event.absoluteY - lift
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
    overlayOrigin,
    tone: ghostTone
  }), [ghostLift, ghostOpacity, ghostScale, ghostTone, ghostX, ghostY, overlayOrigin])

  return {
    stageAnimatedRef,
    stageDragGesture,
    createTrayDragGesture,
    cancelActiveDrag,
    ghost,
    ghostValues
  }
}

export type RoomEditorDragGestures = ReturnType<typeof useRoomEditorDragGestures>
