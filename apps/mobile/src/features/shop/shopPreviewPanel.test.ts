import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(process.cwd())
const panelSource = readFileSync(
  resolve(root, "src/features/shop/ShopPreviewPanel.tsx"),
  "utf8"
)
const stylesSource = readFileSync(
  resolve(root, "src/features/shop/shopPreviewStyles.ts"),
  "utf8"
)
const screenSource = readFileSync(
  resolve(root, "src/screens/CosmeticShopScreen.tsx"),
  "utf8"
)
const navigatorSource = readFileSync(
  resolve(root, "src/navigation/RootNavigator.tsx"),
  "utf8"
)
const copySource = readFileSync(
  resolve(root, "src/features/shop/shopCopy.ts"),
  "utf8"
)

test("shop preview presentation lives outside the screen monolith", () => {
  assert.match(panelSource, /export function ShopPreviewPanel\(/)
  assert.match(panelSource, /testID="shop-selected-product-preview"/)
  assert.match(panelSource, /ShopAvatarLivePreview/)
  assert.match(panelSource, /ShopRoomItemPreview/)
  assert.doesNotMatch(panelSource, /roomVNextRuntimeMode/)
  assert.match(panelSource, /from "\.\/shopPreviewStyles"/)
  assert.match(stylesSource, /export const shopPreviewStyles/)
  assert.match(screenSource, /from "\.\.\/features\/shop\/ShopPreviewPanel"/)
  assert.doesNotMatch(screenSource, /ROOM_VNEXT_RUNTIME_MODE/)
  assert.doesNotMatch(screenSource, /function SelectedProductPreview/)
  assert.doesNotMatch(screenSource, /function ShopAvatarLivePreview/)
  assert.match(screenSource, /previewAvatarShopItem/)
  assert.match(screenSource, /primaryActionLabel=\{shopMode === "avatar"/)
  assert.match(screenSource, /onRemovePreview=\{handleRemoveAvatarPreview\}/)
  assert.match(screenSource, /isAvatarShopItemPreviewing/)
  assert.match(screenSource, /copy\.combination\.applyLook/)
  assert.match(copySource, /applyLook:\s*"Kombini uygula"/)
})

test("avatar remains visible before explicit product selection", () => {
  assert.match(panelSource, /testID="shop-avatar-default-preview"/)
  assert.match(panelSource, /ShopAvatarLivePreview avatar=\{previewAvatar\}/)
  assert.match(screenSource, /<ShopPreviewPanel/)
  assert.doesNotMatch(screenSource, /shopMode === "avatar" \|\| selectedProduct/)
})

test("home preview shows the room before product selection without a purchase action", () => {
  assert.match(panelSource, /testID="shop-room-default-preview"/)
  assert.match(panelSource, /mode === "home"/)
  assert.match(panelSource, /<ShopRoomItemPreview item=\{undefined\} scene=\{roomPreviewScene\}/)
  assert.match(screenSource, /mode=\{shopMode\}/)
  assert.doesNotMatch(screenSource, /roomProducts\[0\]\?\.roomItem/)
})

test("shop preview keeps one approved hierarchy across supported phone sizes", () => {
  assert.doesNotMatch(screenSource, /height\s*<\s*880/)
  assert.doesNotMatch(screenSource, /width\s*<\s*390/)
  assert.doesNotMatch(panelSource, /compact:\s*boolean/)
  assert.match(panelSource, /layoutMetrics:/)
  assert.match(screenSource, /getShopLayoutMetrics/)
})

test("avatar preview uses one clear unlock action without beta-like chrome or a floor shadow", () => {
  assert.doesNotMatch(panelSource, /copy\.liveTryOn/)
  assert.doesNotMatch(panelSource, /shopAvatarFloorShadow/)
  assert.doesNotMatch(stylesSource, /avatarHeroHintPill/)
  assert.doesNotMatch(stylesSource, /shopAvatarFloorShadow/)
  assert.match(panelSource, /styles\.avatarHeroActionContent/)
  assert.match(panelSource, /styles\.avatarHeroPricePill/)
  assert.match(panelSource, /styles\.avatarHeroTopPanel/)
  assert.match(panelSource, /testID="shop-preview-remove-preview"/)
  assert.match(panelSource, /onRemovePreview/)
  assert.match(stylesSource, /avatarHeroTopPanel:\s*\{[\s\S]*?minHeight:\s*64[\s\S]*?borderRadius:\s*18/)
  assert.match(stylesSource, /avatarHeroAction:\s*\{[\s\S]*?minHeight:\s*44[\s\S]*?borderRadius:\s*18/)
  assert.match(stylesSource, /shopAvatarFrame:\s*\{\s*marginBottom:\s*0/)
  assert.match(copySource, /unlock:\s*"Aç"/)
})

test("shop scroll viewport ends above the floating bottom navigation", () => {
  assert.match(
    screenSource,
    /marginBottom:\s*viewportMetrics\.bottomContentInset/
  )
  assert.match(screenSource, /paddingBottom:\s*4/)
})

test("room VNext QA stays isolated from the approved Shop presentation", () => {
  assert.match(navigatorSource, /roomFurnitureCatalog=\{undefined\}/)
  assert.match(navigatorSource, /qaOnlyOwnedRoomItemIds=\{\[\]\}/)
  assert.match(navigatorSource, /isRoomCatalogQaPreview=\{false\}/)
  assert.match(navigatorSource, /initialShopMode=\{undefined\}/)
  assert.doesNotMatch(navigatorSource, /ROOM_V3_QA_INTERACTION_CATALOG/)
})
