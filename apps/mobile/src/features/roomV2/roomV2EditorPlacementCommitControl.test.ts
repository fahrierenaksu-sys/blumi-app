import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const editorSource = readFileSync(
  resolve(process.cwd(), "src/screens/MyRoomEditorScreen.tsx"),
  "utf8"
)
// The editor screen composes the modules in features/roomV2/editor; each
// assertion below targets the module that now owns the behaviour it pins.
const editorModuleDirectory = resolve(process.cwd(), "src/features/roomV2/editor")
const readEditorModule = (fileName: string): string =>
  readFileSync(resolve(editorModuleDirectory, fileName), "utf8")
const editorCatalogSource = readEditorModule("roomEditorCatalog.ts")
const editorStylesSource = readEditorModule("roomEditorStyles.ts")
const editorPlacementModelSource = readEditorModule("roomEditorPlacementModel.ts")
const editorSessionHookSource = readEditorModule("useRoomEditorSession.ts")
const editorInventoryHookSource = readEditorModule("useRoomEditorInventory.ts")
const editorGesturesSource = readEditorModule("useRoomEditorPlacementGestures.ts")
const editorItemActionsSource = readEditorModule("useRoomEditorItemActions.ts")
const editorShopIntentSource = readEditorModule("useShopPlacementIntent.ts")
const editorSaveSource = readEditorModule("useRoomEditorSave.ts")
const editorTopBarSource = readEditorModule("RoomEditorTopBar.tsx")
const editorStageSource = readEditorModule("RoomEditorStage.tsx")
const editorSelectedActionsSource = readEditorModule("RoomEditorSelectedItemActions.tsx")
const editorInventoryControlsSource = readEditorModule("RoomEditorInventoryControls.tsx")
const editorInventoryListSource = readEditorModule("RoomEditorInventoryList.tsx")
const editorInventoryCardSource = readEditorModule("InventoryCatalogCard.tsx")
// Screen plus every production editor module, for surface-wide negative checks.
const editorSurfaceSource = [
  editorSource,
  ...readdirSync(editorModuleDirectory)
    .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$|TestFixtures\.ts$/.test(fileName))
    .map(readEditorModule)
].join("\n")
const editorInventoryEntriesSource = readFileSync(
  resolve(process.cwd(), "src/screens/useRoomEditorInventoryEntries.ts"),
  "utf8"
)
const rendererSource = readFileSync(
  resolve(process.cwd(), "src/features/roomV2/components/RoomRenderer2D.tsx"),
  "utf8"
)
const shopSource = readFileSync(
  resolve(process.cwd(), "src/screens/CosmeticShopScreen.tsx"),
  "utf8"
)
const shopCopySource = readFileSync(
  resolve(process.cwd(), "src/features/shop/shopCopy.ts"),
  "utf8"
)
const liveRoomSource = readFileSync(
  resolve(process.cwd(), "src/screens/MyRoomScreen.tsx"),
  "utf8"
)
const navigatorSource = readFileSync(
  resolve(process.cwd(), "src/navigation/RootNavigator.tsx"),
  "utf8"
)
const editorCopySource = readFileSync(
  resolve(process.cwd(), "src/features/roomV2/myRoomCopy.ts"),
  "utf8"
)

test("the editor screen composes the room editor feature modules", () => {
  for (const moduleName of [
    "roomEditorCatalog",
    "roomEditorPlacementModel",
    "roomEditorPresentationModel",
    "roomEditorStyles",
    "useRoomEditorSelection",
    "useRoomEditorSession",
    "useRoomEditorStageLayout",
    "useRoomEditorInventory",
    "useRoomEditorPlacementGestures",
    "useRoomEditorItemActions",
    "useShopPlacementIntent",
    "useRoomEditorSave",
    "RoomEditorTopBar",
    "RoomEditorPersistenceBanner",
    "RoomEditorShellPicker",
    "RoomEditorStage",
    "RoomEditorSelectedItemActions",
    "RoomEditorInventoryControls",
    "RoomEditorInventoryList",
    "RoomEditorLoadingOverlay"
  ]) {
    assert.match(
      editorSource,
      new RegExp(`from "\\.\\./features/roomV2/editor/${moduleName}"`),
      `MyRoomEditorScreen must import ${moduleName}`
    )
  }
  assert.match(editorInventoryListSource, /import \{ InventoryCatalogCard \} from "\.\/InventoryCatalogCard"/)
  // Effects run in hook-call order; keep the original listener/effect sequence.
  assert.match(
    editorSource,
    /useShopPlacementIntentMemory\(navigation\)[\s\S]*useRoomEditorSession\(\{[\s\S]*useRoomEditorInventory\(\{[\s\S]*useShopPlacementIntent\(\{[\s\S]*useRoomEditorSave\(\{/
  )
})

test("room editor exposes an explicit control that commits a valid placement preview", () => {
  assert.match(editorSelectedActionsSource, /accessibilityLabel=\{copy\.confirmPlacement\}/)
  assert.match(editorCopySource, /confirmPlacement:\s*"Confirm room placement"/)
  assert.match(editorSelectedActionsSource, /commitTrayPlacementPreview\(placementPreview\)/)
  assert.match(editorSource, /commitTrayPlacementPreview=\{gestures\.commitTrayPlacementPreview\}/)
})

test("Save commits the latest valid preview before validating and persisting the room", () => {
  assert.match(
    editorSaveSource,
    /const saveDecision = createRoomV2EditorSaveDecor\(draftDecor, furniturePreview\)/
  )
  assert.match(editorSaveSource, /const decorToSave = saveDecision\.decor/)
  assert.match(
    editorSaveSource,
    /validateRoomV2DraftPlacements\(\{[\s\S]*decor: decorToSave/
  )
  assert.match(
    editorSaveSource,
    /const confirmedSave = await saveRoomV2EditorDraftConfirmed\([\s\S]*decorToSave,[\s\S]*saveUserRoomDecorConfirmed/
  )
  assert.match(
    editorSaveSource,
    /if \(confirmedSave\.status !== "saved"\)[\s\S]*setPlacementFeedback\(confirmedSave\.feedback\)/
  )
  assert.match(
    editorSaveSource,
    /if \(confirmedSave\.status !== "saved"\)[\s\S]*return[\s\S]*allowEditorExitRef\.current = true/
  )
  assert.match(
    editorSaveSource,
    /if \(saveDecision\.status === "invalid_preview"\)[\s\S]*setPlacementFeedback\(copy\.feedback\.moveHighlighted\)/
  )
  assert.match(editorCopySource, /moveHighlighted:\s*"Move the highlighted item before saving\."/)
})

test("room editor catalog supports selecting, rotating, and explicitly placing a room piece", () => {
  // The floating dock has no search field (no keyboard over the room):
  // pieces are reached through the category tabs and sideways paging.
  assert.doesNotMatch(editorSurfaceSource, /<TextInput/)
  assert.doesNotMatch(editorSource, /KeyboardAvoidingView/)
  assert.match(editorInventoryListSource, /onPreviewItem=\{setSelectedInventoryItemId\}/)
  assert.match(editorInventoryCardSource, /accessibilityLabel=\{previewLabel\}/)
  assert.match(editorInventoryListSource, /previewLabel=\{copy\.previewItem\(entry\.item\.name\)\}/)
  assert.match(editorSelectedActionsSource, /accessibilityLabel=\{copy\.chooseRotation\(copy\.rotationLabels\[nextTrayRotation\], itemName\)\}/)
  assert.match(editorSelectedActionsSource, /accessibilityLabel=\{copy\.placeItem\(itemName\)\}/)
  assert.match(editorSource, /handlePlaceTrayItem=\{itemActions\.handleAddSelectedInventoryItem\}/)
  assert.match(editorItemActionsSource, /addDraftItem\(\s*selectedInventoryEntry\.item\.id,\s*true,\s*selectedInventoryRotation\s*\)/)
  assert.match(editorInventoryCardSource, /resolveRoomV2InventoryPreviewSource\(item, previewRotation\)/)
  assert.match(editorPlacementModelSource, /rotation: input\.rotation/)
  assert.match(editorInventoryCardSource, /createDragGesture\(item, owned, placed, previewRotation\)/)
})

test("direction buttons persist an exact valid rotation for the selected placed item", () => {
  assert.match(
    editorItemActionsSource,
    /const applySelectedItemRotation = useCallback\(\(rotation: PlacedRoomItem\["rotation"\]\)/
  )
  assert.match(
    editorItemActionsSource,
    /patchRoomV2PlacedItem\(current, selectedInstanceId, \{ rotation \}\)/
  )
  assert.match(
    editorSelectedActionsSource,
    /onPress=\{\(\) => handleSelectInventoryRotation\(nextTrayRotation\)\}/
  )
  assert.match(
    editorSource,
    /handleSelectInventoryRotation=\{itemActions\.handleSelectInventoryRotation\}/
  )
  assert.match(
    editorItemActionsSource,
    /selectedPlacedItem\?\.itemId !== selectedInventoryEntry\.item\.id[\s\S]*setSelectedInventoryRotation\(rotation\)/
  )
})

test("a directional item is placed when its current pose is valid, even if another rotation needs repositioning", () => {
  assert.doesNotMatch(
    editorSurfaceSource,
    /preview\.isValid && hasRotationSafeDefaultPlacement\(/,
    "default placement must not reject a valid current pose because another rotation needs repositioning"
  )
})

test("room editor uses only the production Room catalog", () => {
  assert.match(editorCatalogSource, /const ACTIVE_ROOM_FURNITURE_CATALOG = ROOM_V2_FURNITURE_CATALOG/)
  assert.match(editorCatalogSource, /const ACTIVE_ROOM_SHELL_CATALOG = ROOM_V2_SHELL_CATALOG/)
  assert.doesNotMatch(editorSurfaceSource, /resolveRoomV3QaFurnitureCatalogRuntime/)
  assert.doesNotMatch(editorSurfaceSource, /ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG/)
})

test("shop placement intents are applied once per product ID, even when the editor screen is reused", () => {
  assert.match(editorShopIntentSource, /const lastAppliedPlacementItemId = useRef<string \| undefined>\(undefined\)/)
  assert.match(editorShopIntentSource, /lastAppliedPlacementItemId\.current === placementItemId/)
  assert.match(editorShopIntentSource, /lastAppliedPlacementItemId\.current = placementItemId/)
  assert.match(editorShopIntentSource, /setSelectedInventoryItemId\(placementItemId\)/)
  assert.match(editorShopIntentSource, /navigation\.addListener\("blur", \(\) => \{\s*lastAppliedPlacementItemId\.current = undefined/)
})

test("passive Shop placement intents do not surface a duplicate-placement error", () => {
  assert.match(
    editorItemActionsSource,
    /if \(feedback\) \{\s*hapticError\(\)\s*setPlacementFeedback\(copy\.feedback\.alreadyPlaced\)/
  )
  assert.match(editorShopIntentSource, /setPlacementFeedback\(undefined\)\s*if \(addDraftItem\(placementItemId, false\)\)/)
})

test("editor keeps controls reachable on short screens and only rotates through supplied asset views", () => {
  assert.match(editorSource, /<ScrollView[\s\S]*keyboardShouldPersistTaps="handled"/)
  // The tray direction control offers only the piece's supplied asset views.
  assert.match(editorSelectedActionsSource, /getNextRoomEditorTrayRotation\(trayRotations, trayRotation\)/)
  assert.match(editorSource, /trayRotations=\{inventoryState\.selectedInventoryRotations\}/)
  assert.match(editorInventoryHookSource, /getRoomV2FurnitureRotationOptions\(selectedInventoryEntry\.item\)/)
  assert.match(editorItemActionsSource, /const rotationOptions = getRoomV2FurnitureRotationOptions\(furnitureItem\)/)
  assert.match(editorItemActionsSource, /rotationOptions\[\(currentRotationIndex \+ 1\) % rotationOptions\.length\]/)
  assert.match(editorItemActionsSource, /const canRotateSelectedPlacedItem = hasMultipleRoomV2RotationOptions/)
  assert.match(editorSelectedActionsSource, /\{selectedInstanceId && canRotateSelectedPlacedItem \? \(\s*<Pressable[\s\S]*accessibilityLabel=\{copy\.rotateSelected\}/)
})

test("selected room furniture has a named primary placement action instead of an ambiguous add control", () => {
  assert.match(
    editorSelectedActionsSource,
    /\{mode === "tray" \? \(\s*<Pressable[\s\S]*?accessibilityLabel=\{copy\.placeItem\(itemName\)\}[\s\S]*?\{copy\.placeInRoom\}/
  )
})

test("the tray direction control and Place sit side by side in the capsule, not in the dock", () => {
  assert.match(
    editorSelectedActionsSource,
    /\{nextTrayRotation \? \(\s*<Pressable[\s\S]*?<\/Pressable>\s*\) : null\}\s*\{mode === "tray" \? \(/
  )
  assert.doesNotMatch(editorSource, /RoomEditorInventoryPreview/)
})

test("editor uses the room-first collection hierarchy instead of the legacy decorate header", () => {
  assert.match(editorTopBarSource, /<Text[^>]*style=\{styles\.title\}\s*>\s*\{copy\.title\}\s*<\/Text>/)
  assert.match(editorInventoryControlsSource, /<Text[^>]*style=\{styles\.inventoryTitle\}\s*>\s*\{copy\.collectionTitle\}\s*<\/Text>/)
  // "Yüzen Dock": the collection lives in one floating glass panel under the
  // room (no sheet handle): header, category tabs and cards only.
  assert.match(
    editorSource,
    /<WardrobeGlass\s+tone="panel"[\s\S]*?<RoomEditorInventoryControls[\s\S]*?\/>\s*<RoomEditorInventoryList/
  )
  // The compact/all capsule replaces the old text toggle.
  assert.match(editorInventoryControlsSource, /expanded \? copy\.showAllPieces : copy\.collectionTitle/)
  assert.match(editorInventoryControlsSource, /onPress=\{active \? undefined : onToggleExpanded\}/)
  assert.match(editorStylesSource, /dockShell: \{[\s\S]*?borderRadius: 30/)
  assert.match(editorSelectedActionsSource, /\{copy\.placeInRoom\}/)
  assert.doesNotMatch(editorSurfaceSource, />Decorate<\/Text>/)
})

test("editor waits for persisted decor and syncs the inspector when a staged item is selected", () => {
  assert.match(editorSource, /persistenceState/)
  assert.match(editorSource, /pointerEvents=\{isRoomDraftReady \? "auto" : "none"\}/)
  assert.match(editorShopIntentSource, /if \(!canPlaceInventoryItem \|\| !isRoomDraftReady\) return\s*lastAppliedPlacementItemId\.current = placementItemId/)
  assert.match(editorSaveSource, /if \(!isRoomDraftReady\) \{\s*hapticError\(\)/)
  assert.match(editorSessionHookSource, /const isRoomDraftReady = persistenceState !== "loading" && hasHydratedDraft\.current/)
  assert.match(editorGesturesSource, /setSelectedInventoryItemId\(placedItem\?\.itemId\)/)
  assert.match(editorGesturesSource, /setSelectedInventoryRotation\(item\.rotation\)/)
})

test("stage furniture is announced as an editor selection rather than an in-room interaction", () => {
  assert.match(editorStageSource, /<Pressable\s+accessible=\{Boolean\(selectedInstanceId\)\}\s+accessibilityRole="button"\s+accessibilityLabel=\{copy\.stageLabel\}/)
  assert.match(editorStageSource, /itemInteractionMode="edit"/)
  // Labels are localized in roomV2Accessibility (ROOM-14); the renderer passes the mode.
  assert.match(rendererSource, /mode: itemInteractionMode/)
  const accessibilitySource = readFileSync(resolve(process.cwd(), "src/features/roomV2/roomV2Accessibility.ts"), "utf8")
  assert.match(accessibilitySource, /input\.mode === "edit"/)
  assert.match(accessibilitySource, /Select \$\{name\} to move, rotate, or remove/)
})

test("ROOM-01: the in-room avatar is tappable without leaving its UI-thread walk frame", () => {
  assert.match(rendererSource, /onItemTap=\{shouldRoomV2ItemReceiveTap\(\{ kind: item\.kind, mode: itemInteractionMode \}\) \? onItemTap : undefined\}/)
  // The live frame always wraps a walking avatar; the tap target sits inside it.
  assert.match(rendererSource, /const Wrapper = liveAvatarPosition \? RoomRendererLiveAvatarFrame : isTouchInteractive \? Pressable : View/)
  assert.match(rendererSource, /\{tapsInsideLiveFrame \? \(\s*<Pressable[\s\S]*?onPress=\{\(event\) => \{ event\.stopPropagation\(\); onItemTap\?\.\(item\) \}\}/)
  assert.match(rendererSource, /pointerEvents=\{tapsInsideLiveFrame \? "box-none" : pointerEvents\}/)
})

test("editor catalog contains only room furniture the current user owns", () => {
  assert.match(
    editorInventoryHookSource,
    /useRoomEditorInventoryEntries\(\s*ACTIVE_ROOM_FURNITURE_CATALOG,\s*inventory\.ownedRoomItemIds,\s*QA_OWNED_ROOM_ITEM_IDS\s*\)/
  )
  assert.match(
    editorInventoryEntriesSource,
    /ownedIds\.has\(item\.id\) \|\| qaOwnedItemIds\.has\(item\.id\)/
  )
})

test("an empty owned collection takes the user to the Home section of Shop", () => {
  assert.match(
    editorSource,
    /onBrowseShop=\{\(\) => navigation\.navigate\("CosmeticShop", \{ initialShopMode: "home" \}\)\}/
  )
  assert.match(
    editorInventoryListSource,
    /inventoryViewState\.emptyState === "no-pieces" \? \(\s*<Pressable[\s\S]*accessibilityLabel=\{copy\.browseShop\}\s*onPress=\{onBrowseShop\}/
  )
})

test("reused Shop routes honor a request to open the Home section", () => {
  assert.match(
    shopSource,
    /useEffect\(\(\) => \{\s*const requestedShopMode = props\.route\.params\?\.initialShopMode/
  )
  assert.match(shopSource, /setShopMode\(requestedShopMode\)/)
  assert.match(shopSource, /setSelectedCategoryId\(getDefaultShopCategoryId\(requestedShopMode\)\)/)
})

test("the live Home Shop keeps the public Blumi brand instead of a legacy store label", () => {
  assert.match(
    shopSource,
    /<Text\s+accessibilityRole="header"\s+testID="shop-header-brand"\s+style=\{styles\.headerEyebrow\}\s*>\s*\{copy\.brand\}\s*<\/Text>/
  )
  assert.match(shopCopySource, /brand:\s*"Blumi Store"/)
  assert.doesNotMatch(shopSource, />Vibe Store<\/Text>/)
  assert.doesNotMatch(shopCopySource, /brand:\s*"Vibe Store"/)
})

test("production My Room surfaces contain no historical candidate catalog ingress", () => {
  for (const source of [editorSurfaceSource, liveRoomSource, navigatorSource]) {
    assert.doesNotMatch(source, /ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG/)
    assert.doesNotMatch(source, /resolveRoomVNextFullWaveCandidateCatalog/)
    assert.doesNotMatch(source, /resolveRoomV3QaFurnitureCatalogRuntime/)
    assert.doesNotMatch(source, /BLUMI_ROOM_VNEXT_FULL_WAVE_QA_FLAG/)
  }
  assert.match(editorStageSource, /roomVNextRuntimeMode="disabled"/)
  assert.match(liveRoomSource, /roomVNextRuntimeMode="disabled"/)
})

test("VNext seating uses its authored foreground occlusion layer instead of a synthetic mask", () => {
  assert.match(rendererSource, /item\.foregroundOcclusionAsset/)
  assert.match(rendererSource, /furnitureFrontOcclusionImage/)
})

test("production rooms keep production persistence and sync wiring", () => {
  assert.match(navigatorSource, /storageNamespace="production"/)
  assert.match(navigatorSource, /isQaRuntimeAuthorized=\{false\}/)
  assert.match(navigatorSource, /isVNextRuntimeProof=\{false\}/)
  assert.match(navigatorSource, /baseHttpUrl=\{MOBILE_HTTP_BASE_URL\}/)
})

test("production rooms retain live-room reconnection chrome", () => {
  assert.match(
    navigatorSource,
    /!isAccountRestricted\s*\? <ConnectionBanner/
  )
})

test("production My Room stays in the current flow without a QA gallery route", () => {
  assert.doesNotMatch(navigatorSource, /UniversalCoreQaGallery/)
  assert.doesNotMatch(navigatorSource, /includeUniversalCoreQa/)
  assert.match(navigatorSource, /BLUMI_DEV_ENTRY_ROUTE === "myroom"/)
  assert.match(navigatorSource, /navigationRef\.navigate\("MyRoom"\)/)
})

test("the approved Shop stays isolated from Room candidate catalogs", () => {
  assert.match(shopSource, /isRoomCatalogQaPreview\?: boolean/)
  assert.match(shopSource, /isFullShopCatalogQaPreview\?: boolean/)
  assert.match(
    shopSource,
    /resolveShopCatalogRuntime\(\{[\s\S]*isFullShopCatalogQaPreview: props\.isFullShopCatalogQaPreview === true/
  )
  assert.match(shopSource, /useInventoryStore\(\s*sessionActor\.profile\.userId,\s*requiresServerInventory\s*\)/)
  assert.match(shopSource, /if \(!requiresServerInventory\) return/)
  // The Shop tab page is rendered by the main-tab page factory.
  const mainTabPageSource = readFileSync(
    resolve(process.cwd(), "src/navigation/mainTabPager/renderMainTabPage.tsx"),
    "utf8"
  )
  assert.match(mainTabPageSource, /isRoomCatalogQaPreview=\{false\}/)
  assert.match(navigatorSource, /isFullShopCatalogQaPreview: IS_FULL_SHOP_CATALOG_QA_PREVIEW/)
  assert.match(
    navigatorSource,
    /isFullShopCatalogQaPreview=\{IS_FULL_SHOP_CATALOG_QA_PREVIEW\}/
  )
  assert.match(
    navigatorSource,
    /const IS_FULL_SHOP_CATALOG_QA_PREVIEW = isAvatarQaUnlockEnabled\(\s*__DEV__,\s*BLUMI_QA_UNLOCK_AVATAR_ITEMS_FLAG\s*\)/
  )
})

test("editor placement is free-form and does not render lane guides", () => {
  assert.doesNotMatch(editorSurfaceSource, /snapRoomV2PointToPlacementLane/)
  assert.doesNotMatch(editorSurfaceSource, /showPlacementGuides=\{Boolean\(selectedInstanceId\)\}/)
})

test("stage drag maps the pointer against the room surface, not the touched furniture child", () => {
  assert.match(editorGesturesSource, /const eventPoint = stageWindowBounds\s*\? \{\s*x: \(pageX - stageWindowBounds\.x\) \/ stageWindowBounds\.width/)
  assert.match(editorGesturesSource, /y: \(pageY - stageWindowBounds\.y\) \/ stageWindowBounds\.height/)
  assert.match(editorGesturesSource, /point: eventPoint/)
})

test("selected furniture has no floor marker; only active placement validation is shown", () => {
  assert.match(
    rendererSource,
    /const shouldShowFootprint =\s*item\.kind === "furniture" &&\s*Boolean\(placementState\)/
  )
  assert.match(rendererSource, /\{placementState === "valid" \? \(/)
})

test("renderer does not paint synthetic drop shadows under furniture renders", () => {
  assert.doesNotMatch(rendererSource, /shouldShowFurnitureGroundShadow\(item\)/)
  assert.doesNotMatch(rendererSource, /styles\.furnitureGroundShadow/)
  assert.doesNotMatch(rendererSource, /itemSelected:\s*\{\s*shadow/)
  assert.doesNotMatch(rendererSource, /interactionAura:\s*\{[\s\S]{0,160}shadow/)
  assert.doesNotMatch(rendererSource, /footprintPad:\s*\{[\s\S]{0,160}shadow/)
})

test("VNext contact shadows are authored layers behind an explicit QA runtime flag", () => {
  assert.match(rendererSource, /roomVNextRuntimeMode\?: RoomVNextRuntimeMode/)
  assert.match(rendererSource, /roomVNextRuntimeMode !== "disabled"/)
  assert.match(rendererSource, /item\.contactShadowAsset/)
  assert.match(rendererSource, /furnitureContactShadowImage/)
})

test("production provider grants no QA-only room ownership", () => {
  assert.match(navigatorSource, /qaOnlyOwnedRoomItemIds=\{\[\]\}/)
  assert.doesNotMatch(navigatorSource, /ROOM_VNEXT_PINK_CLOUD_BED_CANDIDATE/)
  assert.doesNotMatch(navigatorSource, /ROOM_V3_QA_RUNTIME_OWNED_ITEM_IDS/)
})

test("sitting avatars keep the approved sitting-frame scale without a runtime squash", () => {
  // The avatar motion interpolations live next to the renderer.
  const avatarMotionStyleSource = readFileSync(
    resolve(process.cwd(), "src/features/roomV2/components/roomRendererAvatarMotionStyle.ts"),
    "utf8"
  )
  assert.match(avatarMotionStyleSource, /if \(motion\.state === "sitting"\) return 1/)
})
