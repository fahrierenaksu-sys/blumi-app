import { useCallback, useMemo } from "react"
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native"
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
import {
  getEditRoomWorldStatus,
  getRoomEditorPlacementStateByRenderId,
  getRoomEditorSubtitle
} from "../features/roomV2/editor/roomEditorPresentationModel"
import { styles } from "../features/roomV2/editor/roomEditorStyles"
import { useRoomEditorSelection } from "../features/roomV2/editor/useRoomEditorSelection"
import { useRoomEditorSession } from "../features/roomV2/editor/useRoomEditorSession"
import { useRoomEditorStageLayout } from "../features/roomV2/editor/useRoomEditorStageLayout"
import { useRoomEditorInventory } from "../features/roomV2/editor/useRoomEditorInventory"
import { useRoomEditorPlacementGestures } from "../features/roomV2/editor/useRoomEditorPlacementGestures"
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
import { RoomEditorSelectedItemActions } from "../features/roomV2/editor/RoomEditorSelectedItemActions"
import { RoomEditorInventoryControls } from "../features/roomV2/editor/RoomEditorInventoryControls"
import { RoomEditorInventoryPreview } from "../features/roomV2/editor/RoomEditorInventoryPreview"
import { RoomEditorInventoryList } from "../features/roomV2/editor/RoomEditorInventoryList"
import { RoomEditorLoadingOverlay } from "../features/roomV2/editor/RoomEditorLoadingOverlay"

/**
 * My Room editor route. Composes the editor feature (features/roomV2/editor):
 * session and persistence, owned-furniture tray, stage placement gestures,
 * item actions, Shop placement intents, and confirmed save with exit guard.
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
    canPlaceAnotherRoomItem,
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
    isRoomDraftReady,
    editorSessionRef: session.editorSessionRef,
    saveUserRoomDecorConfirmed,
    selection
  })

  return (
    <View style={styles.root}>
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <RoomEditorTopBar
          copy={copy}
          subtitle={getRoomEditorSubtitle({
            copy,
            placementFeedback,
            selectedInstanceId,
            canRotateSelectedPlacedItem: itemActions.canRotateSelectedPlacedItem
          })}
          canUndo={editorSession.canUndo}
          isSavingRoom={isSavingRoom}
          onCancel={handleCancel}
          onUndo={session.handleUndoDraft}
          onSave={handleSave}
        />

        {persistenceState === "failed" && persistenceErrorMessage ? (
          <RoomEditorPersistenceBanner
            copy={copy}
            persistenceErrorMessage={persistenceErrorMessage}
            retryPersistence={retryPersistence}
          />
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
          <RoomEditorShellPicker
            copy={copy}
            shells={ACTIVE_ROOM_SHELL_CATALOG}
            selectedRoomShellId={draftDecor.roomShellId}
            onSelectRoomShell={itemActions.handleSelectRoomShell}
          />
        ) : null}

        <RoomEditorStage
          copy={copy}
          roomWorldStatus={roomWorldStatus}
          stageRef={stage.stageRef}
          selectedInstanceId={selectedInstanceId}
          onLayout={stage.handleRoomLayout}
          onPress={gestures.handleFloorTap}
          panHandlers={gestures.stagePanResponder.panHandlers}
          shell={scene.shell}
          renderItems={displayRenderItems}
          placementStateByRenderId={placementStateByRenderId}
          onItemTap={gestures.handleItemTap}
        />

        {placementPreview?.isValid || selectedInstanceId ? (
          <RoomEditorSelectedItemActions
            copy={copy}
            placementPreview={placementPreview}
            selectedInstanceId={selectedInstanceId}
            canRotateSelectedPlacedItem={itemActions.canRotateSelectedPlacedItem}
            commitTrayPlacementPreview={gestures.commitTrayPlacementPreview}
            handleRotate={itemActions.handleRotate}
            handleRemoveItem={itemActions.handleRemoveItem}
          />
        ) : null}

        <View style={styles.inventoryWrap}>
          <View style={styles.inventoryHandle} />
          <RoomEditorInventoryControls
            copy={copy}
            editorSession={editorSession}
            inventoryStatusLabel={inventoryState.inventoryStatusLabel}
            inventoryStatusFailed={inventoryState.inventoryViewState.isFailed}
            handleResetDraft={session.handleResetDraft}
            inventorySearchQuery={inventoryState.inventorySearchQuery}
            setInventorySearchQuery={inventoryState.setInventorySearchQuery}
            activeInventoryCategory={inventoryState.activeInventoryCategory}
            setActiveInventoryCategory={inventoryState.setActiveInventoryCategory}
          />
          <RoomEditorInventoryPreview
            copy={copy}
            inventoryViewState={inventoryState.inventoryViewState}
            inventoryStatusLabel={inventoryState.inventoryStatusLabel}
            selectedInventoryEntry={inventoryState.selectedInventoryEntry}
            selectedInventoryRotation={inventoryState.selectedInventoryRotation}
            selectedInventoryRotations={inventoryState.selectedInventoryRotations}
            selectedInventoryTransition={inventoryState.selectedInventoryTransition}
            canPlaceAnotherRoomItem={canPlaceAnotherRoomItem}
            canPlaceInventoryItem={inventoryState.canPlaceInventoryItem}
            handleSelectInventoryRotation={itemActions.handleSelectInventoryRotation}
            handleAddSelectedInventoryItem={itemActions.handleAddSelectedInventoryItem}
          />
          <RoomEditorInventoryList
            copy={copy}
            inventoryViewState={inventoryState.inventoryViewState}
            inventoryStatusLabel={inventoryState.inventoryStatusLabel}
            filteredInventoryEntries={inventoryState.filteredInventoryEntries}
            selectedInventoryEntry={inventoryState.selectedInventoryEntry}
            selectedInventoryRotation={inventoryState.selectedInventoryRotation}
            setSelectedInventoryItemId={inventoryState.setSelectedInventoryItemId}
            canPlaceAnotherRoomItem={canPlaceAnotherRoomItem}
            createInventoryItemPanHandlers={gestures.createInventoryItemPanHandlers}
            onBrowseShop={() => navigation.navigate("CosmeticShop", { initialShopMode: "home" })}
          />
        </View>
          </ScrollView>
          {!isRoomDraftReady ? (
            <RoomEditorLoadingOverlay copy={copy} />
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
