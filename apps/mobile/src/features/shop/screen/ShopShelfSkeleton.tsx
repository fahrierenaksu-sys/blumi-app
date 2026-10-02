import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { CROSSFADE_ENTERING } from "../../../ui/motion"
import type { AppLocale } from "../../session/appLocale"
import { getShopCopy } from "../shopCopy"
import type { ShopLayoutMetrics } from "../shopLayoutMetrics"
import { shopScreenStyles } from "./shopScreenStyles"

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
/**
 * Content that replaced the skeleton crossfades in (SHOP-5), with the shared
 * crossfade token; it stays under Reduce Motion because it is only opacity.
 */
export function useShopContentEntrance(input: {
  showSkeleton: boolean
}): typeof CROSSFADE_ENTERING | undefined {
  const [skeletonShown, setSkeletonShown] = useState(input.showSkeleton)
  if (input.showSkeleton && !skeletonShown) setSkeletonShown(true)
  return skeletonShown ? CROSSFADE_ENTERING : undefined
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
