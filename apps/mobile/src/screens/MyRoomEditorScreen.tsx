import { useCallback, useMemo } from "react"
import { ScrollView, View } from "react-native"
import Animated from "react-native-reanimated"
import { useReducedMotion } from "../ui/animations"
import { getBottomPanelEntering } from "../ui/bottomPanelEntrance"
import { WardrobeGlass } from "../features/avatarV2/wardrobe/WardrobeGlass"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useInventoryStore } from "../features/inventory/inventoryStore"
import { DEFAULT_ROOM_V2_SHELL_ID } from "../features/roomV2/roomV2Catalog"
import {
  resolveRoomV2Scene,
  upsertRoomV2RenderItemSorted
} from "../features/roomV2/roomV2Selectors"
import { getMyRoomEditorCopy } from "../features/roomV2/myRoomCopy"
import { getAppLocale } from "../features/session/authLocale"
import { canPlaceRoomV2ItemInstance } from "../features/roomV2/roomV2DecorActions"
import { useRoomV2 } from "../features/roomV2/state/RoomV2Provider"
import { getRoomWorldMotionReadinessSummary } from "../features/roomWorld/roomWorldDiagnostics"
import { createRoomWorldGeometryFromRoomV2Scene } from "../features/roomWorld/roomWorldRoomV2Projection"
import {
  ACTIVE_ROOM_FURNITURE_CATALOG,
  ACTIVE_ROOM_SHELL_CATALOG,
  type MyRoomEditorScreenProps
} from "../features/roomV2/editor/roomEditorCatalog"
import { EDIT_ROOM_AVATAR_SPAWN } from "../features/roomV2/editor/roomEditorPlacementModel"
import { createRoomEditorFloorOverlay } from "../features/roomV2/editor/roomEditorFloorGridModel"
import {
  getEditRoomWorldStatus,
  getRoomEditorPlacementStateByRenderId
} from "../features/roomV2/editor/roomEditorPresentationModel"
import {
  canToggleRoomEditorStageZoom,
  getRoomEditorCapsuleMode,
  getRoomEditorHighlightedTrayItemId,
  getRoomEditorStageFrame
} from "../features/roomV2/editor/roomEditorDockModel"
import {
  ROOM_EDITOR_DOCK_LAYOUT,
  ROOM_EDITOR_FADE_IN,
  ROOM_EDITOR_FADE_OUT
} from "../features/roomV2/editor/roomEditorMotion"
import { styles } from "../features/roomV2/editor/roomEditorStyles"
import { useRoomEditorDock } from "../features/roomV2/editor/useRoomEditorDock"
import { useRoomEditorSelection } from "../features/roomV2/editor/useRoomEditorSelection"
import { useRoomEditorSession } from "../features/roomV2/editor/useRoomEditorSession"
import { useRoomEditorStageLayout } from "../features/roomV2/editor/useRoomEditorStageLayout"
import { useRoomEditorInventory } from "../features/roomV2/editor/useRoomEditorInventory"
import { useRoomEditorPlacementGestures } from "../features/roomV2/editor/useRoomEditorPlacementGestures"
import { useRoomEditorDragGestures } from "../features/roomV2/editor/useRoomEditorDragGestures"
import { useRoomEditorItemActions } from "../features/roomV2/editor/useRoomEditorItemActions"
import {
  useShopPlacementIntent,
  useShopPlacementIntentMemory
} from "../features/roomV2/editor/useShopPlacementIntent"
import { useRoomEditorSave } from "../features/roomV2/editor/useRoomEditorSave"
import { RoomEditorTopBar } from "../features/roomV2/editor/RoomEditorTopBar"
import { RoomEditorPersistenceBanner } from "../features/roomV2/editor/RoomEditorPersistenceBanner"
import { RoomEditorShellPicker } from "../features/roomV2/editor/RoomEditorShellPicker"
import { RoomEditorStage } from "../features/roomV2/editor/RoomEditorStage"
import { RoomEditorStageTools } from "../features/roomV2/editor/RoomEditorStageTools"
import { RoomEditorStageNotice } from "../features/roomV2/editor/RoomEditorStageNotice"
import { ROOM_EDITOR_ALL_CATEGORY_IDS } from "../features/roomV2/editor/RoomEditorCategoryTabs"
import { RoomEditorSelectedItemActions } from "../features/roomV2/editor/RoomEditorSelectedItemActions"
import { RoomEditorInventoryControls } from "../features/roomV2/editor/RoomEditorInventoryControls"
import { RoomEditorInventoryList } from "../features/roomV2/editor/RoomEditorInventoryList"
import { RoomEditorLoadingOverlay } from "../features/roomV2/editor/RoomEditorLoadingOverlay"
import { RoomEditorDragGhost } from "../features/roomV2/editor/RoomEditorDragGhost"

/**
 * My Room editor route ("Yüzen Dock"). Composes the editor feature
 * (features/roomV2/editor): session and persistence, the edge-to-edge room
 * with its glass controls and selection capsule, the floating owned-furniture
 * dock, stage tap placement, drag-to-move (stage and tray), item actions,
 * Shop placement intents, and confirmed save with exit guard.
 * Hook order is deliberate: effects run in the order the hooks are called.
 */
export function MyRoomEditorScreen(props: MyRoomEditorScreenProps & {
  inventoryOwnerUserId?: string
  requireServerInventory?: boolean
}) {
  const { navigation, route } = props
  const locale = getAppLocale()
  const copy = getMyRoomEditorCopy(locale)
  const {
    userRoomDecor,
    confirmedPersistedRoomDecor,
    saveUserRoomDecorConfirmed,
    persistenceState,
    persistenceErrorMessage,
    retryPersistence
  } = useRoomV2()
  const { inventory, hydrationStatus: inventoryHydrationStatus, ownsRoomItem } = useInventoryStore(
    props.inventoryOwnerUserId,
    props.requireServerInventory
  )
  const placementItemId = route.params?.placementItemId
  const lastAppliedPlacementItemId = useShopPlacementIntentMemory(navigation)

  const selection = useRoomEditorSelection()
  const { selectedInstanceId, placementFeedback, placementPreview } = selection
  const session = useRoomEditorSession({
    userRoomDecor,
    confirmedPersistedRoomDecor,
    persistenceState,
    copy,
    selection
  })
  const { editorSession, draftDecor, setDraftDecor, isRoomDraftReady } = session
  const stage = useRoomEditorStageLayout()
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
  const placementStateByRenderId = useMemo(
    () => getRoomEditorPlacementStateByRenderId(placementPreview),
    [placementPreview]
  )
  // Recomputed once per snapped cell (the preview), never per drag frame.
  const floorOverlay = useMemo(
    () => createRoomEditorFloorOverlay({
      shell: scene.shell,
      preview: placementPreview,
      stage: stage.roomLayout
    }),
    [placementPreview, scene.shell, stage.roomLayout]
  )
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

  const inventoryState = useRoomEditorInventory({
    inventory,
    inventoryHydrationStatus,
    requireServerInventory: props.requireServerInventory,
    placedItems: draftDecor.placedItems,
    locale,
    copy
  })
  const gestures = useRoomEditorPlacementGestures({
    copy,
    scene,
    placedItems: draftDecor.placedItems,
    setDraftDecor,
    selection,
    stage,
    inventory: inventoryState
  })
  const drag = useRoomEditorDragGestures({
    copy,
    scene,
    placedItems: draftDecor.placedItems,
    canPlaceAnotherRoomItem,
    commitTrayPlacementPreview: gestures.commitTrayPlacementPreview,
    selection,
    stage,
    inventory: inventoryState
  })
  const itemActions = useRoomEditorItemActions({
    copy,
    scene,
    draftDecor,
    setDraftDecor,
    canPlaceAnotherRoomItem,
    ownsRoomItem,
    selection,
    inventory: inventoryState
  })
  useShopPlacementIntent({
    placementItemId,
    lastAppliedPlacementItemId,
    canPlaceInventoryItem: inventoryState.canPlaceInventoryItem,
    isRoomDraftReady,
    addDraftItem: itemActions.addDraftItem,
    setSelectedInventoryItemId: inventoryState.setSelectedInventoryItemId,
    setPlacementFeedback: selection.setPlacementFeedback
  })
  const { isSavingRoom, handleSave, handleCancel } = useRoomEditorSave({
    navigation,
    copy,
    draftDecor,
    isDirty: editorSession.isDirty,
    isRoomDraftReady,
    editorSessionRef: session.editorSessionRef,
    saveUserRoomDecorConfirmed,
    cancelActiveDrag: drag.cancelActiveDrag,
    selection
  })

  const dock = useRoomEditorDock()
  const reduceMotion = useReducedMotion()
  const dockLayout = reduceMotion ? undefined : ROOM_EDITOR_DOCK_LAYOUT
  const fadeIn = reduceMotion ? undefined : ROOM_EDITOR_FADE_IN
  const fadeOut = reduceMotion ? undefined : ROOM_EDITOR_FADE_OUT

  const stageAreaInput = {
    availableWidth: dock.stageArea.width,
    availableHeight: dock.stageArea.height,
    aspectRatio: scene.shell
      ? scene.shell.canvasSize.width / scene.shell.canvasSize.height
      : 0
  }
  const stageFrame = getRoomEditorStageFrame({ ...stageAreaInput, zoom: dock.zoom })
  const selectedPlacedItemId = draftDecor.placedItems.find(
    (placedItem) => placedItem.instanceId === selectedInstanceId
  )?.itemId
  const selectedInventoryEntry = inventoryState.selectedInventoryEntry
  const capsuleMode = getRoomEditorCapsuleMode({
    selectedInstanceId,
    hasValidPlacementPreview: placementPreview?.isValid === true,
    pickedTrayItemId: dock.pickedTrayItemId,
    selectedInventoryEntry,
    canPlaceSelectedInventoryItem: selectedInventoryEntry
      ? canPlaceAnotherRoomItem(selectedInventoryEntry.item.id)
      : false
  })
  const selectedRenderItem = displayRenderItems.find(
    (item) => item.renderId === (selectedInstanceId ?? placementPreview?.item.renderId)
  )
  const capsuleItemName = capsuleMode === "tray"
    ? selectedInventoryEntry?.item.name
    : selectedRenderItem?.kind === "furniture" ? selectedRenderItem.name : undefined
  // Every category keeps its tab, owned or not, like the wardrobe.
  const categoryIds = ROOM_EDITOR_ALL_CATEGORY_IDS

  const { setPickedTrayItemId } = dock
  const { setSelectedInventoryItemId } = inventoryState
  const { measureStageWindow } = stage
  const handlePickTrayItem = useCallback((itemId: string) => {
    setPickedTrayItemId(itemId)
    setSelectedInventoryItemId(itemId)
  }, [setPickedTrayItemId, setSelectedInventoryItemId])

  return (
    <View style={styles.root}>
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <RoomEditorTopBar
          copy={copy}
          isSavingRoom={isSavingRoom}
          onCancel={handleCancel}
          onSave={handleSave}
        />

        {persistenceState === "failed" && persistenceErrorMessage ? (
          <RoomEditorPersistenceBanner
            copy={copy}
            persistenceErrorMessage={persistenceErrorMessage}
            retryPersistence={retryPersistence}
          />
        ) : null}

        <View style={styles.editorContentFlex}>
          {/* The page only scrolls when a short screen or large text needs it. */}
          <ScrollView
            contentContainerStyle={styles.editorContent}
            keyboardShouldPersistTaps="handled"
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
            // Pointer mapping uses the room's window position; refresh it
            // whenever the page comes to rest somewhere else.
            onScrollEndDrag={measureStageWindow}
            onMomentumScrollEnd={measureStageWindow}
            pointerEvents={isRoomDraftReady ? "auto" : "none"}
            accessibilityElementsHidden={!isRoomDraftReady}
            importantForAccessibility={isRoomDraftReady ? "auto" : "no-hide-descendants"}
          >
            {ACTIVE_ROOM_SHELL_CATALOG.length > 1 ? (
              <RoomEditorShellPicker
                copy={copy}
                shells={ACTIVE_ROOM_SHELL_CATALOG}
                selectedRoomShellId={draftDecor.roomShellId}
                onSelectRoomShell={itemActions.handleSelectRoomShell}
              />
            ) : null}

            <Animated.View
              layout={dockLayout}
              style={styles.stageRegion}
              onLayout={dock.handleStageAreaLayout}
            >
              <RoomEditorStage
                copy={copy}
                frame={stageFrame}
                stageRef={stage.stageRef}
                stageAnimatedRef={drag.stageAnimatedRef}
                selectedInstanceId={selectedInstanceId}
                onLayout={stage.handleRoomLayout}
                onPress={gestures.handleFloorTap}
                dragGesture={drag.stageDragGesture}
                shell={scene.shell}
                renderItems={displayRenderItems}
                placementStateByRenderId={placementStateByRenderId}
                floorOverlay={floorOverlay}
                onItemTap={gestures.handleItemTap}
              />
              <RoomEditorStageNotice
                placementFeedback={placementFeedback}
                roomWorldWarning={roomWorldReadiness.level === "ready" ? undefined : roomWorldStatus}
              />
              <RoomEditorStageTools
                copy={copy}
                canUndo={editorSession.canUndo}
                zoom={dock.zoom}
                canToggleZoom={canToggleRoomEditorStageZoom(stageAreaInput)}
                onUndo={session.handleUndoDraft}
                onToggleZoom={dock.toggleZoom}
              />
              {capsuleMode !== "hidden" && capsuleItemName ? (
                <Animated.View
                  entering={fadeIn}
                  exiting={fadeOut}
                  style={styles.capsuleSlot}
                >
                  <RoomEditorSelectedItemActions
                    copy={copy}
                    mode={capsuleMode}
                    itemName={capsuleItemName}
                    placementPreview={placementPreview}
                    selectedInstanceId={selectedInstanceId}
                    canRotateSelectedPlacedItem={itemActions.canRotateSelectedPlacedItem}
                    commitTrayPlacementPreview={gestures.commitTrayPlacementPreview}
                    handleRotate={itemActions.handleRotate}
                    handleRemoveItem={itemActions.handleRemoveItem}
                    trayRotation={inventoryState.selectedInventoryRotation}
                    trayRotations={inventoryState.selectedInventoryRotations}
                    handleSelectInventoryRotation={itemActions.handleSelectInventoryRotation}
                    handlePlaceTrayItem={itemActions.handleAddSelectedInventoryItem}
                  />
                </Animated.View>
              ) : null}
            </Animated.View>

            {/* The dock rises softly into place when the editor opens (same entrance as the wardrobe panel). */}
            <Animated.View layout={dockLayout} entering={getBottomPanelEntering(reduceMotion)}>
              <WardrobeGlass
                tone="panel"
                radius={30}
                style={styles.dockShell}
                contentStyle={styles.dockContent}
              >
                <RoomEditorInventoryControls
                  copy={copy}
                  editorSession={editorSession}
                  isExpanded={dock.isExpanded}
                  onToggleExpanded={dock.toggleExpanded}
                  categoryIds={categoryIds}
                  inventoryEntryCount={inventoryState.inventoryEntries.length}
                  inventoryStatusLabel={inventoryState.inventoryStatusLabel}
                  inventoryStatusFailed={inventoryState.inventoryViewState.isFailed}
                  inventoryStatusLoading={inventoryState.inventoryViewState.isLoading}
                  handleResetDraft={session.handleResetDraft}
                  activeInventoryCategory={inventoryState.activeInventoryCategory}
                  setActiveInventoryCategory={inventoryState.setActiveInventoryCategory}
                />
                <RoomEditorInventoryList
                  copy={copy}
                  isExpanded={dock.isExpanded}
                  filterKey={inventoryState.activeInventoryCategory}
                  inventoryViewState={inventoryState.inventoryViewState}
                  inventoryStatusLabel={inventoryState.inventoryStatusLabel}
                  filteredInventoryEntries={inventoryState.filteredInventoryEntries}
                  highlightedItemId={getRoomEditorHighlightedTrayItemId({
                    selectedInventoryItemId: selectedInventoryEntry?.item.id,
                    selectedPlacedItemId,
                    pickedTrayItemId: dock.pickedTrayItemId
                  })}
                  selectedInventoryEntry={selectedInventoryEntry}
                  selectedInventoryRotation={inventoryState.selectedInventoryRotation}
                  setSelectedInventoryItemId={handlePickTrayItem}
                  canPlaceAnotherRoomItem={canPlaceAnotherRoomItem}
                  createInventoryItemDragGesture={drag.createTrayDragGesture}
                  onBrowseShop={() => navigation.navigate("CosmeticShop", { initialShopMode: "home" })}
                  onTrayFeedback={selection.setPlacementFeedback}
                />
              </WardrobeGlass>
            </Animated.View>
          </ScrollView>
          {!isRoomDraftReady ? (
            <RoomEditorLoadingOverlay copy={copy} />
          ) : null}
        </View>
      </SafeAreaView>
      <RoomEditorDragGhost ghost={drag.ghost} values={drag.ghostValues} />
    </View>
  )
}
