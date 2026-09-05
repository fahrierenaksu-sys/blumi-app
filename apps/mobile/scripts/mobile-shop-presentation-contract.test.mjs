import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const shopScreen = readFileSync(
  resolve(mobileRoot, "src/screens/CosmeticShopScreen.tsx"),
  "utf8"
)
const shopCatalog = readFileSync(
  resolve(mobileRoot, "src/features/shop/shopCatalog.ts"),
  "utf8"
)
const shopPreviewStyles = readFileSync(
  resolve(mobileRoot, "src/features/shop/shopPreviewStyles.ts"),
  "utf8"
)
const shopNavigationControls = readFileSync(
  resolve(mobileRoot, "src/features/shop/ShopNavigationControls.tsx"),
  "utf8"
)

test("shop remains body-compatible through the catalog source of truth", () => {
  assert.match(shopCatalog, /getAvatarV2ShopItemsCompatibleWithBody\(/)
  assert.match(shopCatalog, /input\.avatar\.bodyId/)
})

test("compact shop shows two readable product columns per page", () => {
  assert.match(shopScreen, /SHOP_PRODUCT_COLUMNS_PER_PAGE\s*=\s*2/)
  assert.match(shopScreen, /productCardWidth[\s\S]*SHOP_PRODUCT_COLUMNS_PER_PAGE/)
  assert.match(shopScreen, /index \+= SHOP_PRODUCT_COLUMNS_PER_PAGE/)
})

test("full-canvas rig layers get a type-aware contained presentation", () => {
  assert.match(
    shopScreen,
    /getMaleRigLayerThumbnailPresentation\(item\.type, "shop"\)/
  )
  assert.match(shopScreen, /isRigLayerSource=\{isRigLayerSource\}/)
  assert.match(shopScreen, /resizeMode="contain"/)
  assert.match(shopScreen, /productWearableRigLayer/)
})

test("shop product thumbnails stay fully contained inside their glass frame", () => {
  assert.match(
    shopScreen,
    /productWearableImage:\s*\{[^}]*width:\s*"100%",[^}]*height:\s*"100%"/
  )
  assert.doesNotMatch(
    shopScreen,
    /productWearableImage:\s*\{[^}]*width:\s*"108%"/
  )
  assert.match(
    shopScreen,
    /productThumb:\s*\{[\s\S]*?overflow:\s*"hidden"/
  )
})

test("shop removes misleading affordances and keeps compact labels legible", () => {
  assert.doesNotMatch(shopScreen, />See all</)
  assert.doesNotMatch(shopScreen, /return "Feat"/)
  assert.doesNotMatch(shopScreen, /return "Own"/)
  assert.match(shopScreen, /productTitle:\s*\{[\s\S]*?fontSize:\s*11/)
})

test("every compact shop action keeps a 44 point touch target", () => {
  assert.match(shopScreen, /accessibilityLabel=\{copy\.back\}[\s\S]*?size=\{44\}/)
  assert.match(shopScreen, /coinPill:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopNavigationControls, /modePill:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopScreen, /verticalCategoryChip:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopPreviewStyles, /roomHeroAction:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopPreviewStyles, /avatarHeroAction:\s*\{[\s\S]*?minHeight:\s*44/)
})

test("shop makes loading, empty, offline, and retry states explicit and accessible", () => {
  assert.match(shopScreen, /useNetworkStatus/)
  assert.match(shopScreen, /const shopPresentationState = getShopPresentationState\(/)
  assert.match(shopScreen, /const showShopContent = shouldRenderShopContent\(/)
  assert.match(shopScreen, /isProduction: requiresServerInventory/)
  assert.match(shopScreen, /showShopContent \? \(/)
  assert.match(shopNavigationControls, /case "loading":/)
  assert.match(shopNavigationControls, /case "offline":/)
  assert.match(shopNavigationControls, /case "empty":/)
  assert.match(shopNavigationControls, /case "error":/)
  assert.match(shopNavigationControls, /testID:\s*"shop-status-loading"/)
  assert.match(shopNavigationControls, /testID:\s*"shop-status-offline"/)
  assert.match(shopNavigationControls, /testID:\s*"shop-status-empty"/)
  assert.match(shopNavigationControls, /testID:\s*"shop-status-error"/)
  assert.match(shopNavigationControls, /testID="shop-status-retry"/)
  assert.match(shopNavigationControls, /accessibilityRole=\{props\.state === "loading" \? "progressbar" : "alert"\}/)
  assert.match(shopNavigationControls, /accessibilityLiveRegion="polite"/)
  assert.match(shopScreen, /onRetry=\{handleRetryShop\}/)
})

test("coin packs stay hidden until the balance pill is pressed", () => {
  assert.match(
    shopScreen,
    /const \[isCoinWalletOpen, setIsCoinWalletOpen\] = useState\(false\)/
  )
  assert.match(shopScreen, /testID="shop-coin-balance"/)
  assert.match(
    shopScreen,
    /accessibilityState=\{\{ disabled: !requiresServerInventory, expanded: isCoinWalletOpen \}\}/
  )
  assert.match(
    shopScreen,
    /onPress=\{\(\) => setIsCoinWalletOpen\(\(current\) => !current\)\}/
  )
  assert.match(
    shopScreen,
    /\{requiresServerInventory && isCoinWalletOpen \? \([\s\S]*?<CoinPackWalletPanel/
  )
  assert.doesNotMatch(
    shopScreen,
    /\{requiresServerInventory \? \(\s*<CoinPackWalletPanel/
  )
})
