import { useCallback, useLayoutEffect, useRef, type ReactElement } from "react"
import { Animated, type FlatList, View } from "react-native"
import Reanimated, { type ScrollHandlerProcessed } from "react-native-reanimated"
import type { AvatarCatalogItem } from "../avatarV2.types"
import {
  getWardrobeCarouselItemLayout,
  type WardrobeCategoryId
} from "../wardrobeCategoryModel"
import { WardrobeCatalogCard } from "./WardrobeCatalogCard"
import { WardrobeCatalogEmpty } from "./WardrobeCatalogEmpty"
import type { WardrobeCatalogCardModel } from "./wardrobeCatalogModel"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

function WardrobeCarouselGap(): ReactElement {
  return <View style={styles.carouselGap} />
}

export function WardrobeCatalogList(props: {
  activeCategory: WardrobeCategoryId
  cards: readonly WardrobeCatalogCardModel[]
  catalogOpacity: Animated.Value
  copy: WardrobeStudioCopy
  reduceMotion: boolean
  onEquip: (item: AvatarCatalogItem) => void
  onExploreShop: () => void
  /** UI-thread scroll handler (useWardrobeCarousel); it also reports settles. */
  onScroll: ScrollHandlerProcessed<Record<string, unknown>>
  onContentSizeChange: (width: number) => void
  onLayout: (event: { nativeEvent: { layout: { width: number } } }) => void
}) {
  const {
    activeCategory,
    cards,
    catalogOpacity,
    copy,
    reduceMotion,
    onEquip,
    onExploreShop,
    onScroll,
    onContentSizeChange,
    onLayout
  } = props

  const renderWardrobeItem = useCallback(({ item }: {
    item: WardrobeCatalogCardModel
  }) => (
    <WardrobeCatalogCard
      item={item.item}
      equipped={item.equipped}
      itemStateLabel={item.itemStateLabel}
      wearingLabel={copy.wearing}
      locked={item.locked}
      previewSource={item.previewSource}
      thumbnailTransition={reduceMotion ? 0 : 120}
      onEquip={onEquip}
    />
  ), [onEquip, reduceMotion, copy.wearing])

  // One list for every category: a category change swaps the data and jumps
  // back to the start without animation, instead of remounting the list.
  const listRef = useRef<FlatList<WardrobeCatalogCardModel>>(null)
  const shownCategoryRef = useRef(activeCategory)
  useLayoutEffect(() => {
    if (shownCategoryRef.current === activeCategory) return
    shownCategoryRef.current = activeCategory
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [activeCategory])

  return (
    // The category fade stays on the native-driver opacity around the list.
    <Animated.View style={{ opacity: catalogOpacity }}>
      <Reanimated.FlatList
        ref={listRef}
        horizontal
        data={cards}
        ListEmptyComponent={
          <WardrobeCatalogEmpty copy={copy} onExploreShop={onExploreShop} />
        }
        keyExtractor={(entry) => entry.item.id}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
        ItemSeparatorComponent={WardrobeCarouselGap}
        renderItem={renderWardrobeItem}
        getItemLayout={getWardrobeCarouselItemLayout}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
      />
    </Animated.View>
  )
}
