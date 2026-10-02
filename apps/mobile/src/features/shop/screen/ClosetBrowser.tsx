import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { type FlatList, Text, View } from "react-native"
import Reanimated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { MainTabPagerEdgeHandoffScrollOwner } from "../../../ui/MainTabPagerGestureOwnership"
import { useMainTabReselect } from "../../../ui/layout/useMainTabReselect"
import type { AppLocale } from "../../session/appLocale"
import { useReducedMotion } from "../../../ui/animations"
import type { ShopCardRemoveAction } from "../shopCardRemoveModel"
import type { ShopCatalogItem } from "../shopCatalog"
import { getShopCopy } from "../shopCopy"
import type { ShopLayoutMetrics } from "../shopLayoutMetrics"
import type { ShopMode } from "../ShopNavigationControls"
import {
  buildShopShelfPages,
  createShopShelfPageTracker,
  findShopShelfPageIndex,
  getShopShelfCounterPage,
  getShopShelfMaxScrollOffset,
  getShopShelfScope,
  shouldShopShelfOwnHorizontalDrags,
  stepShopShelfPageTracker,
  type ShopCategoryOption
} from "./shopScreenModel"
import { shopScreenStyles as styles } from "./shopScreenStyles"
import { ShopProductCard } from "./ShopProductCard"
import { ShopShelfPagination } from "./ShopShelfPagination"
import { VerticalShopCategoryRail } from "./VerticalShopCategoryRail"

const SHOP_PRODUCT_COLUMNS_PER_PAGE = 2

export function ClosetBrowser(props: {
  categories: ShopCategoryOption[]
  activeCategoryId: string
  products: ShopCatalogItem[]
  inventoryVerified: boolean
  pendingInventoryLabel: string
  selectedId: string | undefined
  mode: ShopMode
  locale: AppLocale
  layoutMetrics: ShopLayoutMetrics
  onSelectCategory: (categoryId: string) => void
  onSelectProduct: (product: ShopCatalogItem) => void
  /** Scrolls the shelf to this product's page once per `requestId` (deep links). */
  revealRequest?: { productId: string; requestId: number }
  /** Cards that show the corner X, by product id (see shopCardRemoveModel). */
  removeActionById?: ReadonlyMap<string, ShopCardRemoveAction>
  onRemoveProduct?: (product: ShopCatalogItem) => void
  /** Thumbnails a purchase flight can start from. */
  registerThumbnail?: (sourceItemId: string, view: View | null) => void
}) {
  const reduceMotion = useReducedMotion()
  const copy = getShopCopy(props.locale)
  const title = props.mode === "avatar" ? copy.findYourStyle : copy.roomPieces
  const subtitle =
    props.mode === "avatar"
      ? copy.avatarCatalogHint
      : copy.roomCatalogHint
  const { catalog } = props.layoutMetrics
  const categoryRailWidth = catalog.categoryRailWidth
  const productShelfWidth = catalog.productShelfWidth
  const productCardWidth = catalog.productCardWidth
  const productScrollerRef = useRef<FlatList<ShopCatalogItem[][]>>(null)
  // The live shelf offset, on the UI thread, decides whether a drag at the
  // first or last page belongs to the main pager (no JS per scroll frame).
  const shelfScrollOffset = useSharedValue(0)
  // SHOP-4: the counter's page, stepped by scroll events on the UI thread.
  // The tracker belongs to one shelf (mode and category); the counter shows
  // page 1 for any other shelf, so a category change never shows a stale page.
  const shelfScope = getShopShelfScope(props.mode, props.activeCategoryId)
  const shelfPageTracker = useSharedValue(createShopShelfPageTracker(0, shelfScope))
  // Before paint (like WardrobeCatalogList), so a new category never shows
  // one frame at the old shelf's offset.
  useLayoutEffect(() => {
    shelfPageTracker.value = createShopShelfPageTracker(0, shelfScope)
    // A jump to an offset the shelf already has emits no scroll event.
    shelfScrollOffset.value = 0
    productScrollerRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [shelfScope, shelfPageTracker, shelfScrollOffset])
  const productPages = useMemo(
    () => buildShopShelfPages(props.products, catalog.accessibilityLayout ? 1 : SHOP_PRODUCT_COLUMNS_PER_PAGE),
    [catalog.accessibilityLayout, props.products]
  )
  const shelfOwnsHorizontalDrags = shouldShopShelfOwnHorizontalDrags(productPages.length)
  const shelfMaxScrollOffset = getShopShelfMaxScrollOffset(productPages.length, productShelfWidth)
  const pageCount = productPages.length
  // The counter changes when the finger crosses half a page, and on release
  // it jumps to the page paging settles on, before the snap animation runs.
  const handleShelfScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      shelfScrollOffset.value = event.contentOffset.x
      shelfPageTracker.value = stepShopShelfPageTracker(
        shelfPageTracker.value,
        { type: "scroll", offset: event.contentOffset.x },
        productShelfWidth,
        pageCount
      )
    },
    onBeginDrag: (event) => {
      shelfPageTracker.value = stepShopShelfPageTracker(
        shelfPageTracker.value,
        { type: "begin_drag", offset: event.contentOffset.x },
        productShelfWidth,
        pageCount
      )
    },
    onEndDrag: (event) => {
      shelfPageTracker.value = stepShopShelfPageTracker(
        shelfPageTracker.value,
        { type: "end_drag", offset: event.contentOffset.x, speed: event.velocity?.x ?? 0 },
        productShelfWidth,
        pageCount
      )
    },
    onMomentumEnd: (event) => {
      shelfPageTracker.value = stepShopShelfPageTracker(
        shelfPageTracker.value,
        { type: "momentum_end", offset: event.contentOffset.x },
        productShelfWidth,
        pageCount
      )
    }
  }, [pageCount, productShelfWidth])
  const scrollShelfToPage = useCallback((nextPageIndex: number, animated: boolean): void => {
    shelfPageTracker.value = stepShopShelfPageTracker(
      shelfPageTracker.value,
      { type: "jump", page: nextPageIndex },
      productShelfWidth,
      pageCount
    )
    productScrollerRef.current?.scrollToOffset({ offset: nextPageIndex * productShelfWidth, animated })
  }, [pageCount, productShelfWidth, shelfPageTracker])
  // Page buttons step from the page the counter shows; Reduce Motion jumps.
  const showRelativeShelfPage = useCallback((step: -1 | 1): void => {
    const pageIndex = getShopShelfCounterPage(shelfPageTracker.value, shelfScope, pageCount)
    const nextPageIndex = Math.max(0, Math.min(pageCount - 1, pageIndex + step))
    if (nextPageIndex !== pageIndex) scrollShelfToPage(nextPageIndex, !reduceMotion)
  }, [pageCount, reduceMotion, scrollShelfToPage, shelfPageTracker, shelfScope])
  // SHOP-2: re-tapping the selected Shop tab returns the shelf to its first page.
  const scrollShelfToStart = useCallback((): void => {
    scrollShelfToPage(0, !reduceMotion)
  }, [reduceMotion, scrollShelfToPage])
  useMainTabReselect("shop", scrollShelfToStart)
  // A deep link reveals its product's page; a list that has not laid out the
  // new data yet takes the pending page from onContentSizeChange.
  const pendingRevealPageRef = useRef<number | null>(null)
  const handledRevealRef = useRef<number | null>(null)
  const revealRequestId = props.revealRequest?.requestId
  const revealProductId = props.revealRequest?.productId
  useEffect(() => {
    if (revealRequestId === undefined || handledRevealRef.current === revealRequestId) return
    const page = findShopShelfPageIndex(productPages, revealProductId)
    if (page < 0) return
    handledRevealRef.current = revealRequestId
    pendingRevealPageRef.current = page
    scrollShelfToPage(page, false)
  }, [productPages, revealProductId, revealRequestId, scrollShelfToPage])
  const handleShelfContentSizeChange = useCallback((): void => {
    const page = pendingRevealPageRef.current
    if (page === null) return
    pendingRevealPageRef.current = null
    scrollShelfToPage(page, false)
  }, [scrollShelfToPage])
  const renderProductPage = useCallback(
    ({ item, index }: { item: ShopCatalogItem[][]; index: number }) => (
      <View
        key={`shop-page-${item[0]?.[0]?.id ?? index}`}
        style={[
          styles.closetProductPage,
          { width: productShelfWidth, gap: catalog.columnGap }
        ]}
      >
        {item.map((column, columnIndex) => (
          <View
            key={`shop-column-${column[0]?.id ?? columnIndex}`}
            style={styles.closetProductColumn}
          >
            {column.map((product) => (
              <ShopProductCard
                key={product.id}
                product={product}
                selected={product.id === props.selectedId}
                selectedCompact
                inventoryVerified={props.inventoryVerified}
                pendingInventoryLabel={props.pendingInventoryLabel}
                cardWidth={productCardWidth}
                cardHeight={catalog.productCardHeight}
                cardPadding={catalog.cardPadding}
                thumbHeight={catalog.productThumbHeight}
                locale={props.locale}
                onSelectProduct={props.onSelectProduct}
                removeAction={props.removeActionById?.get(product.id)}
                onRemoveProduct={props.onRemoveProduct}
                registerThumbnail={props.registerThumbnail}
              />
            ))}
          </View>
        ))}
      </View>
    ),
    [catalog, productCardWidth, productShelfWidth, props.inventoryVerified, props.locale, props.onRemoveProduct, props.onSelectProduct, props.pendingInventoryLabel, props.registerThumbnail, props.removeActionById, props.selectedId]
  )

  return (
    <View style={[styles.closetBrowserCard, { padding: catalog.cardPadding }]}>
      <View style={styles.closetBrowserHeader}>
        <View style={styles.closetBrowserCopy}>
          <Text style={styles.closetBrowserTitle}>{title}</Text>
          <Text style={styles.closetBrowserSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <ShopShelfPagination
          tracker={shelfPageTracker}
          scope={shelfScope}
          pageCount={pageCount}
          previousLabel={copy.previousPage}
          nextLabel={copy.nextPage}
          pageLabel={copy.shelfPage}
          onShowPage={showRelativeShelfPage}
        />
      </View>
      <View style={[styles.closetBrowserBody, catalog.accessibilityLayout && styles.closetBrowserBodyAccessibility, { gap: catalog.bodyGap }]}>
        <VerticalShopCategoryRail
          categories={props.categories}
          activeCategoryId={props.activeCategoryId}
          onSelectCategory={props.onSelectCategory}
          width={categoryRailWidth}
          locale={props.locale}
          accessibilityLayout={catalog.accessibilityLayout}
          height={catalog.productCardHeight * 2 + 8}
        />
        {/* The product shelf pages horizontally. It keeps a horizontal drag
            only while it can scroll that way: on its first page a drag
            towards a previous page, and on its last page a drag towards a
            next page, switches the main page instead. A single page (1/1)
            cannot scroll at all, so every horizontal drag there switches
            the main page. */}
        <MainTabPagerEdgeHandoffScrollOwner
          enabled={shelfOwnsHorizontalDrags}
          scrollOffset={shelfScrollOffset}
          maxScrollOffset={shelfMaxScrollOffset}
        >
          <Reanimated.FlatList
            ref={productScrollerRef}
            data={productPages}
            horizontal
            pagingEnabled
            scrollEnabled={shelfOwnsHorizontalDrags}
            bounces={false}
            onScroll={handleShelfScroll}
            scrollEventThrottle={16}
            onContentSizeChange={handleShelfContentSizeChange}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
            showsHorizontalScrollIndicator={false}
            style={[styles.closetProductScroller, { width: productShelfWidth, height: catalog.productCardHeight * 2 + 8 }]}
            contentContainerStyle={styles.closetProductShelf}
            keyExtractor={(item, index) => item[0]?.[0]?.id ?? `shop-page-${index}`}
            getItemLayout={(_data, index) => ({
              length: productShelfWidth,
              offset: productShelfWidth * index,
              index
            })}
            renderItem={renderProductPage}
          />
        </MainTabPagerEdgeHandoffScrollOwner>
      </View>
    </View>
  )
}
