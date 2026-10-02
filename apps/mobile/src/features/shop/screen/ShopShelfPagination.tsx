import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native"
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { uiTheme } from "../../../ui/theme"
import { formatShopShelfCounter, type ShopShelfPageTracker } from "./shopScreenModel"
import { shopScreenStyles as styles } from "./shopScreenStyles"

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)
const COUNTER_FONT_SCALE_LIMIT = 1.4

/**
 * The shelf's "2/4" counter and its page buttons. The digits are written on
 * the UI thread from the scroll-stepped tracker, so they change on the frame
 * the page changes even while JS renders the next shelf page. React renders
 * this small header (button states, the spoken label) only when the page
 * changes, never per scroll frame, and never re-renders the shelf itself.
 */
export const ShopShelfPagination = memo(function ShopShelfPagination(props: {
  tracker: SharedValue<ShopShelfPageTracker>
  pageCount: number
  previousLabel: string
  nextLabel: string
  pageLabel: (page: number, total: number) => string
  onShowPage: (step: -1 | 1) => void
}) {
  const { tracker, pageCount, previousLabel, nextLabel, pageLabel, onShowPage } = props
  const lastPage = Math.max(0, pageCount - 1)
  const [pageIndex, setPageIndex] = useState(0)
  // Frozen at mount: after that the UI thread owns the digits, and a changing
  // defaultValue would make React push a competing text.
  const [initialText] = useState(() => formatShopShelfCounter(0, pageCount))
  useAnimatedReaction(
    () => Math.max(0, Math.min(lastPage, tracker.value.page)),
    (index, previous) => {
      if (index !== previous) scheduleOnRN(setPageIndex, index)
    },
    [lastPage]
  )
  const counterProps = useAnimatedProps(() => {
    const text = formatShopShelfCounter(Math.max(0, Math.min(lastPage, tracker.value.page)), pageCount)
    // `text` is the native TextInput prop; it is not part of TextInputProps.
    return { text } as Partial<TextInputProps>
  }, [lastPage, pageCount])
  const shownIndex = Math.min(pageIndex, lastPage)
  const atFirst = shownIndex === 0
  const atLast = shownIndex >= lastPage
  return (
    <View style={styles.catalogPagination}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        disabled={atFirst}
        accessibilityState={{ disabled: atFirst }}
        onPress={() => onShowPage(-1)}
        style={[styles.catalogPageButton, atFirst && styles.catalogPageButtonDisabled]}
      >
        <Ionicons name="chevron-back" size={17} color={uiTheme.colors.primary} />
      </Pressable>
      <View
        testID="shop-shelf-counter"
        accessible
        accessibilityRole="text"
        accessibilityLabel={pageLabel(shownIndex + 1, Math.max(1, pageCount))}
      >
        {/* The widest counter sizes the slot so changing digits never clip. */}
        <Text maxFontSizeMultiplier={COUNTER_FONT_SCALE_LIMIT} style={[styles.catalogPageCount, local.sizer]}>
          {formatShopShelfCounter(lastPage, pageCount)}
        </Text>
        <AnimatedTextInput
          editable={false}
          caretHidden
          contextMenuHidden
          scrollEnabled={false}
          underlineColorAndroid="transparent"
          importantForAccessibility="no"
          maxFontSizeMultiplier={COUNTER_FONT_SCALE_LIMIT}
          defaultValue={initialText}
          animatedProps={counterProps}
          style={[styles.catalogPageCount, local.value]}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        disabled={atLast}
        accessibilityState={{ disabled: atLast }}
        onPress={() => onShowPage(1)}
        style={[styles.catalogPageButton, atLast && styles.catalogPageButtonDisabled]}
      >
        <Ionicons name="chevron-forward" size={17} color={uiTheme.colors.primary} />
      </Pressable>
    </View>
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
    margin: 0,
    marginHorizontal: 5,
    padding: 0,
    pointerEvents: "none",
    textAlign: "center",
    textAlignVertical: "center"
  }
})
