import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  FlatList,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native"
import type { AvatarCatalogItem } from "../avatarV2.types"
import type { WardrobeCategoryId } from "../wardrobeCategoryModel"
import { WardrobeCatalogCard } from "./WardrobeCatalogCard"
import { WardrobeCatalogEmpty } from "./WardrobeCatalogEmpty"
import type { WardrobeCatalogCardModel } from "./wardrobeCatalogModel"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import {
  chunkWardrobePages,
  getWardrobeCardHeight,
  getWardrobeGridItemWidth,
  getWardrobeGridPageHeight,
  getWardrobePageIndex
} from "./wardrobeStageLayout"
import {
  WARDROBE_GRID_GAP,
  WARDROBE_GRID_ROW_GAP,
  wardrobeV2Styles as styles
} from "./wardrobeV2Styles"

const GRID_COLUMNS = 3

type WardrobePage = readonly WardrobeCatalogCardModel[]

/**
 * A fixed single row of three cards; further products page sideways and the
 * shown page is reported so the header can draw its dots. Cards keep their catalog order.
 */
export function WardrobeCatalogList(props: {
  activeCategory: WardrobeCategoryId
  cards: readonly WardrobeCatalogCardModel[]
  catalogOpacity: Animated.Value
  copy: WardrobeStudioCopy
  reduceMotion: boolean
  onEquip: (item: AvatarCatalogItem) => void
  onExploreShop: () => void
  onPageChange: (pageIndex: number) => void
}) {
  const {
    activeCategory,
    cards,
    catalogOpacity,
    copy,
    reduceMotion,
    onEquip,
    onExploreShop,
    onPageChange
  } = props
  const { fontScale } = useWindowDimensions()
  const [listWidth, setListWidth] = useState(0)
  const itemWidth = getWardrobeGridItemWidth(listWidth, WARDROBE_GRID_GAP)
  const cardHeight = getWardrobeCardHeight(itemWidth, fontScale)
  const pageHeight = getWardrobeGridPageHeight(cardHeight, WARDROBE_GRID_ROW_GAP)
  const pages = useMemo(() => chunkWardrobePages(cards), [cards])

  const renderPage = useCallback(({ item: page }: { item: WardrobePage }) => (
    <View style={[styles.gridPage, { width: listWidth, height: pageHeight }]}>
      {chunkWardrobePages(page, GRID_COLUMNS).map((row) => (
        <View key={row[0].item.id} style={[styles.gridRow, { height: cardHeight }]}>
          {row.map((card) => (
            <WardrobeCatalogCard
              key={card.item.id}
              item={card.item}
              equipped={card.equipped}
              itemStateLabel={card.itemStateLabel}
              wearingLabel={copy.wearing}
              locked={card.locked}
              width={itemWidth}
              previewSource={card.previewSource}
              thumbnailTransition={reduceMotion ? 0 : 120}
              onEquip={onEquip}
            />
          ))}
        </View>
      ))}
    </View>
  ), [cardHeight, copy.wearing, itemWidth, listWidth, onEquip, pageHeight, reduceMotion])

  // One list for every category: a category change swaps the data and jumps
  // back to the first page without animation, instead of remounting the list.
  const listRef = useRef<FlatList<WardrobePage>>(null)
  const shownCategoryRef = useRef(activeCategory)
  useLayoutEffect(() => {
    if (shownCategoryRef.current === activeCategory) return
    shownCategoryRef.current = activeCategory
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
    onPageChange(0)
  }, [activeCategory, onPageChange])

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    onPageChange(getWardrobePageIndex(event.nativeEvent.contentOffset.x, listWidth, pages.length))
  }, [listWidth, onPageChange, pages.length])

  const isMeasured = itemWidth > 0
  return (
    // The category fade stays on the native-driver opacity around the list.
    <Animated.View
      style={[styles.catalogArea, { opacity: catalogOpacity }]}
      onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
    >
      <View style={{ height: pageHeight }}>
        {isMeasured && pages.length === 0 ? (
          <WardrobeCatalogEmpty copy={copy} onExploreShop={onExploreShop} />
        ) : (
          <FlatList
            ref={listRef}
            data={isMeasured ? pages : []}
            horizontal
            pagingEnabled
            keyExtractor={(page) => page[0].item.id}
            getItemLayout={(_, index) => ({ length: listWidth, offset: listWidth * index, index })}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={pages.length > 1}
            onMomentumScrollEnd={handleMomentumEnd}
            renderItem={renderPage}
          />
        )}
      </View>
    </Animated.View>
  )
}
