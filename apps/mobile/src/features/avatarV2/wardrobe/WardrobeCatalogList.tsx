import { useCallback, type ReactElement } from "react"
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent, View } from "react-native"
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
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onScrollSettled: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
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
    onScrollSettled,
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

  return (
    <Animated.FlatList
      key={activeCategory}
      style={{ opacity: catalogOpacity }}
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
      onScrollEndDrag={onScrollSettled}
      onMomentumScrollEnd={onScrollSettled}
      onContentSizeChange={onContentSizeChange}
      onLayout={onLayout}
    />
  )
}
