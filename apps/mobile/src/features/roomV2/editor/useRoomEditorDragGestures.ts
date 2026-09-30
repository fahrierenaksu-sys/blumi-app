import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState } from "react-native"
import { Gesture } from "react-native-gesture-handler"
import {
  cancelAnimation,
  ReduceMotion,
  useSharedValue,
  withSpring,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"
import { useReducedMotion } from "../../../ui/animations"
import { hapticError, hapticLight } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
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
  ROOM_EDITOR_DRAG_LIFT_SCALE,
  ROOM_EDITOR_DRAG_OUTSIDE_CELL,
  ROOM_EDITOR_DRAG_RETURN_SPRING,
  createRoomEditorDragHitRects,
  createRoomEditorStageDragPreview,
  createRoomEditorTrayDragPreview,
  findRoomEditorDragHitRect,
  getRoomEditorDragCell,
  getRoomEditorDragFeedback,
  getRoomEditorDragGhostFrame,
  getRoomEditorStageDragPoint,
  getRoomEditorTrayDragPoint,
  hasRoomEditorDragCellChanged,
  resolveRoomEditorDragRelease,
  type RoomEditorDragGhostFrame,
  type RoomEditorDragHitRect
} from "./roomEditorDragModel"
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
}

/** Ghost anchor in window coordinates plus the overlay's window origin. */
export interface RoomEditorDragGhostValues {
  x: SharedValue<number>
  y: SharedValue<number>
  scale: SharedValue<number>
  opacity: SharedValue<number>
  overlayOrigin: SharedValue<{ x: number; y: number }>
}

type ActiveDrag =
  | {
    session: number
    source: "stage"
    renderId: string
    startColumn: number
    startRow: number
  }
  | {
    session: number
    source: "tray"
    item: FurnitureItem
    instanceId: string
    rotation: PlacedRoomItem["rotation"]
    startColumn: number
    startRow: number
  }

const EMPTY_STAGE_BOUNDS: StageWindowBounds = { x: 0, y: 0, width: 0, height: 0 }

/**
 * Drag-to-move for the editor, on Gesture Handler pans. A touch-and-hold
 * (ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS) on a placed piece, or on an owned
 * tray card, lifts a ghost that follows the finger on the UI thread. JS hears
 * only when the snapped cell changes (to show validity with the tap placement
 * rules) and on release, which commits through `commitTrayPlacementPreview`,
 * the confirm control's path. Invalid drops spring back; interrupted gestures
 * and backgrounding restore the piece. Taps stay on the Pressables: the pan
 * fails when the finger moves before the hold ends or, on the stage, when the
 * touch starts off a piece, so page scroll and iOS edge back keep the touch.
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
  const reduceMotion = useReducedMotion()
  const [ghost, setGhost] = useState<RoomEditorDragGhostContent | undefined>()
  const activeDragRef = useRef<ActiveDrag | null>(null)

  const hitRects = useSharedValue<RoomEditorDragHitRect[]>([])
  const stageSize = useSharedValue({ width: 0, height: 0 })
  const stageBounds = useSharedValue<StageWindowBounds>(EMPTY_STAGE_BOUNDS)
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
  const overlayOrigin = useSharedValue({ x: 0, y: 0 })

  useEffect(() => {
    hitRects.value = createRoomEditorDragHitRects(scene.renderItems)
  }, [hitRects, scene.renderItems])
  useEffect(() => {
    stageSize.value = { width: roomLayout.width, height: roomLayout.height }
  }, [roomLayout.height, roomLayout.width, stageSize])
  useEffect(() => {
    stageBounds.value = stageWindowBounds ?? EMPTY_STAGE_BOUNDS
  }, [stageBounds, stageWindowBounds])

  const clearGhost = useCallback((session: number) => {
    setGhost((current) => current?.session === session ? undefined : current)
  }, [])

  const liftGhost = useCallback((anchorX: number, anchorY: number) => {
    "worklet"
    cancelAnimation(ghostX)
    cancelAnimation(ghostY)
    cancelAnimation(ghostScale)
    ghostX.value = anchorX
    ghostY.value = anchorY
    ghostOriginX.value = anchorX
    ghostOriginY.value = anchorY
    ghostScale.value = reduceMotion ? 1 : withSpring(ROOM_EDITOR_DRAG_LIFT_SCALE, {
      ...ROOM_EDITOR_DRAG_RETURN_SPRING,
      reduceMotion: ReduceMotion.Never
    })
    ghostOpacity.value = ROOM_EDITOR_DRAG_GHOST_OPACITY
  }, [ghostOpacity, ghostOriginX, ghostOriginY, ghostScale, ghostX, ghostY, reduceMotion])

  const springGhostBack = useCallback((session: number) => {
    "worklet"
    if (reduceMotion) {
      ghostX.value = ghostOriginX.value
      ghostY.value = ghostOriginY.value
      ghostScale.value = 1
      ghostOpacity.value = 0
      scheduleOnRN(clearGhost, session)
      return
    }
    const config = { ...ROOM_EDITOR_DRAG_RETURN_SPRING, reduceMotion: ReduceMotion.Never }
    ghostScale.value = withSpring(1, config)
    ghostY.value = withSpring(ghostOriginY.value, config)
    ghostX.value = withSpring(ghostOriginX.value, config, (finished) => {
      "worklet"
      // A newer drag cancels this return; only a finished return hides.
      if (!finished) return
      ghostOpacity.value = 0
      scheduleOnRN(clearGhost, session)
    })
  }, [clearGhost, ghostOpacity, ghostOriginX, ghostOriginY, ghostScale, ghostX, ghostY, reduceMotion])

  const hideGhost = useCallback((session: number) => {
    ghostOpacity.value = 0
    ghostScale.value = 1
    clearGhost(session)
  }, [clearGhost, ghostOpacity, ghostScale])

  // Drag callbacks reach JS through scheduleOnRN; they read the latest render
  // through this ref so the gestures (and every tray card) keep one identity.
  const handlers = {
    computePreview(drag: ActiveDrag, column: number, row: number): PlacementPreview | undefined {
      if (drag.source === "stage") {
        return createRoomEditorStageDragPreview({
          copy: input.copy,
          scene,
          renderId: drag.renderId,
          column,
          row
        })
      }
      return createRoomEditorTrayDragPreview({
        copy: input.copy,
        scene,
        stageWindowBounds,
        item: drag.item,
        instanceId: drag.instanceId,
        rotation: drag.rotation,
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
      activeDragRef.current = { session, source: "stage", renderId, startColumn: column, startRow: row }
      hapticLight()
      input.selection.setPlacementFeedback(undefined)
      input.selection.setPlacementPreview(undefined)
      input.selection.setSelectedInstanceId(renderId)
      input.inventory.setSelectedInventoryItemId(placedItem?.itemId)
      input.inventory.setSelectedInventoryRotation(item.rotation)
      setGhost({
        session,
        source: item.asset.source,
        mirrored: item.usesMirroredRotation,
        frame: getRoomEditorDragGhostFrame(item, roomLayout)
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
      // The page may have scrolled since the stage was last measured.
      input.stage.measureStageWindow()
      const instanceId = `${item.id}_${Date.now()}`
      activeDragRef.current = { session, source: "tray", item, instanceId, rotation, startColumn: column, startRow: row }
      const renderItem = resolvePlacedFurnitureRenderItem({ instanceId, itemId, x: 0.5, y: 0.5, rotation }, item)
      hapticLight()
      input.selection.setSelectedInstanceId(instanceId)
      input.selection.updatePlacementPreview(undefined)
      input.selection.updatePlacementFeedback(getRoomPlacementSurfaceDropFeedback(item, input.copy))
      if (renderItem) {
        setGhost({
          session,
          source: renderItem.asset.source,
          mirrored: renderItem.usesMirroredRotation,
          frame: getRoomEditorDragGhostFrame(renderItem, stageWindowBounds ?? roomLayout)
        })
      }
    },
    moveDrag(session: number, column: number, row: number) {
      const drag = activeDragRef.current
      if (!drag || drag.session !== session) return
      const preview = handlers.computePreview(drag, column, row)
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
      if (release === "commit" && preview) {
        hideGhost(session)
        input.commitTrayPlacementPreview(preview)
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

  // Backgrounding mid-drag restores the piece even if the touch is never
  // cancelled back to the gesture.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const drag = activeDragRef.current
      if (state !== "active" && drag) cancelDrag(drag.session)
    })
    return () => subscription.remove()
  }, [cancelDrag])

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
    })
    .onStart((event) => {
      "worklet"
      const session = dragSession.value + 1
      dragSession.value = session
      const size = stageSize.value
      const cell = getRoomEditorDragCell(getRoomEditorStageDragPoint({
        localX: event.x,
        localY: event.y,
        stageWidth: size.width,
        stageHeight: size.height,
        grabOffsetX: grabOffsetX.value,
        grabOffsetY: grabOffsetY.value
      }))
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
      ghostX.value = event.absoluteX - grabOffsetX.value * size.width
      ghostY.value = event.absoluteY - grabOffsetY.value * size.height
      const cell = getRoomEditorDragCell(getRoomEditorStageDragPoint({
        localX: event.x,
        localY: event.y,
        stageWidth: size.width,
        stageHeight: size.height,
        grabOffsetX: grabOffsetX.value,
        grabOffsetY: grabOffsetY.value
      }))
      if (hasRoomEditorDragCellChanged(lastColumn.value, lastRow.value, cell.column, cell.row)) {
        lastColumn.value = cell.column
        lastRow.value = cell.row
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
    dragSession,
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
    releaseDrag,
    stageSize
  ])

  const createTrayDragGesture = useCallback((
    item: FurnitureItem,
    owned: boolean,
    placed: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => {
    const itemId = item.id
    return Gesture.Pan()
      .enabled(owned && !placed)
      .activateAfterLongPress(ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS)
      .shouldCancelWhenOutside(false)
      .maxPointers(1)
      .onStart((event) => {
        "worklet"
        const session = dragSession.value + 1
        dragSession.value = session
        const cell = getRoomEditorDragCell(getRoomEditorTrayDragPoint({
          absoluteX: event.absoluteX,
          absoluteY: event.absoluteY,
          bounds: stageBounds.value
        }))
        lastColumn.value = cell.column
        lastRow.value = cell.row
        liftGhost(event.absoluteX, event.absoluteY)
        scheduleOnRN(beginTrayDrag, session, itemId, rotation, cell.column, cell.row)
      })
      .onUpdate((event) => {
        "worklet"
        ghostX.value = event.absoluteX
        ghostY.value = event.absoluteY
        const cell = getRoomEditorDragCell(getRoomEditorTrayDragPoint({
          absoluteX: event.absoluteX,
          absoluteY: event.absoluteY,
          bounds: stageBounds.value
        }))
        if (hasRoomEditorDragCellChanged(lastColumn.value, lastRow.value, cell.column, cell.row)) {
          lastColumn.value = cell.column
          lastRow.value = cell.row
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
    dragSession,
    ghostX,
    ghostY,
    lastColumn,
    lastRow,
    liftGhost,
    moveDrag,
    releaseDrag,
    stageBounds
  ])

  const ghostValues = useMemo<RoomEditorDragGhostValues>(() => ({
    x: ghostX,
    y: ghostY,
    scale: ghostScale,
    opacity: ghostOpacity,
    overlayOrigin
  }), [ghostOpacity, ghostScale, ghostX, ghostY, overlayOrigin])

  return {
    stageDragGesture,
    createTrayDragGesture,
    ghost,
    ghostValues
  }
}

export type RoomEditorDragGestures = ReturnType<typeof useRoomEditorDragGestures>
