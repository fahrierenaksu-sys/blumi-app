import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type FlatList, Pressable, Text, View } from "react-native"
import Reanimated, { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { MainTabPagerEdgeHandoffScrollOwner } from "../../../ui/MainTabPagerGestureOwnership"
import { useMainTabReselect } from "../../../ui/layout/useMainTabReselect"
import type { AppLocale } from "../../session/appLocale"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"
import type { ShopCatalogItem } from "../shopCatalog"
import { getShopCopy } from "../shopCopy"
import type { ShopLayoutMetrics } from "../shopLayoutMetrics"
import type { ShopMode } from "../ShopNavigationControls"
import {
  buildShopShelfPages,
  findShopShelfPageIndex,
  formatShopShelfCounter,
  getShopShelfMaxScrollOffset,
  getShopShelfPageIndex,
  shouldShopShelfOwnHorizontalDrags,
  type ShopCategoryOption
} from "./shopScreenModel"
import { shopScreenStyles as styles } from "./shopScreenStyles"
import { ShopProductCard } from "./ShopProductCard"
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
  const [pageIndex, setPageIndex] = useState(0)
  // The live shelf offset, on the UI thread, decides whether a drag at the
  // first or last page belongs to the main pager (no JS per scroll frame).
  const shelfScrollOffset = useSharedValue(0)
  useEffect(() => {
    setPageIndex(0)
    // A jump to an offset the shelf already has emits no scroll event.
    shelfScrollOffset.value = 0
    productScrollerRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [props.activeCategoryId, props.mode, shelfScrollOffset])
  const productPages = useMemo(
    () => buildShopShelfPages(props.products, catalog.accessibilityLayout ? 1 : SHOP_PRODUCT_COLUMNS_PER_PAGE),
    [catalog.accessibilityLayout, props.products]
  )
  const shelfOwnsHorizontalDrags = shouldShopShelfOwnHorizontalDrags(productPages.length)
  const shelfMaxScrollOffset = getShopShelfMaxScrollOffset(productPages.length, productShelfWidth)
  const handleShelfScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      shelfScrollOffset.value = event.contentOffset.x
    }
  })
  // SHOP-4: the counter follows the live offset on the UI thread; React
  // renders only when the shown page changes, not per scroll frame.
  const pageCount = productPages.length
  useAnimatedReaction(
    () => getShopShelfPageIndex(shelfScrollOffset.value, productShelfWidth, pageCount),
    (index, previous) => {
      if (index !== previous) scheduleOnRN(setPageIndex, index)
    },
    [pageCount, productShelfWidth]
  )
  const scrollShelfToPage = useCallback((nextPageIndex: number, animated: boolean): void => {
    setPageIndex(nextPageIndex)
    productScrollerRef.current?.scrollToOffset({ offset: nextPageIndex * productShelfWidth, animated })
  }, [productShelfWidth])
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
              />
            ))}
          </View>
        ))}
      </View>
    ),
    [catalog, productCardWidth, productShelfWidth, props.inventoryVerified, props.locale, props.onSelectProduct, props.pendingInventoryLabel, props.selectedId]
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
        <View style={styles.catalogPagination}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.previousPage}
            disabled={pageIndex === 0}
            accessibilityState={{ disabled: pageIndex === 0 }}
            onPress={() => {
              scrollShelfToPage(pageIndex - 1, !reduceMotion)
            }}
            style={[styles.catalogPageButton, pageIndex === 0 && styles.catalogPageButtonDisabled]}
          >
            <Ionicons name="chevron-back" size={17} color={uiTheme.colors.primary} />
          </Pressable>
          <Text
            accessibilityLabel={copy.shelfPage(pageIndex + 1, Math.max(1, productPages.length))}
            maxFontSizeMultiplier={1.4}
            style={styles.catalogPageCount}
          >
            {formatShopShelfCounter(pageIndex, productPages.length)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.nextPage}
            disabled={pageIndex >= productPages.length - 1}
            accessibilityState={{ disabled: pageIndex >= productPages.length - 1 }}
            onPress={() => {
              scrollShelfToPage(pageIndex + 1, !reduceMotion)
            }}
            style={[styles.catalogPageButton, pageIndex >= productPages.length - 1 && styles.catalogPageButtonDisabled]}
          >
            <Ionicons name="chevron-forward" size={17} color={uiTheme.colors.primary} />
          </Pressable>
        </View>
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
