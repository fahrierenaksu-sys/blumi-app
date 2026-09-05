import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const editorSource = readFileSync(
  resolve(process.cwd(), "src/screens/MyRoomEditorScreen.tsx"),
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

test("room editor exposes an explicit control that commits a valid placement preview", () => {
  assert.match(editorSource, /accessibilityLabel=\{copy\.confirmPlacement\}/)
  assert.match(editorCopySource, /confirmPlacement:\s*"Confirm room placement"/)
  assert.match(editorSource, /commitTrayPlacementPreview\(placementPreview\)/)
})

test("Save commits the latest valid preview before validating and persisting the room", () => {
  assert.match(
    editorSource,
    /const saveDecision = createRoomV2EditorSaveDecor\(draftDecor, furniturePreview\)/
  )
  assert.match(editorSource, /const decorToSave = saveDecision\.decor/)
  assert.match(
    editorSource,
    /validateRoomV2DraftPlacements\(\{[\s\S]*decor: decorToSave/
  )
  assert.match(
    editorSource,
    /const confirmedSave = await saveRoomV2EditorDraftConfirmed\([\s\S]*decorToSave,[\s\S]*saveUserRoomDecorConfirmed/
  )
  assert.match(
    editorSource,
    /if \(confirmedSave\.status !== "saved"\)[\s\S]*setPlacementFeedback\(confirmedSave\.feedback\)/
  )
  assert.match(
    editorSource,
    /if \(confirmedSave\.status !== "saved"\)[\s\S]*return[\s\S]*allowEditorExitRef\.current = true/
  )
  assert.match(
    editorSource,
    /if \(saveDecision\.status === "invalid_preview"\)[\s\S]*setPlacementFeedback\(copy\.feedback\.moveHighlighted\)/
  )
  assert.match(editorCopySource, /moveHighlighted:\s*"Move the highlighted item before saving\."/)
})

test("room editor catalog supports selecting, searching, rotating, and explicitly placing a room piece", () => {
  assert.match(editorSource, /const \[inventorySearchQuery, setInventorySearchQuery\] = useState\(""\)/)
  assert.match(editorSource, /accessibilityLabel=\{copy\.searchLabel\}/)
  assert.match(editorCopySource, /searchLabel:\s*"Search room pieces"/)
  assert.match(editorSource, /onPreviewItem=\{setSelectedInventoryItemId\}/)
  assert.match(editorSource, /accessibilityLabel={`Preview \${item\.name}`}/)
  assert.match(editorSource, /accessibilityLabel=\{copy\.chooseRotation\(copy\.rotationLabels\[rotation\], selectedInventoryEntry\.item\.name\)\}/)
  assert.match(editorSource, /accessibilityLabel=\{copy\.placeItem\(selectedInventoryEntry\.item\.name\)\}/)
  assert.match(editorSource, /addDraftItem\(\s*selectedInventoryEntry\.item\.id,\s*true,\s*selectedInventoryRotation\s*\)/)
  assert.match(editorSource, /resolveRoomV2InventoryPreviewSource\(\s*selectedInventoryEntry\.item,\s*selectedInventoryRotation\s*\)/)
  assert.match(editorSource, /rotation: input\.rotation/)
  assert.match(editorSource, /createPanHandlers\(item, owned, previewRotation\)/)
})

test("direction buttons persist an exact valid rotation for the selected placed item", () => {
  assert.match(
    editorSource,
    /const applySelectedItemRotation = useCallback\(\(rotation: PlacedRoomItem\["rotation"\]\)/
  )
  assert.match(
    editorSource,
    /patchRoomV2PlacedItem\(current, selectedInstanceId, \{ rotation \}\)/
  )
  assert.match(
    editorSource,
    /onPress=\{\(\) => handleSelectInventoryRotation\(rotation\)\}/
  )
  assert.match(
    editorSource,
    /selectedPlacedItem\?\.itemId !== selectedInventoryEntry\.item\.id[\s\S]*setSelectedInventoryRotation\(rotation\)/
  )
})

test("a directional item is placed when its current pose is valid, even if another rotation needs repositioning", () => {
  assert.doesNotMatch(
    editorSource,
    /preview\.isValid && hasRotationSafeDefaultPlacement\(/,
    "default placement must not reject a valid current pose because another rotation needs repositioning"
  )
})

test("room editor uses only the production Room catalog", () => {
  assert.match(editorSource, /const ACTIVE_ROOM_FURNITURE_CATALOG = ROOM_V2_FURNITURE_CATALOG/)
  assert.match(editorSource, /const ACTIVE_ROOM_SHELL_CATALOG = ROOM_V2_SHELL_CATALOG/)
  assert.doesNotMatch(editorSource, /resolveRoomV3QaFurnitureCatalogRuntime/)
  assert.doesNotMatch(editorSource, /ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG/)
})

test("shop placement intents are applied once per product ID, even when the editor screen is reused", () => {
  assert.match(editorSource, /const lastAppliedPlacementItemId = useRef<string \| undefined>\(undefined\)/)
  assert.match(editorSource, /lastAppliedPlacementItemId\.current === placementItemId/)
  assert.match(editorSource, /lastAppliedPlacementItemId\.current = placementItemId/)
  assert.match(editorSource, /setSelectedInventoryItemId\(placementItemId\)/)
  assert.match(editorSource, /navigation\.addListener\("blur", \(\) => \{\s*lastAppliedPlacementItemId\.current = undefined/)
})

test("passive Shop placement intents do not surface a duplicate-placement error", () => {
  assert.match(
    editorSource,
    /if \(feedback\) \{\s*hapticError\(\)\s*setPlacementFeedback\(copy\.feedback\.alreadyPlaced\)/
  )
  assert.match(editorSource, /setPlacementFeedback\(undefined\)\s*if \(addDraftItem\(placementItemId, false\)\)/)
})

test("editor keeps controls reachable on short screens and only rotates through supplied asset views", () => {
  assert.match(editorSource, /<KeyboardAvoidingView[\s\S]*behavior=\{Platform\.OS === "ios" \? "padding" : undefined\}/)
  assert.match(editorSource, /<ScrollView[\s\S]*keyboardShouldPersistTaps="handled"/)
  assert.match(editorSource, /const rotationOptions = getRoomV2FurnitureRotationOptions\(furnitureItem\)/)
  assert.match(editorSource, /rotationOptions\[\(currentRotationIndex \+ 1\) % rotationOptions\.length\]/)
  assert.match(editorSource, /const canRotateSelectedPlacedItem = hasMultipleRoomV2RotationOptions/)
  assert.match(editorSource, /\{selectedInstanceId && canRotateSelectedPlacedItem \? \(\s*<Pressable[\s\S]*accessibilityLabel=\{copy\.rotateSelected\}/)
})

test("selected room furniture has a named primary placement action instead of an ambiguous add control", () => {
  assert.match(editorSource, /<Text style=\{styles\.selectedInventoryEyebrow\}>\{copy\.nowEditing\}<\/Text>/)
  assert.match(editorSource, /styles\.placeSelectedInventoryButtonText[\s\S]*>\{copy\.placeInRoom\}<\/Text>/)
})

test("the direction rail stays tappable instead of sitting underneath the placement CTA", () => {
  assert.match(editorSource, /<View style=\{styles\.selectedInventoryContentRow\}>/)
  assert.match(
    editorSource,
    /\{canPlaceAnotherRoomItem\(selectedInventoryEntry\.item\.id\) \? \(\s*<Pressable[\s\S]*>\{copy\.placeInRoom\}<\/Text>[\s\S]*<\/Pressable>\s*\) : null\}/
  )
  assert.match(
    editorSource,
    /selectedInventoryPreview: \{[\s\S]*flexDirection: "column"[\s\S]*alignItems: "stretch"/
  )
})

test("editor uses the room-first collection hierarchy instead of the legacy decorate header", () => {
  assert.match(editorSource, /<Text style=\{styles\.title\}>\{copy\.title\}<\/Text>/)
  assert.match(editorSource, /<Text style=\{styles\.inventoryTitle\}>\{copy\.collectionTitle\}<\/Text>/)
  assert.match(editorSource, /<View style=\{styles\.inventoryHandle\} \/>/)
  assert.match(editorSource, /copy\.defaultInspectorHint/)
  assert.match(editorSource, /copy\.seatInspectorHint/)
  assert.match(editorSource, />\{copy\.placeInRoom\}<\/Text>/)
  assert.doesNotMatch(editorSource, />Decorate<\/Text>/)
})

test("editor waits for persisted decor and syncs the inspector when a staged item is selected", () => {
  assert.match(editorSource, /persistenceState/)
  assert.match(editorSource, /pointerEvents=\{isRoomDraftReady \? "auto" : "none"\}/)
  assert.match(editorSource, /if \(!isRoomDraftReady\) return\s*lastAppliedPlacementItemId\.current = placementItemId/)
  assert.match(editorSource, /if \(!isRoomDraftReady\) \{\s*hapticError\(\)/)
  assert.match(editorSource, /setSelectedInventoryItemId\(placedItem\?\.itemId\)/)
  assert.match(editorSource, /setSelectedInventoryRotation\(item\.rotation\)/)
})

test("stage furniture is announced as an editor selection rather than an in-room interaction", () => {
  assert.match(editorSource, /<Pressable\s+accessible=\{Boolean\(selectedInstanceId\)\}\s+accessibilityRole="button"\s+accessibilityLabel=\{copy\.stageLabel\}/)
  assert.match(editorSource, /itemInteractionMode="edit"/)
  assert.match(rendererSource, /itemInteractionMode === "edit"/)
  assert.match(rendererSource, /Select \$\{item\.name\} to move, rotate, or remove/)
})

test("editor catalog contains only room furniture the current user owns", () => {
  assert.match(
    editorSource,
    /ACTIVE_ROOM_FURNITURE_CATALOG\s*\.filter\(\(item\) =>\s*ownsRoomItem\(item\.id\) \|\| QA_OWNED_ROOM_ITEM_IDS\.has\(item\.id\)\s*\)/
  )
})

test("an empty owned collection takes the user to the Home section of Shop", () => {
  assert.match(
    editorSource,
    /navigation\.navigate\("CosmeticShop", \{ initialShopMode: "home" \}\)/
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
  for (const source of [editorSource, liveRoomSource, navigatorSource]) {
    assert.doesNotMatch(source, /ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG/)
    assert.doesNotMatch(source, /resolveRoomVNextFullWaveCandidateCatalog/)
    assert.doesNotMatch(source, /resolveRoomV3QaFurnitureCatalogRuntime/)
    assert.doesNotMatch(source, /BLUMI_ROOM_VNEXT_FULL_WAVE_QA_FLAG/)
  }
  assert.match(editorSource, /roomVNextRuntimeMode="disabled"/)
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
  assert.match(
    navigatorSource,
    /isRoomCatalogQaPreview=\{false\}/
  )
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
  assert.doesNotMatch(editorSource, /snapRoomV2PointToPlacementLane/)
  assert.doesNotMatch(editorSource, /showPlacementGuides=\{Boolean\(selectedInstanceId\)\}/)
})

test("stage drag maps the pointer against the room surface, not the touched furniture child", () => {
  assert.match(editorSource, /const eventPoint = stageWindowBounds\s*\? \{\s*x: \(pageX - stageWindowBounds\.x\) \/ stageWindowBounds\.width/)
  assert.match(editorSource, /y: \(pageY - stageWindowBounds\.y\) \/ stageWindowBounds\.height/)
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
  assert.match(rendererSource, /if \(motion\.state === "sitting"\) return 1/)
})
