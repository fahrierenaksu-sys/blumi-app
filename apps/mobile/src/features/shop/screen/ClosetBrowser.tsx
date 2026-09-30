import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Pressable, Text, View } from "react-native"
import type { AppLocale } from "../../session/appLocale"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"
import type { ShopCatalogItem } from "../shopCatalog"
import { getShopCopy } from "../shopCopy"
import type { ShopLayoutMetrics } from "../shopLayoutMetrics"
import type { ShopMode } from "../ShopNavigationControls"
import type { ShopCategoryOption } from "./shopScreenModel"
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
  useEffect(() => {
    setPageIndex(0)
    productScrollerRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [props.activeCategoryId, props.mode])
  const productColumns = useMemo(() => {
    const columns: ShopCatalogItem[][] = []
    for (let index = 0; index < props.products.length; index += 2) {
      columns.push(props.products.slice(index, index + 2))
    }
    return columns
  }, [props.products])
  const productPages = useMemo(() => {
    const pages: ShopCatalogItem[][][] = []
    for (
      let index = 0;
      index < productColumns.length;
      index += catalog.accessibilityLayout ? 1 : SHOP_PRODUCT_COLUMNS_PER_PAGE
    ) {
      pages.push(
        productColumns.slice(index, index + (catalog.accessibilityLayout ? 1 : SHOP_PRODUCT_COLUMNS_PER_PAGE))
      )
    }
    return pages
  }, [catalog.accessibilityLayout, productColumns])
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
              const nextPageIndex = pageIndex - 1
              setPageIndex(nextPageIndex)
              productScrollerRef.current?.scrollToOffset({ offset: nextPageIndex * productShelfWidth, animated: !reduceMotion })
            }}
            style={[styles.catalogPageButton, pageIndex === 0 && styles.catalogPageButtonDisabled]}
          >
            <Ionicons name="chevron-back" size={17} color={uiTheme.colors.primary} />
          </Pressable>
          <Text style={styles.catalogPageCount}>{pageIndex + 1}/{Math.max(1, productPages.length)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.nextPage}
            disabled={pageIndex >= productPages.length - 1}
            accessibilityState={{ disabled: pageIndex >= productPages.length - 1 }}
            onPress={() => {
              const nextPageIndex = pageIndex + 1
              setPageIndex(nextPageIndex)
              productScrollerRef.current?.scrollToOffset({ offset: nextPageIndex * productShelfWidth, animated: !reduceMotion })
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
        <FlatList
          ref={productScrollerRef}
          data={productPages}
          horizontal
          pagingEnabled
          bounces={false}
          onMomentumScrollEnd={(event) => {
            const nextPageIndex = Math.max(0, Math.min(productPages.length - 1, Math.round(event.nativeEvent.contentOffset.x / productShelfWidth)))
            setPageIndex(nextPageIndex)
          }}
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
      </View>
    </View>
  )
}
