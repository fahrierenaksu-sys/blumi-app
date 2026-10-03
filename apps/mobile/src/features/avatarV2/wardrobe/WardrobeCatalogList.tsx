import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  type FlatList,
  View,
  useWindowDimensions,
  type StyleProp,
  StyleSheet,
  type ViewStyle
} from "react-native"
import Reanimated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
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
type WardrobeCatalogListProps = {
  activeCategory: WardrobeCategoryId
  cards: readonly WardrobeCatalogCardModel[]
  cardsByCategory: ReadonlyMap<WardrobeCategoryId, readonly WardrobeCatalogCardModel[]>
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
}

export function WardrobeCatalogList(props: WardrobeCatalogListProps) {
  const { activeCategory, cardsByCategory, cards, catalogStyle, switching } = props
  const [visitedCategories, setVisitedCategories] = useState(() => [activeCategory])
  const [listWidth, setListWidth] = useState(0)
  const { fontScale } = useWindowDimensions()
  const itemWidth = getWardrobeGridItemWidth(listWidth, WARDROBE_GRID_GAP)
  const pageHeight = getWardrobeGridPageHeight(getWardrobeCardHeight(itemWidth, fontScale), WARDROBE_GRID_ROW_GAP)
  const categories = visitedCategories.includes(activeCategory)
    ? visitedCategories
    : [...visitedCategories, activeCategory]
  useLayoutEffect(() => {
    setVisitedCategories((previous) => previous.includes(activeCategory) ? previous : [...previous, activeCategory])
  }, [activeCategory])

  return (
    <Reanimated.View
      pointerEvents={switching ? "none" : "auto"}
      style={[styles.catalogArea, catalogStyle]}
      onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
    >
      <View style={{ height: pageHeight }}>
        {categories.map((category) => (
          <WardrobeCategoryShelf
            key={category}
            cards={cardsByCategory.get(category) ?? (category === activeCategory ? cards : [])}
            active={category === activeCategory}
            listWidth={listWidth}
            copy={props.copy}
            onEquip={props.onEquip}
            onPreviewLocked={props.onPreviewLocked}
            onExploreShop={props.onExploreShop}
            onPageChange={props.onPageChange}
            pagePosition={props.pagePosition}
          />
        ))}
      </View>
    </Reanimated.View>
  )
}

// Only visited shelves mount. Native card/image instances and each shelf's
// position survive return visits, while current inventory/preview props flow in.
const WardrobeCategoryShelf = memo(function WardrobeCategoryShelf(props: Omit<WardrobeCatalogListProps,
  "activeCategory" | "cardsByCategory" | "catalogStyle" | "switching" | "reduceMotion"
> & {
  active: boolean
  listWidth: number
}) {
  const {
    active,
    listWidth,
    cards,
    copy,
    onEquip,
    onPreviewLocked,
    onExploreShop,
    onPageChange,
    pagePosition
  } = props
  const { fontScale } = useWindowDimensions()
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

  const listRef = useRef<FlatList<WardrobePage>>(null)
  const activeRef = useRef(active)
  useLayoutEffect(() => { activeRef.current = active }, [active])
  const reportPageChange = useCallback((index: number) => {
    if (activeRef.current) onPageChange(index)
  }, [onPageChange])
  const localPagePosition = useSharedValue(0)
  const pageCount = pages.length
  useLayoutEffect(() => {
    const position = Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.round(localPagePosition.value)))
    localPagePosition.value = position
    listRef.current?.scrollToOffset({ offset: position * listWidth, animated: false })
    if (active) {
      pagePosition.value = position
      onPageChange(Math.round(position))
    }
  }, [active, listWidth, localPagePosition, onPageChange, pageCount, pagePosition])

  // WRD-3: the dots follow the live offset on the UI thread; React hears
  // only page changes (for the VoiceOver page label), never every frame.
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (!active) return
      localPagePosition.value = listWidth > 0 ? event.contentOffset.x / listWidth : 0
      pagePosition.value = localPagePosition.value
    }
  }, [active, listWidth])
  useAnimatedReaction(
    () => active ? Math.max(0, Math.min(pageCount - 1, Math.round(localPagePosition.value))) : 0,
    (index, previous) => {
      if (active && previous !== null && index !== previous) scheduleOnRN(reportPageChange, index)
    },
    [active, pageCount, reportPageChange]
  )

  const isMeasured = itemWidth > 0
  return (
    <View
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, { opacity: active ? 1 : 0 }]}
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
            initialNumToRender={2}
            maxToRenderPerBatch={1}
            windowSize={3}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={active && pages.length > 1}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            renderItem={renderPage}
          />
        )}
      </View>
    </View>
  )
})
