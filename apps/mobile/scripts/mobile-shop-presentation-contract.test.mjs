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
// Modules the Shop screen was decomposed into; each assertion reads its owner.
const readShopScreenModule = (fileName) => readFileSync(
  resolve(mobileRoot, "src/features/shop/screen", fileName),
  "utf8"
)
const closetBrowser = readShopScreenModule("ClosetBrowser.tsx")
const categoryRail = readShopScreenModule("VerticalShopCategoryRail.tsx")
const productCard = readShopScreenModule("ShopProductCard.tsx")
const shopScreenStyles = readShopScreenModule("shopScreenStyles.ts")
const shopScreenModel = readShopScreenModule("shopScreenModel.ts")

test("shop remains body-compatible through the catalog source of truth", () => {
  assert.match(shopCatalog, /getAvatarV2ShopItemsCompatibleWithBody\(/)
  assert.match(shopCatalog, /input\.avatar\.bodyId/)
})

test("compact shop shows two readable product columns per page", () => {
  assert.match(closetBrowser, /SHOP_PRODUCT_COLUMNS_PER_PAGE\s*=\s*2/)
  assert.match(closetBrowser, /productCardWidth[\s\S]*SHOP_PRODUCT_COLUMNS_PER_PAGE/)
  // Paging lives in the tested shelf model (buildShopShelfPages).
  assert.match(closetBrowser, /buildShopShelfPages\(props\.products, catalog\.accessibilityLayout \? 1 : SHOP_PRODUCT_COLUMNS_PER_PAGE\)/)
})

test("full-canvas rig layers get a type-aware contained presentation", () => {
  assert.match(
    productCard,
    /getMaleRigLayerThumbnailPresentation\(item\.type, "shop"\)/
  )
  assert.match(productCard, /isRigLayerSource=\{isRigLayerSource\}/)
  assert.match(productCard, /contentFit="contain"/)
  assert.match(productCard, /productWearableRigLayer/)
})

test("shop product thumbnails stay fully contained inside their glass frame", () => {
  assert.match(
    shopScreenStyles,
    /productWearableImage:\s*\{[^}]*width:\s*"100%",[^}]*height:\s*"100%"/
  )
  assert.doesNotMatch(
    shopScreenStyles,
    /productWearableImage:\s*\{[^}]*width:\s*"108%"/
  )
  assert.match(
    shopScreenStyles,
    /productThumb:\s*\{[\s\S]*?overflow:\s*"hidden"/
  )
})

test("shop removes misleading affordances and keeps compact labels legible", () => {
  for (const source of [shopScreen, closetBrowser, categoryRail, productCard, shopScreenModel]) {
    assert.doesNotMatch(source, />See all</)
    assert.doesNotMatch(source, /return "Feat"/)
    assert.doesNotMatch(source, /return "Own"/)
  }
  assert.match(shopScreenStyles, /productTitle:\s*\{[\s\S]*?fontSize:\s*11/)
})

test("every compact shop action keeps a 44 point touch target", () => {
  assert.doesNotMatch(shopScreen, /accessibilityLabel=\{copy\.back\}/, "the bottom-tab Shop has no redundant back action")
  assert.match(shopScreenStyles, /coinPill:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopNavigationControls, /modePill:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopScreenStyles, /verticalCategoryChip:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopPreviewStyles, /roomHeroAction:\s*\{[\s\S]*?minHeight:\s*44/)
  assert.match(shopPreviewStyles, /avatarHeroAction:\s*\{[\s\S]*?minHeight:\s*44/)
})

test("shop makes loading, empty, offline, and retry states explicit and accessible", () => {
  assert.match(shopScreen, /useNetworkStatus/)
  assert.match(shopScreen, /const shopPresentationState = getShopPresentationState\(/)
  assert.match(shopScreenModel, /showShopContent: shouldRenderShopContent\(/)
  assert.match(shopScreen, /const \{\s*showShopContent,[\s\S]*?\} = shopSurfacePolicy/)
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

test("the first load shows the shelf's shape and crossfades into it (SHOP-5)", () => {
  const skeleton = readShopScreenModule("ShopShelfSkeleton.tsx")
  assert.match(shopScreen, /const showSkeleton = !showShopContent && shopStatusState === "loading"/)
  assert.match(shopScreen, /showSkeleton \? \(\s*<ShopShelfSkeleton/)
  assert.match(shopScreen, /<Reanimated\.View entering=\{contentEntering\}/)
  assert.match(skeleton, /testID="shop-status-loading"/)
  assert.match(skeleton, /accessibilityRole="progressbar"/)
  assert.match(skeleton, /SHOP_CONTENT_CROSSFADE_MS = 160/)
  // Only after a skeleton the user saw, and never under Reduce Motion.
  assert.match(skeleton, /if \(!skeletonShown \|\| input\.reduceMotion\) return undefined/)
  assert.doesNotMatch(skeleton, /withRepeat|ActivityIndicator/)
})

test("coin packs stay hidden until the balance pill is pressed", () => {
  assert.match(
    shopScreen,
    /const \[isCoinWalletOpen, setIsCoinWalletOpen\] = useState\(false\)/
  )
  assert.match(shopScreen, /testID="shop-coin-balance"/)
  assert.match(
    shopScreen,
    /accessibilityState=\{\{ disabled: !requiresServerInventory \|\| !canPerformShopActions \|\| !IS_BLUMI_PAID_COINS_ENABLED, expanded: IS_BLUMI_PAID_COINS_ENABLED && isCoinWalletOpen \}\}/
  )
  assert.match(
    shopScreen,
    /onPress=\{\(\) => setIsCoinWalletOpen\(\(current\) => !current\)\}/
  )
  assert.match(
    shopScreen,
    /\{IS_BLUMI_PAID_COINS_ENABLED && requiresServerInventory && inventoryVerified && isCoinWalletOpen \? \([\s\S]*?<CoinPackWalletPanel/
  )
  assert.doesNotMatch(
    shopScreen,
    /\{requiresServerInventory \? \(\s*<CoinPackWalletPanel/
  )
})
