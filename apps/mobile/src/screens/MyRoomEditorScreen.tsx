import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { memo, useMemo, useState, useCallback, useEffect, useRef } from "react"
import { Alert, Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Image, PanResponder, type GestureResponderHandlers, type LayoutChangeEvent, type GestureResponderEvent } from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import Ionicons from "@expo/vector-icons/Ionicons"
import { RoomRenderer2D } from "../features/roomV2/components/RoomRenderer2D"
import { useInventoryStore } from "../features/inventory/inventoryStore"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../features/roomV2/roomV2.mock"
import {
  createRoomV2FurniturePlacementPreview,
  normalizeRoomInventorySearchText,
  resolvePlacedFurnitureRenderItem,
  resolveRoomV2Scene,
  upsertRoomV2RenderItemSorted,
  validateRoomV2DraftPlacements,
  validateRoomV2FurniturePlacement
} from "../features/roomV2/roomV2Selectors"
import {
  createRoomV2EditorSaveDecor,
  getRoomV2PlacedItemPersistenceMetadata
} from "../features/roomV2/roomV2EditorSave"
import {
  applyRoomV2EditorDraft,
  createRoomV2EditorSession,
  resetRoomV2EditorSession,
  undoRoomV2EditorSession,
  updateRoomV2EditorPersistedBaseline
} from "../features/roomV2/roomV2EditorSession"
import { saveRoomV2EditorDraftConfirmed } from "../features/roomV2/roomV2EditorConfirmedSave"
import { getRoomV2FurniturePlacementSurface } from "../features/roomV2/roomV2PlacementSurface"
import { clampRoomV2FloorFootprintToPolygon } from "../features/roomV2/roomV2FloorPlacement"
import { getRoomV2DraftPlacementCandidates } from "../features/roomV2/roomV2DraftPlacementCandidates"
import { resolveRoomV2ExactRotationPreview } from "../features/roomV2/roomV2ExactRotation"
import {
  hasMultipleRoomV2RotationOptions
} from "../features/roomV2/roomV2EditorPresentation"
import {
  getMyRoomEditorCopy,
  type MyRoomEditorCopy
} from "../features/roomV2/myRoomCopy"
import { getAppLocale } from "../features/session/authLocale"
import {
  canPlaceRoomV2ItemInstance,
  commitRoomV2PlacedItem,
  selectRoomV2Shell
} from "../features/roomV2/roomV2DecorActions"
import {
  useRoomV2,
  patchRoomV2PlacedItem,
  removeRoomV2PlacedItem
} from "../features/roomV2/state/RoomV2Provider"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { uiTheme } from "../ui/theme"
import { hapticLight, hapticSuccess, hapticError } from "../ui/haptics"
import { useSelectionTransition } from "../ui/animations"
import { projectRoomWorldPointToPolygon } from "../features/roomWorld/roomWorldGeometry"
import { getRoomWorldMotionReadinessSummary } from "../features/roomWorld/roomWorldDiagnostics"
import { createRoomWorldGeometryFromRoomV2Scene } from "../features/roomWorld/roomWorldRoomV2Projection"
import type {
  FurnitureItem,
  FurnitureCategory,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomShell,
  RoomV2RenderItem,
  UserRoomDecor
} from "../features/roomV2/roomV2.types"

type MyRoomEditorScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "MyRoomEditor"
>

const ROOM_V2_PLACEMENT_SNAP_STEP = 0.01
const EDIT_ROOM_AVATAR_SPAWN = {
  x: 0.47,
  y: 0.76
} as const

interface PlacementPreview {
  item: RoomV2RenderItem
  isValid: boolean
  feedback?: string
  blockingRenderIds?: string[]
  supportingRenderIds?: string[]
  supportParentRotation?: PlacedRoomItem["supportParentRotation"]
  supportLocalPosition?: PlacedRoomItem["supportLocalPosition"]
}

interface StageWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface InventoryEntry {
  item: FurnitureItem
  owned: boolean
}

const ROOM_EDITOR_CATEGORIES: readonly {
  id: "all" | FurnitureCategory
  icon: keyof typeof Ionicons.glyphMap
}[] = [
  { id: "all", icon: "apps-outline" },
  { id: "seating", icon: "cafe-outline" },
  { id: "table", icon: "grid-outline" },
  { id: "rug", icon: "color-filter-outline" },
  { id: "misc", icon: "tv-outline" },
  { id: "lighting", icon: "bulb-outline" },
  { id: "wallDecor", icon: "images-outline" },
  { id: "plant", icon: "leaf-outline" }
]

const ACTIVE_ROOM_FURNITURE_CATALOG = ROOM_V2_FURNITURE_CATALOG
const ACTIVE_ROOM_SHELL_CATALOG = ROOM_V2_SHELL_CATALOG
const QA_OWNED_ROOM_ITEM_IDS = new Set<string>()

function arePlacementPreviewsEqual(
  left: PlacementPreview | undefined,
  right: PlacementPreview | undefined
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  if (left.isValid !== right.isValid || left.feedback !== right.feedback) {
    return false
  }
  if (left.item.renderId !== right.item.renderId) return false
  if (left.item.kind !== right.item.kind) return false
  if (
    left.item.x !== right.item.x ||
    left.item.y !== right.item.y ||
    left.item.width !== right.item.width ||
    left.item.height !== right.item.height
  ) {
    return false
  }
  if (left.item.depth !== right.item.depth) return false
  if (
    left.item.anchor.x !== right.item.anchor.x ||
    left.item.anchor.y !== right.item.anchor.y
  ) {
    return false
  }
  if (left.item.kind === "furniture" && right.item.kind === "furniture") {
    if (
      left.item.rotation !== right.item.rotation ||
      left.item.asset.key !== right.item.asset.key ||
      left.item.footprint?.width !== right.item.footprint?.width ||
      left.item.footprint?.height !== right.item.footprint?.height
    ) {
      return false
    }
  }
  const leftBlocking = left.blockingRenderIds ?? []
  const rightBlocking = right.blockingRenderIds ?? []
  if (leftBlocking.length !== rightBlocking.length) return false
  return leftBlocking.every((renderId, index) => renderId === rightBlocking[index])
}

export function MyRoomEditorScreen(props: MyRoomEditorScreenProps & {
  inventoryOwnerUserId?: string
  requireServerInventory?: boolean
}) {
  const { navigation, route } = props
  const copy = getMyRoomEditorCopy(getAppLocale())
  const {
    userRoomDecor,
    confirmedPersistedRoomDecor,
    saveUserRoomDecorConfirmed,
    persistenceState,
    persistenceErrorMessage,
    retryPersistence
  } = useRoomV2()
  const { ownsRoomItem } = useInventoryStore(
    props.inventoryOwnerUserId,
    props.requireServerInventory
  )
  const placementItemId = route.params?.placementItemId
  const lastAppliedPlacementItemId = useRef<string | undefined>(undefined)

  useEffect(() => navigation.addListener("blur", () => {
    lastAppliedPlacementItemId.current = undefined
  }), [navigation])
  const stageRef = useRef<View | null>(null)
  const trayDragInstanceIdRef = useRef<string | null>(null)
  const allowEditorExitRef = useRef(false)
  const pendingEditorExitActionRef = useRef<
    Parameters<typeof navigation.dispatch>[0] | undefined
  >(undefined)

  const [editorSession, setEditorSession] = useState(() =>
    createRoomV2EditorSession(userRoomDecor, confirmedPersistedRoomDecor)
  )
  const editorSessionRef = useRef(editorSession)
  const draftDecor = editorSession.draftDecor
  const setDraftDecor = useCallback((
    action: UserRoomDecor | ((current: UserRoomDecor) => UserRoomDecor)
  ): void => {
    setEditorSession((currentSession) => {
      const nextDecor = typeof action === "function"
        ? action(currentSession.draftDecor)
        : action
      const nextSession = applyRoomV2EditorDraft(currentSession, nextDecor)
      editorSessionRef.current = nextSession
      return nextSession
    })
  }, [])

  useEffect(() => {
    editorSessionRef.current = editorSession
  }, [editorSession])

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>()
  const [placementFeedback, setPlacementFeedback] = useState<string | undefined>()
  const [placementPreview, setPlacementPreview] = useState<PlacementPreview | undefined>()
  const [roomLayout, setRoomLayout] = useState({ width: 0, height: 0 })
  const [stageWindowBounds, setStageWindowBounds] = useState<StageWindowBounds | undefined>()
  const [activeInventoryCategory, setActiveInventoryCategory] = useState<"all" | FurnitureCategory>("all")
  const [inventorySearchQuery, setInventorySearchQuery] = useState("")
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | undefined>()
  const [selectedInventoryRotation, setSelectedInventoryRotation] = useState<PlacedRoomItem["rotation"]>("front")
  const [isSavingRoom, setIsSavingRoom] = useState(false)
  const isSavingRoomRef = useRef(false)
  const hasHydratedDraft = useRef(false)
  const isRoomDraftReady = persistenceState !== "loading" && hasHydratedDraft.current

  useEffect(() => {
    if (persistenceState === "loading" || hasHydratedDraft.current) return
    setEditorSession(createRoomV2EditorSession(
      userRoomDecor,
      confirmedPersistedRoomDecor
    ))
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    hasHydratedDraft.current = true
  }, [confirmedPersistedRoomDecor, persistenceState, userRoomDecor])
  useEffect(() => {
    if (!hasHydratedDraft.current) return
    setEditorSession((current) => {
      const nextSession = updateRoomV2EditorPersistedBaseline(
        current,
        confirmedPersistedRoomDecor
      )
      editorSessionRef.current = nextSession
      return nextSession
    })
  }, [confirmedPersistedRoomDecor])
  const canPlaceAnotherRoomItem = useCallback((itemId: string): boolean => (
    canPlaceRoomV2ItemInstance(draftDecor, itemId)
  ), [draftDecor])

  const scene = useMemo(
    () =>
      resolveRoomV2Scene({
        roomShellCatalog: ACTIVE_ROOM_SHELL_CATALOG,
        furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG,
        decor: draftDecor,
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      }),
    [draftDecor]
  )
  const displayRenderItems = useMemo(() => {
    if (!placementPreview) return scene.renderItems
    return upsertRoomV2RenderItemSorted(scene.renderItems, placementPreview.item)
  }, [placementPreview, scene.renderItems])
  const placementStateByRenderId = useMemo(() => {
    if (!placementPreview) return undefined
    const stateByRenderId: Record<string, "valid" | "invalid"> = {
      [placementPreview.item.renderId]: placementPreview.isValid
        ? "valid"
        : "invalid"
    }
    if (!placementPreview.isValid) {
      placementPreview.blockingRenderIds?.forEach((renderId) => {
        stateByRenderId[renderId] = "invalid"
      })
    }
    return {
      ...stateByRenderId
    }
  }, [placementPreview])
  const roomWorldGeometry = useMemo(
    () => createRoomWorldGeometryFromRoomV2Scene(scene),
    [scene]
  )
  const roomWorldReadiness = useMemo(
    () => getRoomWorldMotionReadinessSummary({
      geometry: roomWorldGeometry,
      spawn: EDIT_ROOM_AVATAR_SPAWN
    }),
    [roomWorldGeometry]
  )
  const roomWorldStatus = getEditRoomWorldStatus(roomWorldReadiness.level, copy)
  const inventoryEntries = useMemo<InventoryEntry[]>(
    () =>
      ACTIVE_ROOM_FURNITURE_CATALOG
        .filter((item) =>
          ownsRoomItem(item.id) || QA_OWNED_ROOM_ITEM_IDS.has(item.id)
        )
        .map((item) => ({
        item,
        owned: true
      })),
    [ownsRoomItem]
  )
  const placedRoomItemIds = useMemo(
    () => new Set(draftDecor.placedItems.map((placedItem) => placedItem.itemId)),
    [draftDecor.placedItems]
  )
  const filteredInventoryEntries = useMemo(() => {
    const normalizedQuery = normalizeRoomInventorySearchText(inventorySearchQuery)
    return inventoryEntries.filter((entry) => (
      (activeInventoryCategory === "all" || entry.item.category === activeInventoryCategory) &&
      (!normalizedQuery || normalizeRoomInventorySearchText(entry.item.name).includes(normalizedQuery))
    ))
  }, [activeInventoryCategory, inventoryEntries, inventorySearchQuery])
  const selectedInventoryEntry = useMemo(() => (
    filteredInventoryEntries.find((entry) => entry.item.id === selectedInventoryItemId) ??
    filteredInventoryEntries.find((entry) => entry.owned && !placedRoomItemIds.has(entry.item.id)) ??
    filteredInventoryEntries[0]
  ), [filteredInventoryEntries, placedRoomItemIds, selectedInventoryItemId])
  const selectedInventoryRotations = useMemo(
    () => selectedInventoryEntry
      ? getRoomV2FurnitureRotationOptions(selectedInventoryEntry.item)
      : [],
    [selectedInventoryEntry]
  )
  const selectedPlacedRotationOptions = useMemo(() => {
    const selectedPlacedItem = draftDecor.placedItems.find(
      (item) => item.instanceId === selectedInstanceId
    )
    const selectedFurniture = ACTIVE_ROOM_FURNITURE_CATALOG.find(
      (item) => item.id === selectedPlacedItem?.itemId
    )
    return selectedFurniture
      ? getRoomV2FurnitureRotationOptions(selectedFurniture)
      : []
  }, [draftDecor.placedItems, selectedInstanceId])
  const canRotateSelectedPlacedItem = hasMultipleRoomV2RotationOptions(
    selectedPlacedRotationOptions
  )
  const selectedInventoryTransition = useSelectionTransition(
    selectedInventoryEntry?.item.id
  )

  useEffect(() => {
    const nextItemId = selectedInventoryEntry?.item.id
    setSelectedInventoryItemId((current) => current === nextItemId ? current : nextItemId)
  }, [selectedInventoryEntry?.item.id])

  useEffect(() => {
    if (!selectedInventoryEntry) return
    const availableRotations = getRoomV2FurnitureRotationOptions(selectedInventoryEntry.item)
    setSelectedInventoryRotation((current) => (
      availableRotations.includes(current)
        ? current
        : getDefaultRoomV2FurnitureRotation(selectedInventoryEntry.item)
    ))
  }, [selectedInventoryEntry])
  const updatePlacementFeedback = useCallback((nextFeedback: string | undefined) => {
    setPlacementFeedback((current) => current === nextFeedback ? current : nextFeedback)
  }, [])
  const updatePlacementPreview = useCallback((nextPreview: PlacementPreview | undefined) => {
    setPlacementPreview((current) =>
      arePlacementPreviewsEqual(current, nextPreview) ? current : nextPreview
    )
  }, [])

  const measureStageWindow = useCallback(() => {
    stageRef.current?.measureInWindow((x, y, width, height) => {
      setStageWindowBounds((current) =>
        current &&
        current.x === x &&
        current.y === y &&
        current.width === width &&
        current.height === height
          ? current
          : { x, y, width, height }
      )
    })
  }, [])

  const handleRoomLayout = useCallback((e: LayoutChangeEvent) => {
    const nextLayout = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height
    }
    setRoomLayout((current) =>
      current.width === nextLayout.width &&
      current.height === nextLayout.height
        ? current
        : nextLayout
    )
    requestAnimationFrame(measureStageWindow)
  }, [measureStageWindow])

  const handleItemTap = useCallback((item: RoomV2RenderItem) => {
    if (item.kind !== "furniture") return
    const placedItem = draftDecor.placedItems.find((entry) => entry.instanceId === item.renderId)
    hapticLight()
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    setSelectedInstanceId(item.renderId)
    setSelectedInventoryItemId(placedItem?.itemId)
    setSelectedInventoryRotation(item.rotation)
  }, [draftDecor.placedItems])

  const createPlacementPreviewFromEvent = useCallback((e: GestureResponderEvent): PlacementPreview | undefined => {
    if (!selectedInstanceId || roomLayout.width === 0 || roomLayout.height === 0) {
      return undefined
    }

    const { locationX, locationY, pageX, pageY } = e.nativeEvent
    const eventPoint = stageWindowBounds
      ? {
        x: (pageX - stageWindowBounds.x) / stageWindowBounds.width,
        y: (pageY - stageWindowBounds.y) / stageWindowBounds.height
      }
      : {
        x: locationX / roomLayout.width,
        y: locationY / roomLayout.height
      }
    const selectedItem = scene.renderItems.find((item) =>
      item.renderId === selectedInstanceId
    )
    if (!selectedItem || selectedItem.kind !== "furniture") return undefined

    const normalizedPoint = clampRoomV2PlacementPointForItem({
      x: eventPoint.x,
      y: eventPoint.y
    }, selectedItem, scene.shell, selectedItem.rotation)

    const candidate = createRoomV2FurniturePlacementPreview({
      item: selectedItem,
      x: normalizedPoint.x,
      y: normalizedPoint.y
    })
    const validation = validateRoomV2FurniturePlacement({
      scene,
      candidate
    })

    return createRoomV2PlacementPreviewResult({
      copy,
      scene,
      candidate,
      placementIsValid: validation.isValid,
      placementFeedback: validation.isValid
        ? undefined
        : getRoomPlacementFeedback(validation.issueIds[0], copy),
      blockingRenderIds: validation.blockingRenderIds,
      supportingRenderIds: validation.supportingRenderIds
    })
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [selectedInstanceId, roomLayout.height, roomLayout.width, scene, stageWindowBounds])

  const createTrayPlacementPreview = useCallback((input: {
    item: FurnitureItem
    instanceId: string
    rotation: PlacedRoomItem["rotation"]
    pageX: number
    pageY: number
  }): PlacementPreview | undefined => {
    if (
      !stageWindowBounds ||
      stageWindowBounds.width <= 0 ||
      stageWindowBounds.height <= 0
    ) {
      return undefined
    }
    const localX = input.pageX - stageWindowBounds.x
    const localY = input.pageY - stageWindowBounds.y
    const isInsideStage =
      localX >= 0 &&
      localX <= stageWindowBounds.width &&
      localY >= 0 &&
      localY <= stageWindowBounds.height

    if (!isInsideStage) {
      return undefined
    }

    const normalizedPoint = clampRoomV2PlacementPointForItem({
      x: localX / stageWindowBounds.width,
      y: localY / stageWindowBounds.height
    }, input.item, scene.shell, input.rotation)
    const placedItem: PlacedRoomItem = {
      instanceId: input.instanceId,
      itemId: input.item.id,
      x: normalizedPoint.x,
      y: normalizedPoint.y,
      rotation: input.rotation
    }
    const candidate = resolvePlacedFurnitureRenderItem(placedItem, input.item)
    if (!candidate) return undefined
    const validation = validateRoomV2FurniturePlacement({
      scene,
      candidate
    })

    return createRoomV2PlacementPreviewResult({
      copy,
      scene,
      candidate,
      placementIsValid: validation.isValid,
      placementFeedback: validation.isValid
        ? undefined
        : getRoomPlacementFeedback(validation.issueIds[0], copy),
      blockingRenderIds: validation.blockingRenderIds,
      supportingRenderIds: validation.supportingRenderIds
    })
  }, [copy, scene, stageWindowBounds])

  const commitTrayPlacementPreview = useCallback((preview: PlacementPreview | undefined): boolean => {
    if (!preview || preview.item.kind !== "furniture" || !preview.isValid) {
      hapticError()
      updatePlacementFeedback(preview?.feedback ?? copy.feedback.chooseCompatibleSurface)
      updatePlacementPreview(preview)
      return false
    }

    const placedItem: PlacedRoomItem = {
      instanceId: preview.item.renderId,
      itemId: preview.item.itemId,
      x: preview.item.x,
      y: preview.item.y,
      rotation: preview.item.rotation,
      ...getRoomV2PlacedItemPersistenceMetadata({
        ...preview.item,
        supportInstanceId: preview.supportingRenderIds?.[0],
        supportParentRotation: preview.supportParentRotation,
        supportLocalPosition: preview.supportLocalPosition
      })
    }
    hapticSuccess()
    setDraftDecor((current) => commitRoomV2PlacedItem(current, placedItem))
    setSelectedInstanceId(placedItem.instanceId)
    updatePlacementFeedback(undefined)
    updatePlacementPreview(undefined)
    return true
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [copy.feedback.chooseCompatibleSurface, updatePlacementFeedback, updatePlacementPreview])

  const handleFloorTap = useCallback((e: GestureResponderEvent) => {
    const preview = createPlacementPreviewFromEvent(e)
    updatePlacementPreview(preview)
    updatePlacementFeedback(preview?.isValid
      ? copy.feedback.tapCheckToPlace
      : preview?.feedback
    )
  }, [copy.feedback.tapCheckToPlace, createPlacementPreviewFromEvent, updatePlacementFeedback, updatePlacementPreview])

  const stagePanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(selectedInstanceId),
      onMoveShouldSetPanResponder: () => Boolean(selectedInstanceId),
      onPanResponderGrant: (event) => {
        const preview = createPlacementPreviewFromEvent(event)
        updatePlacementPreview(preview)
        if (preview?.isValid) {
          updatePlacementFeedback(preview.feedback)
        } else if (preview?.feedback) {
          updatePlacementFeedback(preview.feedback)
        }
      },
      onPanResponderMove: (event) => {
        const preview = createPlacementPreviewFromEvent(event)
        updatePlacementPreview(preview)
        if (preview?.isValid) {
          updatePlacementFeedback(preview.feedback ?? copy.feedback.releaseToPlace)
        } else if (preview?.feedback) {
          updatePlacementFeedback(preview.feedback)
        }
      },
      onPanResponderRelease: (event) => {
        const preview = createPlacementPreviewFromEvent(event)
        updatePlacementPreview(preview)
        updatePlacementFeedback(preview?.isValid
          ? copy.feedback.tapCheckToPlace
          : preview?.feedback
        )
      },
      onPanResponderTerminate: () => {
        updatePlacementPreview(undefined)
      }
    }),
    [copy.feedback.releaseToPlace, copy.feedback.tapCheckToPlace, createPlacementPreviewFromEvent, selectedInstanceId, updatePlacementFeedback, updatePlacementPreview]
  )

  const createInventoryItemPanHandlers = useCallback((
    item: FurnitureItem,
    owned: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        owned &&
        canPlaceAnotherRoomItem(item.id) &&
        Math.abs(gestureState.dy) > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: (_, gestureState) => {
        if (!owned) return
        if (!canPlaceAnotherRoomItem(item.id)) {
          hapticError()
          setPlacementFeedback(copy.feedback.alreadyPlaced)
          return
        }
        if (!stageWindowBounds) {
          measureStageWindow()
        }
        const instanceId = `${item.id}_${Date.now()}`
        trayDragInstanceIdRef.current = instanceId
        const preview = createTrayPlacementPreview({
          item,
          instanceId,
          rotation,
          pageX: gestureState.moveX,
          pageY: gestureState.moveY
        })
        setSelectedInstanceId(instanceId)
        updatePlacementPreview(preview)
        updatePlacementFeedback(preview?.isValid
          ? preview.feedback ?? copy.feedback.releaseToPlace
          : preview?.feedback ?? copy.feedback.chooseCompatibleSurface
        )
      },
      onPanResponderMove: (_, gestureState) => {
        const instanceId = trayDragInstanceIdRef.current
        if (!owned || !instanceId || !canPlaceAnotherRoomItem(item.id)) return
        const preview = createTrayPlacementPreview({
          item,
          instanceId,
          rotation,
          pageX: gestureState.moveX,
          pageY: gestureState.moveY
        })
        updatePlacementPreview(preview)
        if (preview?.isValid) {
          updatePlacementFeedback(preview.feedback ?? copy.feedback.releaseToPlace)
        } else {
          updatePlacementFeedback(preview?.feedback ?? copy.feedback.chooseCompatibleSurface)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const instanceId = trayDragInstanceIdRef.current
        trayDragInstanceIdRef.current = null
        if (!owned || !instanceId || !canPlaceAnotherRoomItem(item.id)) {
          if (owned && instanceId) {
            setSelectedInstanceId(undefined)
            updatePlacementPreview(undefined)
            updatePlacementFeedback(copy.feedback.alreadyPlaced)
          }
          return
        }
        const preview = createTrayPlacementPreview({
          item,
          instanceId,
          rotation,
          pageX: gestureState.moveX,
          pageY: gestureState.moveY
        })
        if (!preview || !preview.isValid || preview.item.kind !== "furniture") {
          if (!commitTrayPlacementPreview(preview)) {
            setSelectedInstanceId(undefined)
          }
          return
        }
        setSelectedInstanceId(instanceId)
        updatePlacementPreview(preview)
        updatePlacementFeedback(copy.feedback.tapCheckToPlace)
        if (!preview) {
          setSelectedInstanceId(undefined)
        }
      },
      onPanResponderTerminate: () => {
        trayDragInstanceIdRef.current = null
        updatePlacementPreview(undefined)
        updatePlacementFeedback(undefined)
      }
    })
    return responder.panHandlers
  }, [
    canPlaceAnotherRoomItem,
    copy.feedback,
    createTrayPlacementPreview,
    measureStageWindow,
    stageWindowBounds,
    commitTrayPlacementPreview,
    updatePlacementFeedback,
    updatePlacementPreview
  ])

  const applySelectedItemRotation = useCallback((rotation: PlacedRoomItem["rotation"]): boolean => {
    if (!selectedInstanceId) return false
    const exactRotation = resolveRoomV2ExactRotationPreview({
      decor: draftDecor,
      scene,
      furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG,
      instanceId: selectedInstanceId,
      rotation
    })
    if (exactRotation.status === "missing_selection") {
      return false
    }
    if (exactRotation.status === "unsupported_rotation") {
      hapticError()
      setPlacementFeedback(copy.feedback.unsupportedDirection)
      setPlacementPreview(undefined)
      return false
    }
    if (exactRotation.status === "unresolved_rotation") {
      hapticError()
      setPlacementFeedback(copy.feedback.unavailableRotation)
      setPlacementPreview(undefined)
      return false
    }
    const { candidate, validation } = exactRotation
    const preview = createRoomV2PlacementPreviewResult({
      copy,
      scene,
      candidate,
      placementIsValid: validation.isValid,
      placementFeedback: validation.isValid
        ? undefined
        : getRoomPlacementFeedback(validation.issueIds[0], copy),
      blockingRenderIds: validation.blockingRenderIds,
      supportingRenderIds: validation.supportingRenderIds
    })
    if (!preview.isValid) {
      hapticError()
      setPlacementFeedback(preview.feedback ?? copy.feedback.chooseClearSpot)
      setPlacementPreview(preview)
      return false
    }

    setDraftDecor(current => patchRoomV2PlacedItem(current, selectedInstanceId, { rotation }))
    setSelectedInventoryRotation(rotation)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    hapticLight()
    return true
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [copy, draftDecor.placedItems, selectedInstanceId, scene])

  const handleRotate = useCallback(() => {
    if (!selectedInstanceId) return
    const placedItem = draftDecor.placedItems.find(
      (item) => item.instanceId === selectedInstanceId
    )
    const furnitureItem = ACTIVE_ROOM_FURNITURE_CATALOG.find(
      (item) => item.id === placedItem?.itemId
    )
    if (!placedItem || !furnitureItem) return

    const rotationOptions = getRoomV2FurnitureRotationOptions(furnitureItem)
    if (rotationOptions.length < 2) {
      hapticLight()
      return
    }
    const currentRotationIndex = Math.max(0, rotationOptions.indexOf(placedItem.rotation))
    const nextRotation = rotationOptions[(currentRotationIndex + 1) % rotationOptions.length]
    applySelectedItemRotation(nextRotation)
  }, [applySelectedItemRotation, draftDecor.placedItems, selectedInstanceId])

  const handleSelectInventoryRotation = useCallback((
    rotation: PlacedRoomItem["rotation"]
  ) => {
    if (!selectedInventoryEntry) return
    const selectedPlacedItem = draftDecor.placedItems.find(
      (item) => item.instanceId === selectedInstanceId
    )
    if (selectedPlacedItem?.itemId !== selectedInventoryEntry.item.id) {
      hapticLight()
      setSelectedInventoryRotation(rotation)
      return
    }
    applySelectedItemRotation(rotation)
  }, [
    applySelectedItemRotation,
    draftDecor.placedItems,
    selectedInstanceId,
    selectedInventoryEntry
  ])

  const handleRemoveItem = useCallback(() => {
    if (!selectedInstanceId) return
    setDraftDecor(current => removeRoomV2PlacedItem(current, selectedInstanceId))
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    hapticSuccess()
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [selectedInstanceId])

  const addDraftItem = useCallback((
    itemId: string,
    feedback: boolean,
    rotationOverride?: PlacedRoomItem["rotation"]
  ): boolean => {
    if (!ownsRoomItem(itemId) && !QA_OWNED_ROOM_ITEM_IDS.has(itemId)) {
      if (feedback) hapticError()
      return false
    }
    if (!canPlaceAnotherRoomItem(itemId)) {
      if (feedback) {
        hapticError()
        setPlacementFeedback(copy.feedback.alreadyPlaced)
      }
      return false
    }
    const item = ACTIVE_ROOM_FURNITURE_CATALOG.find((entry) => entry.id === itemId)
    if (!item) {
      if (feedback) hapticError()
      return false
    }
    const placedItem = createValidDraftPlacement({
      copy,
      item,
      scene,
      itemId,
      rotationOverride
    })
    if (!placedItem) {
      if (feedback) hapticError()
      setPlacementFeedback(getRoomPlacementSurfaceDropFeedback(item, copy))
      return false
    }
    if (feedback) hapticLight()
    setDraftDecor((current) => commitRoomV2PlacedItem(current, placedItem))
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
    setSelectedInstanceId(placedItem.instanceId)
    return true
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [canPlaceAnotherRoomItem, copy, ownsRoomItem, scene])

  const handleAddSelectedInventoryItem = useCallback(() => {
    if (!selectedInventoryEntry) return
    addDraftItem(
      selectedInventoryEntry.item.id,
      true,
      selectedInventoryRotation
    )
  }, [addDraftItem, selectedInventoryEntry, selectedInventoryRotation])

  const renderInventoryItem = useCallback(({ item: entry }: { item: InventoryEntry }) => (
    <InventoryCatalogCard
      item={entry.item}
      owned={entry.owned}
      placed={!canPlaceAnotherRoomItem(entry.item.id)}
      selected={selectedInventoryEntry?.item.id === entry.item.id}
      previewRotation={selectedInventoryEntry?.item.id === entry.item.id
        ? selectedInventoryRotation
        : getDefaultRoomV2FurnitureRotation(entry.item)}
      onPreviewItem={setSelectedInventoryItemId}
      createPanHandlers={createInventoryItemPanHandlers}
    />
  ), [canPlaceAnotherRoomItem, createInventoryItemPanHandlers, selectedInventoryEntry?.item.id, selectedInventoryRotation])

  useEffect(() => {
    if (!placementItemId || lastAppliedPlacementItemId.current === placementItemId) return
    if (!isRoomDraftReady) return
    lastAppliedPlacementItemId.current = placementItemId
    setSelectedInventoryItemId(placementItemId)
    setPlacementFeedback(undefined)
    if (addDraftItem(placementItemId, false)) {
      hapticSuccess()
    }
  }, [addDraftItem, isRoomDraftReady, placementItemId])

  const handleSave = useCallback(async (): Promise<void> => {
    const requestedExitAction = pendingEditorExitActionRef.current
    pendingEditorExitActionRef.current = undefined
    if (isSavingRoomRef.current) return
    if (!isRoomDraftReady) {
      hapticError()
      setPlacementFeedback(copy.feedback.roomStillLoading)
      return
    }
    const furniturePreview = placementPreview?.item.kind === "furniture"
      ? {
          isValid: placementPreview.isValid,
          item: {
            ...placementPreview.item,
            supportInstanceId: placementPreview.supportingRenderIds?.[0],
            supportParentRotation: placementPreview.supportParentRotation,
            supportLocalPosition: placementPreview.supportLocalPosition
          }
        }
      : undefined
    const saveDecision = createRoomV2EditorSaveDecor(draftDecor, furniturePreview)
    if (saveDecision.status === "invalid_preview") {
      hapticError()
      setPlacementFeedback(copy.feedback.moveHighlighted)
      return
    }
    const decorToSave = saveDecision.decor
    const sceneToSave = resolveRoomV2Scene({
      roomShellCatalog: ACTIVE_ROOM_SHELL_CATALOG,
      furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG,
      decor: decorToSave,
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
    const draftValidation = validateRoomV2DraftPlacements({
      scene: sceneToSave,
      decor: decorToSave,
      furnitureCatalog: ACTIVE_ROOM_FURNITURE_CATALOG
    })
    const invalidDraftItem = draftValidation.invalidItems[0]
    if (invalidDraftItem) {
      hapticError()
      setSelectedInstanceId(invalidDraftItem.placedItem.instanceId)
      if (invalidDraftItem.renderItem) {
        setPlacementPreview({
          item: invalidDraftItem.renderItem,
          isValid: false,
          feedback: getRoomPlacementFeedback(invalidDraftItem.issueIds[0], copy),
          blockingRenderIds: invalidDraftItem.blockingRenderIds
        })
        setPlacementFeedback(copy.feedback.moveHighlighted)
      } else {
        setPlacementPreview(undefined)
        setPlacementFeedback(
          invalidDraftItem.issueIds[0] === "missing_catalog_item"
            ? copy.feedback.missingCatalogItem
            : copy.feedback.invalidCurrentRotation
        )
      }
      return
    }
    const roomWorldReadinessToSave = getRoomWorldMotionReadinessSummary({
      geometry: createRoomWorldGeometryFromRoomV2Scene(sceneToSave),
      spawn: EDIT_ROOM_AVATAR_SPAWN
    })
    if (roomWorldReadinessToSave.level === "blocked") {
      hapticError()
      setPlacementFeedback(copy.feedback.clearAvatarPath)
      return
    }
    isSavingRoomRef.current = true
    setIsSavingRoom(true)
    const confirmedSave = await saveRoomV2EditorDraftConfirmed(
      decorToSave,
      saveUserRoomDecorConfirmed
    )
    isSavingRoomRef.current = false
    setIsSavingRoom(false)
    if (confirmedSave.status !== "saved") {
      hapticError()
      setPlacementFeedback(confirmedSave.feedback)
      return
    }
    hapticSuccess()
    allowEditorExitRef.current = true
    if (requestedExitAction) {
      navigation.dispatch(requestedExitAction)
    } else {
      navigation.goBack()
    }
  }, [
    draftDecor,
    copy,
    isRoomDraftReady,
    navigation,
    placementPreview,
    saveUserRoomDecorConfirmed
  ])

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (allowEditorExitRef.current) {
      allowEditorExitRef.current = false
      return
    }
    if (!editorSessionRef.current.isDirty) return

    event.preventDefault()
    Alert.alert(
      copy.unsavedDialog.title,
      copy.unsavedDialog.body,
      [
        {
          text: copy.unsavedDialog.stay,
          style: "cancel"
        },
        {
          text: copy.unsavedDialog.discard,
          style: "destructive",
          onPress: () => {
            allowEditorExitRef.current = true
            navigation.dispatch(event.data.action)
          }
        },
        {
          text: copy.save,
          onPress: () => {
            pendingEditorExitActionRef.current = event.data.action
            handleSave()
          }
        }
      ]
    )
  }), [copy, handleSave, navigation])

  const handleCancel = useCallback(() => {
    hapticLight()
    navigation.goBack()
  }, [navigation])

  const handleResetDraft = useCallback(() => {
    if (!editorSessionRef.current.canResetToPersistedBaseline) {
      hapticError()
      setPlacementFeedback(copy.feedback.saveBeforeReset)
      return
    }
    hapticLight()
    setEditorSession((current) => {
      const nextSession = resetRoomV2EditorSession(current)
      editorSessionRef.current = nextSession
      return nextSession
    })
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
  }, [copy.feedback.saveBeforeReset])

  const handleUndoDraft = useCallback(() => {
    if (!editorSessionRef.current.canUndo) return
    hapticLight()
    setEditorSession((current) => {
      const nextSession = undoRoomV2EditorSession(current)
      editorSessionRef.current = nextSession
      return nextSession
    })
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
  }, [])

  const handleSelectRoomShell = useCallback((roomShellId: string): void => {
    hapticLight()
    setDraftDecor((current) => selectRoomV2Shell(current, roomShellId))
    setSelectedInstanceId(undefined)
    setPlacementFeedback(undefined)
    setPlacementPreview(undefined)
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [])

  return (
    <View style={styles.root}>
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.cancel}
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed ? styles.iconButtonPressed : null
            ]}
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color="#5B3A52" />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>
              {placementFeedback ?? (
                !selectedInstanceId
                  ? copy.defaultSubtitle
                  : canRotateSelectedPlacedItem
                    ? copy.rotatableSubtitle
                    : copy.fixedSubtitle
              )}
            </Text>
          </View>
          <View style={styles.topActions}>
            {editorSession.canUndo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.undo}
                onPress={handleUndoDraft}
                style={styles.actionButton}
                hitSlop={8}
              >
                <Ionicons name="arrow-undo" size={20} color="#7C5870" />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.saveLayout}
              accessibilityState={{ disabled: isSavingRoom }}
              disabled={isSavingRoom}
              onPress={handleSave}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.saveButtonPressed
              ]}
              hitSlop={8}
            >
              <Text style={styles.saveButtonText}>
                {isSavingRoom ? copy.saving : copy.save}
              </Text>
            </Pressable>
          </View>
        </View>

        {persistenceState === "failed" && persistenceErrorMessage ? (
          <View
            style={styles.persistenceBanner}
            accessibilityRole="alert"
          >
            <Ionicons
              name="cloud-offline-outline"
              size={18}
              color="#8B4D66"
            />
            <Text style={styles.persistenceBannerText}>
              {persistenceErrorMessage}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.retrySync}
              onPress={retryPersistence}
              hitSlop={8}
              style={({ pressed }) => [
                styles.persistenceRetryButton,
                pressed ? styles.iconButtonPressed : null
              ]}
            >
              <Ionicons name="refresh" size={18} color="#8B4D66" />
            </Pressable>
          </View>
        ) : null}

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.editorContentFlex}
        >
          <ScrollView
            contentContainerStyle={styles.editorContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            pointerEvents={isRoomDraftReady ? "auto" : "none"}
            accessibilityElementsHidden={!isRoomDraftReady}
            importantForAccessibility={isRoomDraftReady ? "auto" : "no-hide-descendants"}
          >
        {ACTIVE_ROOM_SHELL_CATALOG.length > 1 ? (
          <View style={styles.shellPicker}>
            <Text style={styles.shellPickerLabel}>{copy.roomStyle}</Text>
            <View style={styles.shellPickerOptions}>
              {ACTIVE_ROOM_SHELL_CATALOG.map((shell) => {
                const selected = draftDecor.roomShellId === shell.id
                return (
                  <Pressable
                    key={shell.id}
                    accessibilityRole="button"
                    accessibilityLabel={copy.chooseShell(shell.name)}
                    accessibilityState={{ selected }}
                    onPress={() => handleSelectRoomShell(shell.id)}
                    style={[
                      styles.shellPickerOption,
                      selected ? styles.shellPickerOptionSelected : null
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.shellPickerOptionText,
                        selected ? styles.shellPickerOptionTextSelected : null
                      ]}
                    >
                      {shell.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.stageWrap}>
          <View style={styles.roomWorldStatusPill} pointerEvents="none">
            <Ionicons
              name={roomWorldStatus.icon}
              size={14}
              color={roomWorldStatus.color}
            />
            <Text style={styles.roomWorldStatusText} numberOfLines={1}>
              {roomWorldStatus.label}
            </Text>
          </View>
          <Pressable
            accessible={Boolean(selectedInstanceId)}
            accessibilityRole="button"
            accessibilityLabel={copy.stageLabel}
            accessibilityHint={copy.stageHint}
            ref={stageRef}
            style={styles.roomImageWrapper}
            onLayout={handleRoomLayout}
            onPress={handleFloorTap}
            {...stagePanResponder.panHandlers}
          >
            <RoomRenderer2D
              shell={scene.shell}
              renderItems={displayRenderItems}
              selectedInstanceId={selectedInstanceId}
              placementStateByRenderId={placementStateByRenderId}
              onItemTap={handleItemTap}
              itemInteractionMode="edit"
              roomVNextRuntimeMode="disabled"
              debugPlacement={false}
              testID="edit-room-v1"
              style={styles.renderer}
            />
          </Pressable>
        </View>

        {placementPreview?.isValid || selectedInstanceId ? (
          <View style={styles.selectedItemActions}>
            {placementPreview?.isValid ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.confirmPlacement}
                onPress={() => commitTrayPlacementPreview(placementPreview)}
                style={[styles.selectedItemAction, styles.selectedItemActionPrimary]}
              >
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.selectedItemActionPrimaryText}>{copy.confirmPlacement}</Text>
              </Pressable>
            ) : null}
            {selectedInstanceId && canRotateSelectedPlacedItem ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.rotateSelected}
                onPress={handleRotate}
                style={styles.selectedItemAction}
              >
                <Ionicons name="sync" size={18} color="#7C5870" />
                <Text style={styles.selectedItemActionText}>{copy.rotateSelected}</Text>
              </Pressable>
            ) : null}
            {selectedInstanceId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.removeSelected}
                onPress={handleRemoveItem}
                style={styles.selectedItemAction}
              >
                <Ionicons name="trash-outline" size={18} color="#D94F69" />
                <Text style={[styles.selectedItemActionText, styles.selectedItemActionDangerText]}>{copy.removeSelected}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.inventoryWrap}>
          <View style={styles.inventoryHandle} />
          <View style={styles.inventoryHeader}>
            <View>
              <Text style={styles.inventoryTitle}>{copy.collectionTitle}</Text>
              <Text style={styles.inventoryEyebrow}>
                {copy.piecesReady(inventoryEntries.length)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.resetLayout}
              accessibilityState={{
                disabled: !editorSession.canResetToPersistedBaseline
              }}
              disabled={!editorSession.canResetToPersistedBaseline}
              onPress={handleResetDraft}
              hitSlop={8}
            >
              <Text style={[
                styles.inventorySubtitle,
                !editorSession.canResetToPersistedBaseline
                  ? styles.inventorySubtitleDisabled
                  : null
              ]}>{copy.resetLayout}</Text>
            </Pressable>
          </View>
          <View style={styles.inventorySearchField}>
            <Ionicons name="search-outline" size={17} color="#967A8C" />
            <TextInput
              accessibilityLabel={copy.searchLabel}
              accessibilityHint={copy.searchHint}
              value={inventorySearchQuery}
              onChangeText={setInventorySearchQuery}
              placeholder={copy.searchPlaceholder}
              placeholderTextColor="#A991A2"
              returnKeyType="done"
              style={styles.inventorySearchInput}
            />
            {inventorySearchQuery ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.clearSearch}
                onPress={() => setInventorySearchQuery("")}
                hitSlop={8}
                style={styles.inventorySearchClear}
              >
                <Ionicons name="close-circle" size={18} color="#8B6F82" />
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRail}
          >
            {ROOM_EDITOR_CATEGORIES.map((category) => {
              const selected = activeInventoryCategory === category.id
              const categoryLabel = copy.categoryLabels[category.id]
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={copy.showCategory(categoryLabel)}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    hapticLight()
                    setActiveInventoryCategory(category.id)
                  }}
                  style={[
                    styles.categoryChip,
                    selected ? styles.categoryChipSelected : null
                  ]}
                >
                  <Ionicons
                    name={category.icon}
                    size={14}
                    color={selected ? "#FFFFFF" : "#806579"}
                  />
                  <Text style={[
                    styles.categoryChipText,
                    selected ? styles.categoryChipTextSelected : null
                  ]}>{categoryLabel}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
          {selectedInventoryEntry ? (
            <Animated.View
              style={[styles.selectedInventoryPreview, selectedInventoryTransition]}
              accessibilityRole="summary"
              accessibilityLabel={copy.previewItem(selectedInventoryEntry.item.name)}
            >
              <View style={styles.selectedInventoryContentRow}>
                <View style={styles.selectedInventoryImageWrap}>
                  <Image
                    source={resolveRoomV2InventoryPreviewSource(
                      selectedInventoryEntry.item,
                      selectedInventoryRotation
                    )}
                    resizeMode="contain"
                    style={styles.selectedInventoryImage}
                  />
                </View>
                <View style={styles.selectedInventoryCopy}>
                  <Text style={styles.selectedInventoryEyebrow}>{copy.nowEditing}</Text>
                  <View style={styles.selectedInventoryTitleRow}>
                    <Text numberOfLines={1} style={styles.selectedInventoryName}>
                      {selectedInventoryEntry.item.name}
                    </Text>
                    {!canPlaceAnotherRoomItem(selectedInventoryEntry.item.id) ? (
                      <View style={styles.selectedInventoryPlacedPill}>
                        <Ionicons name="checkmark" size={12} color="#B8FFD7" />
                        <Text style={styles.selectedInventoryPlacedText}>{copy.placed}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.rotationRail}>
                    {selectedInventoryRotations.map((rotation) => {
                      const selected = selectedInventoryRotation === rotation
                      return (
                        <Pressable
                          key={rotation}
                          accessibilityRole="button"
                          accessibilityLabel={copy.chooseRotation(copy.rotationLabels[rotation], selectedInventoryEntry.item.name)}
                          accessibilityState={{ selected }}
                          onPress={() => handleSelectInventoryRotation(rotation)}
                          style={[
                            styles.rotationOption,
                            selected ? styles.rotationOptionSelected : null
                          ]}
                        >
                          <Text style={[
                            styles.rotationOptionText,
                            selected ? styles.rotationOptionTextSelected : null
                          ]}>{copy.rotationLabels[rotation]}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <Text style={styles.selectedInventoryHint}>
                    {selectedInventoryEntry.item.interactionType === "seat" && selectedInventoryRotation !== "front"
                      ? copy.seatInspectorHint
                      : copy.defaultInspectorHint}
                  </Text>
                </View>
              </View>
              {canPlaceAnotherRoomItem(selectedInventoryEntry.item.id) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.placeItem(selectedInventoryEntry.item.name)}
                  accessibilityState={{ disabled: !selectedInventoryEntry.owned }}
                  disabled={!selectedInventoryEntry.owned}
                  onPress={handleAddSelectedInventoryItem}
                  style={({ pressed }) => [
                    styles.placeSelectedInventoryButton,
                    !selectedInventoryEntry.owned
                      ? styles.placeSelectedInventoryButtonDisabled
                      : null,
                    pressed ? styles.placeSelectedInventoryButtonPressed : null
                  ]}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={selectedInventoryEntry.owned ? "#FFFFFF" : "#A68D9C"}
                  />
                  <Text style={[
                    styles.placeSelectedInventoryButtonText,
                    !selectedInventoryEntry.owned
                      ? styles.placeSelectedInventoryButtonTextDisabled
                      : null
                  ]}>{copy.placeInRoom}</Text>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}
          <FlatList
            data={filteredInventoryEntries}
            renderItem={renderInventoryItem}
            keyExtractor={(entry) => entry.item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.inventoryScroll}
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={4}
            removeClippedSubviews
            ListEmptyComponent={(
              <View style={styles.inventoryEmptyState}>
                <Text style={styles.inventoryEmptyText}>
                  {inventoryEntries.length > 0
                    ? copy.noMatches
                    : copy.noPieces}
                </Text>
                {inventoryEntries.length === 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.browseShop}
                    onPress={() => navigation.navigate("CosmeticShop", { initialShopMode: "home" })}
                    style={styles.inventoryEmptyAction}
                  >
                    <Text style={styles.inventoryEmptyActionText}>{copy.browseShop}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          />
        </View>
          </ScrollView>
          {!isRoomDraftReady ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={copy.preparing}
              style={styles.roomLoadingOverlay}
            >
              <Ionicons name="sparkles-outline" size={20} color="#7C5870" />
              <Text style={styles.roomLoadingOverlayText}>{copy.preparing}</Text>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const InventoryCatalogCard = memo(function InventoryCatalogCard(props: {
  item: FurnitureItem
  owned: boolean
  placed: boolean
  selected: boolean
  previewRotation: PlacedRoomItem["rotation"]
  onPreviewItem: (itemId: string) => void
  createPanHandlers: (
    item: FurnitureItem,
    owned: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => GestureResponderHandlers
}) {
  const {
    item,
    owned,
    placed,
    selected,
    previewRotation,
    onPreviewItem,
    createPanHandlers
  } = props
  const panHandlers = createPanHandlers(item, owned, previewRotation)

  return (
    <View style={styles.inventoryItemContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview ${item.name}`}
        accessibilityState={{ disabled: !owned || placed, selected }}
        disabled={!owned || placed}
        onPress={() => onPreviewItem(item.id)}
        {...panHandlers}
        style={({ pressed }) => [
          styles.inventoryItem,
          !owned ? styles.inventoryItemLocked : null,
          placed ? styles.inventoryItemPlaced : null,
          selected && !placed ? styles.inventoryItemSelected : null,
          pressed && owned && !placed ? styles.inventoryItemPressed : null
        ]}
      >
        <Image
          source={item.asset.source}
          style={styles.inventoryItemImage}
          resizeMode="contain"
        />
        {!owned ? (
          <View style={styles.inventoryItemLock}>
            <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
          </View>
        ) : null}
        {placed ? (
          <View style={styles.inventoryItemPlacedMark}>
            <Ionicons name="checkmark" size={13} color="#07130E" />
          </View>
        ) : null}
      </Pressable>
      <Text numberOfLines={1} style={styles.inventoryItemName}>{item.name}</Text>
    </View>
  )
}, (previous, next) =>
  previous.item.id === next.item.id &&
  previous.owned === next.owned &&
  previous.placed === next.placed &&
  previous.selected === next.selected &&
  previous.previewRotation === next.previewRotation &&
  previous.onPreviewItem === next.onPreviewItem &&
  previous.createPanHandlers === next.createPanHandlers
)

function createValidDraftPlacement(input: {
  copy: MyRoomEditorCopy
  item: FurnitureItem
  itemId: string
  scene: ReturnType<typeof resolveRoomV2Scene>
  rotationOverride?: PlacedRoomItem["rotation"]
}): PlacedRoomItem | null {
  const instanceId = `${input.itemId}_${Date.now()}`
  const rotation = input.rotationOverride ?? getDefaultRoomV2FurnitureRotation(input.item)
  const candidates = getRoomV2DraftPlacementCandidates(input.item, input.scene)

  for (const candidate of candidates) {
    const placedItem: PlacedRoomItem = {
      instanceId,
      itemId: input.itemId,
      x: candidate.x,
      y: candidate.y,
      rotation
    }
    const renderItem = resolvePlacedFurnitureRenderItem(placedItem, input.item)
    if (!renderItem) continue
    const validation = validateRoomV2FurniturePlacement({
      scene: input.scene,
      candidate: renderItem
    })
    const preview = createRoomV2PlacementPreviewResult({
      copy: input.copy,
      scene: input.scene,
      candidate: renderItem,
      placementIsValid: validation.isValid,
      placementFeedback: validation.isValid
        ? undefined
        : getRoomPlacementFeedback(validation.issueIds[0], input.copy),
      blockingRenderIds: validation.blockingRenderIds,
      supportingRenderIds: validation.supportingRenderIds
    })
    if (preview.isValid) {
      return {
        ...placedItem,
        ...getRoomV2PlacedItemPersistenceMetadata({
          ...renderItem,
          supportInstanceId: validation.supportingRenderIds[0],
          supportParentRotation: preview.supportParentRotation,
          supportLocalPosition: preview.supportLocalPosition
        })
      }
    }
  }

  return null
}

function getRoomPlacementSurfaceDropFeedback(
  item: FurnitureItem,
  copy: MyRoomEditorCopy
): string {
  const surface = getRoomV2FurniturePlacementSurface(item)
  return copy.surfaceDrop[surface]
}

function getDefaultRoomV2FurnitureRotation(
  item: FurnitureItem
): PlacedRoomItem["rotation"] {
  const rotations = getRoomV2FurnitureRotationOptions(item)
  if (rotations.length === 0 || rotations.includes("front")) return "front"
  return rotations[0]
}

function getRoomV2FurnitureRotationOptions(
  item: FurnitureItem
): PlacedRoomItem["rotation"][] {
  return item.assetsByRotation
    ? (Object.keys(item.assetsByRotation) as PlacedRoomItem["rotation"][])
    : []
}

function resolveRoomV2InventoryPreviewSource(
  item: FurnitureItem,
  rotation: PlacedRoomItem["rotation"]
) {
  return item.assetsByRotation?.[rotation]?.source ?? item.asset.source
}

function getRoomPlacementFeedback(
  issueId: string | undefined,
  copy: MyRoomEditorCopy
): string {
  if (issueId === "overlaps_blocking_furniture") {
    return copy.feedback.overlapsFurniture
  }
  if (issueId === "outside_placeable_area") {
    return copy.feedback.outsideFloor
  }
  if (issueId === "invalid_placement_surface") {
    return copy.feedback.invalidSurface
  }
  if (issueId === "missing_support_surface") {
    return copy.feedback.missingSupport
  }
  return copy.feedback.chooseClearSpot
}

function createRoomV2PlacementPreviewResult(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  candidate: RoomV2RenderItem
  placementIsValid: boolean
  placementFeedback?: string
  blockingRenderIds?: string[]
  supportingRenderIds?: string[]
}): PlacementPreview {
  const supportInstanceId = input.supportingRenderIds?.[0]
  const supportLocalPosition = getRoomV2SupportLocalPosition(
    input.scene,
    input.candidate,
    supportInstanceId
  )
  const support = supportInstanceId
    ? input.scene.renderItems.find((item) => item.renderId === supportInstanceId)
    : undefined
  const supportParentRotation = support?.kind === "furniture"
    ? support.rotation
    : undefined
  if (!input.placementIsValid || input.candidate.kind !== "furniture") {
    return {
      item: input.candidate,
      isValid: false,
      feedback: input.placementFeedback,
      blockingRenderIds: input.blockingRenderIds,
      supportingRenderIds: input.supportingRenderIds,
      supportParentRotation,
      supportLocalPosition
    }
  }

  const previewScene = createRoomV2SceneWithPreviewItem({
    scene: input.scene,
    candidate: input.candidate
  })
  const geometry = createRoomWorldGeometryFromRoomV2Scene(previewScene)
  const readiness = getRoomWorldMotionReadinessSummary({
    geometry,
    spawn: EDIT_ROOM_AVATAR_SPAWN
  })

  if (readiness.level === "blocked") {
    return {
      item: input.candidate,
      isValid: false,
      feedback: input.copy.feedback.blocksAvatarPath,
      blockingRenderIds: [input.candidate.renderId],
      supportingRenderIds: input.supportingRenderIds,
      supportParentRotation,
      supportLocalPosition
    }
  }

  return {
    item: input.candidate,
    isValid: true,
    feedback: readiness.level === "constrained"
      ? input.copy.feedback.tightButUsable
      : undefined,
    supportingRenderIds: input.supportingRenderIds,
    supportParentRotation,
    supportLocalPosition
  }
}

function candidateIsFurniture(
  item: RoomV2RenderItem
): item is Extract<RoomV2RenderItem, { kind: "furniture" }> {
  return item.kind === "furniture"
}

function getRoomV2SupportLocalPosition(
  scene: ResolvedRoomV2Scene,
  candidate: RoomV2RenderItem,
  supportInstanceId: string | undefined
): PlacedRoomItem["supportLocalPosition"] {
  if (!supportInstanceId || !candidateIsFurniture(candidate)) return undefined
  const support = scene.renderItems.find((item) => item.renderId === supportInstanceId)
  if (!support || support.kind !== "furniture" || support.width <= 0 || support.height <= 0) {
    return undefined
  }
  return {
    x: (candidate.x - (support.x - support.width * support.anchor.x)) / support.width,
    y: (candidate.y - (support.y - support.height * support.anchor.y)) / support.height
  }
}

function createRoomV2SceneWithPreviewItem(input: {
  scene: ResolvedRoomV2Scene
  candidate: RoomV2RenderItem
}): ResolvedRoomV2Scene {
  return {
    ...input.scene,
    renderItems: upsertRoomV2RenderItemSorted(
      input.scene.renderItems,
      input.candidate
    )
  }
}

function getEditRoomWorldStatus(
  level: ReturnType<typeof getRoomWorldMotionReadinessSummary>["level"],
  copy: MyRoomEditorCopy
): {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  color: string
} {
  switch (level) {
    case "ready":
      return {
        icon: "walk",
        label: copy.readiness.ready,
        color: "#8FFFD1"
      }
    case "constrained":
      return {
        icon: "resize",
        label: copy.readiness.constrained,
        color: "#FFE1A8"
      }
    case "blocked":
      return {
        icon: "alert-circle",
        label: copy.readiness.blocked,
        color: "#FFB4C8"
      }
  }
}

function clampRoomV2PlacementPointForItem(
  point: { x: number; y: number },
  item: Pick<FurnitureItem, "placementSurface" | "width" | "height" | "anchor" | "footprint" | "placementFootprint" | "placementFootprintByRotation"> & {
    anchor?: FurnitureItem["anchor"]
  },
  shell: RoomShell | null | undefined,
  rotation: PlacedRoomItem["rotation"] = "front"
): { x: number; y: number } {
  const surface = getRoomV2FurniturePlacementSurface(item)
  if (surface === "floor") {
    const floorPoint = clampRoomV2PlacementPointToFloor(point, shell)
    const polygon = shell?.walkablePolygon
    if (!polygon?.length) return floorPoint
    return clampRoomV2FloorFootprintToPolygon({
      point: floorPoint,
      polygon,
      footprint: item.placementFootprintByRotation?.[rotation] ??
        item.placementFootprint ??
        item.footprint ?? {
        width: item.width,
        height: item.height
      },
      anchor: item.anchor ?? { x: 0.5, y: 1 }
    })
  }

  const region = shell?.surfacePlacementAreas?.[surface]
  const normalized = {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y))
  }
  if (!region) return normalized

  const width = item.width
  const height = item.height
  const anchor = item.anchor ?? { x: 0.5, y: 1 }
  const minX = region.minX + width * anchor.x
  const maxX = region.maxX - width * (1 - anchor.x)
  const minY = region.minY + height * anchor.y
  const maxY = region.maxY - height * (1 - anchor.y)

  return {
    x: clampRoomV2PlacementValue(normalized.x, minX, maxX),
    y: clampRoomV2PlacementValue(normalized.y, minY, maxY)
  }
}

function clampRoomV2PlacementValue(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2
  return Math.max(min, Math.min(max, value))
}

function clampRoomV2PlacementPointToFloor(
  point: { x: number; y: number },
  shell: RoomShell | null | undefined
): { x: number; y: number } {
  const walkablePolygon = shell?.walkablePolygon
  const placeableArea = shell?.placeableArea
  const normalized = {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y))
  }
  if (walkablePolygon?.length) {
    return projectRoomWorldPointToPolygon({
      x: snapRoomV2PlacementValue(normalized.x),
      y: snapRoomV2PlacementValue(normalized.y)
    }, walkablePolygon)
  }

  if (!placeableArea) {
    return {
      x: snapRoomV2PlacementValue(normalized.x),
      y: snapRoomV2PlacementValue(normalized.y)
    }
  }

  const { minX, maxX, minY, maxY } = placeableArea
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const halfW = (maxX - minX) / 2
  const halfH = (maxY - minY) / 2
  let dx = (normalized.x - cx) / halfW
  let dy = (normalized.y - cy) / halfH
  const dist = Math.abs(dx) + Math.abs(dy)

  if (dist > 1) {
    dx /= dist
    dy /= dist
  }

  const clamped = {
    x: cx + dx * halfW,
    y: cy + dy * halfH
  }

  return {
    x: Math.max(minX, Math.min(maxX, snapRoomV2PlacementValue(clamped.x))),
    y: Math.max(minY, Math.min(maxY, snapRoomV2PlacementValue(clamped.y)))
  }
}

function snapRoomV2PlacementValue(value: number): number {
  return Math.round(value / ROOM_V2_PLACEMENT_SNAP_STEP) *
    ROOM_V2_PLACEMENT_SNAP_STEP
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FCEAF2"
  },
  safe: {
    flex: 1,
    paddingHorizontal: uiTheme.spacing.lg
  },
  editorContentFlex: {
    flex: 1
  },
  editorContent: {
    flexGrow: 1,
    paddingBottom: uiTheme.spacing.lg
  },
  roomLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(255, 250, 248, 0.78)",
    gap: 8,
    justifyContent: "center"
  },
  roomLoadingOverlayText: {
    color: "#6D4D61",
    fontFamily: "Nunito_700Bold",
    fontSize: 14
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: 10
  },
  cancelButton: {
    width: 40,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.42)",
    shadowColor: "#D9A0BF",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },
  actionButton: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.84)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.42)"
  },
  iconButtonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.94 }]
  },
  saveButton: {
    paddingHorizontal: 17,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5F9D",
    borderRadius: 20,
    shadowColor: "#FF4F98",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  saveButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0
  },
  titleBlock: {
    flex: 1
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  title: {
    color: "#35213A",
    ...uiTheme.font.heading,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 2,
    color: "#7D6175",
    ...uiTheme.font.caption,
    fontWeight: "700"
  },
  persistenceBanner: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: uiTheme.spacing.sm,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.lg,
    backgroundColor: "#FFF1F5",
    borderWidth: 1,
    borderColor: "#F1B8CA"
  },
  persistenceBannerText: {
    flex: 1,
    color: "#704054",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  persistenceRetryButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18
  },
  qaPreviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#FFF5DB",
    borderWidth: 1,
    borderColor: "#F2D795"
  },
  qaPreviewBannerText: {
    color: "#856120",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  stageWrap: {
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.sm,
    position: "relative"
  },
  selectedItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
    padding: 6,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: "rgba(222,161,192,0.42)"
  },
  selectedItemAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: "#FFF8FB"
  },
  selectedItemActionPrimary: {
    flex: 1.25,
    backgroundColor: uiTheme.colors.primaryDeep
  },
  selectedItemActionText: {
    flexShrink: 1,
    color: "#6E5064",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center"
  },
  selectedItemActionPrimaryText: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center"
  },
  selectedItemActionDangerText: {
    color: "#B83F5C"
  },
  roomWorldStatusPill: {
    position: "absolute",
    top: 18,
    left: 12,
    zIndex: 2,
    maxWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.5)",
    shadowColor: "#C98AA9",
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },
  roomWorldStatusText: {
    color: "#5F4058",
    fontSize: 11,
    fontWeight: "800"
  },
  roomImageWrapper: {
    width: "100%",
    position: "relative",
    borderRadius: 26,
    backgroundColor: "#FFF9FC",
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.48)",
    shadowColor: "#C98AA9",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: "hidden"
  },
  renderer: {
    backgroundColor: "#FFF9FC"
  },
  inventoryWrap: {
    marginTop: uiTheme.spacing.sm,
    minHeight: 338,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.46)",
    paddingTop: 9,
    paddingBottom: uiTheme.spacing.md,
    shadowColor: "#B57294",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5
  },
  inventoryHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    marginBottom: 8,
    borderRadius: 2,
    backgroundColor: "rgba(151, 107, 132, 0.34)"
  },
  shellPicker: {
    gap: uiTheme.spacing.xs
  },
  shellPickerLabel: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary
  },
  shellPickerOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs
  },
  shellPickerOption: {
    maxWidth: "48%",
    minHeight: 36,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    backgroundColor: "rgba(255,255,255,0.62)",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.sm
  },
  shellPickerOptionSelected: {
    backgroundColor: uiTheme.colors.primary,
    borderColor: uiTheme.colors.primary
  },
  shellPickerOptionText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  shellPickerOptionTextSelected: {
    color: "#FFFFFF"
  },
  inventoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: uiTheme.spacing.lg,
    marginBottom: uiTheme.spacing.sm
  },
  inventoryTitle: {
    color: "#3A253D",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  inventoryEyebrow: {
    marginTop: 2,
    color: "#896F80",
    fontSize: 11,
    fontWeight: "700"
  },
  inventorySubtitle: {
    color: "#A26484",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2
  },
  inventorySubtitleDisabled: {
    color: "#B9ABB4"
  },
  inventorySearchField: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: uiTheme.spacing.lg,
    marginBottom: uiTheme.spacing.sm,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#FFF7FA",
    borderWidth: 1,
    borderColor: "rgba(222,161,192,0.5)"
  },
  inventorySearchInput: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 0,
    color: "#4B3047",
    fontSize: 13,
    fontWeight: "600"
  },
  inventorySearchClear: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  categoryRail: {
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: uiTheme.spacing.lg,
    marginBottom: 8
  },
  categoryChip: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(219,164,191,0.52)",
    backgroundColor: "#FFF8FB"
  },
  categoryChipSelected: {
    borderColor: "#FF5F9D",
    backgroundColor: "#FF5F9D"
  },
  categoryChipText: {
    color: "#806579",
    fontSize: 11,
    fontWeight: "800"
  },
  categoryChipTextSelected: {
    color: "#FFFFFF"
  },
  inventoryScroll: {
    paddingHorizontal: uiTheme.spacing.md,
    gap: 10,
    paddingTop: 8
  },
  inventoryItemContainer: {
    alignItems: "center",
    justifyContent: "center"
  },
  inventoryItem: {
    width: 72,
    height: 52,
    backgroundColor: "#FFF9FC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,163,191,0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 7
  },
  inventoryItemLocked: {
    opacity: 0.46
  },
  inventoryItemPlaced: {
    borderColor: "rgba(42, 163, 111, 0.52)",
    backgroundColor: "#F0FCF6"
  },
  inventoryItemSelected: {
    borderColor: "#FF5F9D",
    backgroundColor: "#FFF0F6",
    shadowColor: "#FF5F9D",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  inventoryItemPressed: {
    backgroundColor: "#FCE1EC",
    borderColor: "#EE9CC2",
    transform: [{ scale: 0.94 }]
  },
  inventoryItemImage: {
    width: "100%",
    height: "100%"
  },
  inventoryItemName: {
    width: 72,
    marginTop: 4,
    color: "#5D4058",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  inventoryItemLock: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,55,78,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)"
  },
  inventoryItemPlacedMark: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#BAF0D1"
  },
  selectedInventoryPreview: {
    minHeight: 90,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    marginHorizontal: uiTheme.spacing.md,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(232,161,197,0.52)",
    backgroundColor: "#FFF7FB"
  },
  selectedInventoryContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  selectedInventoryImageWrap: {
    width: 60,
    height: 60,
    padding: 5,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBE5EF"
  },
  selectedInventoryImage: {
    width: "100%",
    height: "100%"
  },
  selectedInventoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5
  },
  selectedInventoryEyebrow: {
    color: "#B26C8B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  selectedInventoryHint: {
    color: "#8D7081",
    fontSize: 10,
    fontWeight: "700"
  },
  selectedInventoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  selectedInventoryName: {
    flex: 1,
    color: "#3C273E",
    fontSize: 13,
    fontWeight: "800"
  },
  selectedInventoryPlacedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#E4F8EC"
  },
  selectedInventoryPlacedText: {
    color: "#208458",
    fontSize: 9,
    fontWeight: "800"
  },
  rotationRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5
  },
  rotationOption: {
    minWidth: 36,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: "#FFF8FB",
    borderWidth: 1,
    borderColor: "rgba(222,161,192,0.38)"
  },
  rotationOptionSelected: {
    backgroundColor: "#FFE2EF",
    borderColor: "#FF83B8"
  },
  rotationOptionText: {
    color: "#806579",
    fontSize: 9,
    fontWeight: "800"
  },
  rotationOptionTextSelected: {
    color: "#C83B78"
  },
  placeSelectedInventoryButton: {
    minHeight: 38,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 11,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5F9D",
    shadowColor: "#FF4F98",
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  placeSelectedInventoryButtonDisabled: {
    opacity: 1,
    backgroundColor: "#F2E7ED",
    shadowOpacity: 0,
    elevation: 0
  },
  placeSelectedInventoryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  placeSelectedInventoryButtonTextDisabled: {
    color: "#A68D9C"
  },
  placeSelectedInventoryButtonPressed: {
    transform: [{ scale: 0.94 }]
  },
  inventoryEmptyState: {
    minWidth: 220,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.md
  },
  inventoryEmptyText: {
    color: "#806579",
    fontSize: 12,
    fontWeight: "700"
  },
  inventoryEmptyAction: {
    minHeight: 36,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#FFE2EF"
  },
  inventoryEmptyActionText: {
    color: "#C83B78",
    fontSize: 12,
    fontWeight: "900"
  }
})
