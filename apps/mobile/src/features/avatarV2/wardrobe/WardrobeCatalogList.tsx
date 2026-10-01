import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  type FlatList,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle
} from "react-native"
import Reanimated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  type AnimatedStyle,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
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
  getWardrobeGridPageHeight
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
  /** UI-thread opacity of the category swap (useWardrobeCatalogTransition). */
  catalogStyle: StyleProp<AnimatedStyle<ViewStyle>>
  /** True while the previous category fades out; its cards take no taps. */
  switching: boolean
  copy: WardrobeStudioCopy
  reduceMotion: boolean
  onEquip: (item: AvatarCatalogItem) => void
  onPreviewLocked: (item: AvatarCatalogItem) => void
  onExploreShop: () => void
  onPageChange: (pageIndex: number) => void
  /** Written on the UI thread: the list position in pages, for the dots. */
  pagePosition: SharedValue<number>
}) {
  const {
    activeCategory,
    cards,
    catalogStyle,
    switching,
    copy,
    onEquip,
    onPreviewLocked,
    onExploreShop,
    onPageChange,
    pagePosition
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
              previewing={card.previewing}
              lockedHint={copy.lockedHint}
              width={itemWidth}
              previewSource={card.previewSource}
              onEquip={onEquip}
              onPreviewLocked={onPreviewLocked}
            />
          ))}
        </View>
      ))}
    </View>
  ), [cardHeight, copy.lockedHint, copy.wearing, itemWidth, listWidth, onEquip, onPreviewLocked, pageHeight])

  // One list for every category: a category change swaps the data and jumps
  // back to the first page without animation, instead of remounting the list.
  const listRef = useRef<FlatList<WardrobePage>>(null)
  const shownCategoryRef = useRef(activeCategory)
  useLayoutEffect(() => {
    if (shownCategoryRef.current === activeCategory) return
    shownCategoryRef.current = activeCategory
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
    pagePosition.value = 0
    onPageChange(0)
  }, [activeCategory, onPageChange, pagePosition])

  // WRD-3: the dots follow the live offset on the UI thread; React hears
  // only page changes (for the VoiceOver page label), never every frame.
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      pagePosition.value = listWidth > 0 ? event.contentOffset.x / listWidth : 0
    }
  }, [listWidth])
  const pageCount = pages.length
  useAnimatedReaction(
    () => Math.max(0, Math.min(pageCount - 1, Math.round(pagePosition.value))),
    (index, previous) => {
      if (previous !== null && index !== previous) scheduleOnRN(onPageChange, index)
    },
    [onPageChange, pageCount]
  )

  const isMeasured = itemWidth > 0
  return (
    // The category swap fades this wrapper on the UI thread (WRD-1).
    <Reanimated.View
      pointerEvents={switching ? "none" : "auto"}
      style={[styles.catalogArea, catalogStyle]}
      onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
    >
      <View style={{ height: pageHeight }}>
        {isMeasured && pages.length === 0 ? (
          <WardrobeCatalogEmpty copy={copy} onExploreShop={onExploreShop} />
        ) : (
          <Reanimated.FlatList
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
            onScroll={handleScroll}
            scrollEventThrottle={16}
            renderItem={renderPage}
          />
        )}
      </View>
    </Reanimated.View>
  )
}
