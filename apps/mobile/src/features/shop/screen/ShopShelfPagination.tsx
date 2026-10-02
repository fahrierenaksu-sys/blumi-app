import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { uiTheme } from "../../../ui/theme"
import {
  formatShopShelfCounter,
  getShopShelfCounterPage,
  getShopShelfCounterTotal,
  getShopShelfPageButtons,
  type ShopShelfPageTracker
} from "./shopScreenModel"
import { shopScreenStyles as styles } from "./shopScreenStyles"
import { PressableScale } from "../../../ui/PressableScale"

const COUNTER_FONT_SCALE_LIMIT = 1.4

/**
 * The shelf's "2/4" counter and its page buttons. Every "n/total" label of
 * the current shelf is laid out once, stacked, and the UI thread shows the
 * one for the tracker's page by opacity, so the digits change on the frame
 * the page changes even while JS renders the next shelf page. React renders
 * this small header (button states, the spoken label) only when the page or
 * the shelf changes, never per scroll frame, and never re-renders the shelf.
 *
 * The labels are plain Text, not an animated TextInput `text` prop:
 * Reanimated hands settled animated props back to React, and TextInput
 * replaces a `text` prop with its value/defaultValue, which left the counter
 * stuck on the first shelf's "1/4".
 */
export const ShopShelfPagination = memo(function ShopShelfPagination(props: {
  tracker: SharedValue<ShopShelfPageTracker>
  /** The shelf on screen (mode and category); see getShopShelfScope. */
  scope: string
  pageCount: number
  previousLabel: string
  nextLabel: string
  pageLabel: (page: number, total: number) => string
  onShowPage: (step: -1 | 1) => void
}) {
  const { tracker, scope, pageCount, previousLabel, nextLabel, pageLabel, onShowPage } = props
  const total = getShopShelfCounterTotal(pageCount)
  const lastPage = total - 1
  const [shown, setShown] = useState(() => ({ scope, index: 0 }))
  useAnimatedReaction(
    () => getShopShelfCounterPage(tracker.value, scope, total),
    (index, previous) => {
      if (index !== previous) scheduleOnRN(setShown, { scope, index })
    },
    [scope, total]
  )
  // A new shelf starts on its first page even before the reaction reports.
  const shownIndex = shown.scope === scope ? Math.min(shown.index, lastPage) : 0
  const buttons = getShopShelfPageButtons(shownIndex, total)
  const atFirst = !buttons.canShowPrevious
  const atLast = !buttons.canShowNext
  return (
    <View style={styles.catalogPagination}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        disabled={atFirst}
        accessibilityState={{ disabled: atFirst }}
        onPress={() => onShowPage(-1)}
        style={[styles.catalogPageButton, atFirst && styles.catalogPageButtonDisabled]}
      >
        <Ionicons name="chevron-back" size={17} color={uiTheme.colors.primary} />
      </PressableScale>
      <View
        testID="shop-shelf-counter"
        accessible
        accessibilityRole="text"
        accessibilityLabel={pageLabel(shownIndex + 1, total)}
      >
        {/* The widest counter sizes the slot so changing digits never clip. */}
        <Text maxFontSizeMultiplier={COUNTER_FONT_SCALE_LIMIT} style={[styles.catalogPageCount, local.sizer]}>
          {formatShopShelfCounter(lastPage, total)}
        </Text>
        {Array.from({ length: total }, (_, index) => (
          <ShopShelfCounterLabel
            key={`${scope}:${total}:${index}`}
            tracker={tracker}
            scope={scope}
            pageCount={total}
            index={index}
          />
        ))}
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        disabled={atLast}
        accessibilityState={{ disabled: atLast }}
        onPress={() => onShowPage(1)}
        style={[styles.catalogPageButton, atLast && styles.catalogPageButtonDisabled]}
      >
        <Ionicons name="chevron-forward" size={17} color={uiTheme.colors.primary} />
      </PressableScale>
    </View>
  )
})

/** One "n/total" label, visible only while the tracker is on its page. */
const ShopShelfCounterLabel = memo(function ShopShelfCounterLabel(props: {
  tracker: SharedValue<ShopShelfPageTracker>
  scope: string
  pageCount: number
  index: number
}) {
  const { tracker, scope, pageCount, index } = props
  const visibility = useAnimatedStyle(() => ({
    opacity: getShopShelfCounterPage(tracker.value, scope, pageCount) === index ? 1 : 0
  }), [scope, pageCount, index])
  return (
    <Animated.Text
      accessible={false}
      importantForAccessibility="no"
      maxFontSizeMultiplier={COUNTER_FONT_SCALE_LIMIT}
      numberOfLines={1}
      style={[styles.catalogPageCount, local.value, visibility]}
    >
      {formatShopShelfCounter(index, pageCount)}
    </Animated.Text>
  )
})

const local = StyleSheet.create({
  sizer: {
    opacity: 0
  },
  value: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "none",
    textAlign: "center"
  }
})
