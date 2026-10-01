import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { FadeIn } from "react-native-reanimated"
import type { AppLocale } from "../../session/appLocale"
import { getShopCopy } from "../shopCopy"
import type { ShopLayoutMetrics } from "../shopLayoutMetrics"
import { shopScreenStyles } from "./shopScreenStyles"

/** Crossfade from the skeleton into the real shelf (SHOP-5). */
export const SHOP_CONTENT_CROSSFADE_MS = 160
const SKELETON_RAIL_CHIPS = 4
const SKELETON_CARDS = 4

/**
 * SHOP-5: while the first inventory snapshot loads, the Shop draws the shape
 * of its showcase and shelf instead of a spinner card, so the real content
 * replaces it in place. Static (no shimmer), so Reduce Motion needs nothing.
 */
export function ShopShelfSkeleton(props: { layoutMetrics: ShopLayoutMetrics; locale: AppLocale }) {
  const copy = getShopCopy(props.locale)
  const { catalog, preview } = props.layoutMetrics
  return (
    <View
      testID="shop-status-loading"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${copy.loading.title}. ${copy.loading.body}`}
      accessibilityLiveRegion="polite"
      style={{ gap: props.layoutMetrics.sectionGap }}
    >
      <View style={[shopScreenStyles.showcaseCard, styles.block, { height: preview.avatarStageHeight }]} />
      <View style={[shopScreenStyles.closetBrowserCard, { padding: catalog.cardPadding }]}>
        <View style={[styles.bar, styles.titleBar]} />
        <View style={[styles.bar, styles.subtitleBar]} />
        <View style={[shopScreenStyles.closetBrowserBody, catalog.accessibilityLayout && shopScreenStyles.closetBrowserBodyAccessibility, { gap: catalog.bodyGap }]}>
          {catalog.accessibilityLayout ? null : (
            <View style={{ width: catalog.categoryRailWidth, gap: 6 }}>
              {Array.from({ length: SKELETON_RAIL_CHIPS }, (_, index) => (
                <View key={index} style={[styles.block, styles.chip]} />
              ))}
            </View>
          )}
          <View style={[styles.cards, { width: catalog.productShelfWidth, gap: catalog.columnGap }]}>
            {Array.from({ length: catalog.accessibilityLayout ? 2 : SKELETON_CARDS }, (_, index) => (
              <View
                key={index}
                style={[styles.block, { width: catalog.productCardWidth, height: catalog.productCardHeight }]}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}

/**
 * The content fades in only when it replaces a skeleton the user saw, never
 * on a normal open, and never under Reduce Motion.
 */
export function useShopContentEntrance(input: {
  showSkeleton: boolean
  reduceMotion: boolean
}): ReturnType<typeof FadeIn.duration> | undefined {
  const [skeletonShown, setSkeletonShown] = useState(input.showSkeleton)
  if (input.showSkeleton && !skeletonShown) setSkeletonShown(true)
  if (!skeletonShown || input.reduceMotion) return undefined
  return FadeIn.duration(SHOP_CONTENT_CROSSFADE_MS)
}

const styles = StyleSheet.create({
  block: {
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 230, 242, 0.62)"
  },
  bar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255, 230, 242, 0.8)"
  },
  titleBar: {
    width: "46%",
    marginBottom: 6
  },
  subtitleBar: {
    width: "30%",
    height: 9,
    marginBottom: 10
  },
  chip: {
    height: 44,
    borderRadius: 12
  },
  cards: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8
  }
})
