import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo, useCallback, useMemo } from "react"
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native"
import { Gesture, GestureDetector, State } from "react-native-gesture-handler"
import Reanimated, {
  cancelAnimation,
  Easing,
  type EntryAnimationsValues,
  type LayoutAnimationsValues,
  type StyleProps,
  useAnimatedStyle,
  useSharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { hapticLight } from "../../ui/haptics"
import { useMainTabPagerGestureRef } from "../../ui/MainTabPagerGestureOwnership"
import { animateSegment, animateTo, animateToAfter, resolveMotion, useMotion, type Motion } from "../../ui/motion"
import { PressableScale } from "../../ui/PressableScale"
import { uiTheme } from "../../ui/theme"
import type { AppLocale } from "../session/appLocale"
import { getShopProductThumbnailBounds, getShopProductThumbnailSource } from "./shopAssets"
import type { ShopCombinationItem } from "./shopCombinationSummary"
import {
  getCombinationRowLeave,
  getCombinationRowRemoveThreshold,
  getCombinationRowRevealProgress,
  getCombinationRowSwipeClaim,
  getCombinationRowSwipeOffset,
  resolveCombinationRowSwipeRelease
} from "./shopCombinationRowSwipe"
import { getShopCopy } from "./shopCopy"
import { formatCoins } from "./shopFormatters"
import { shopPreviewStyles as styles } from "./shopPreviewStyles"
import { getShopThumbnailLayout } from "./shopThumbnailLayout"

/** Visual size of the X; its touch target is 44 pt (see removeButton). */
const REMOVE_ICON_SIZE = 16
/** How much bigger the backdrop icon gets when a release would remove the row. */
const ARMED_ICON_SCALE = 1.15

type RowAnimation = { initialValues: StyleProps; animations: StyleProps }

function createRowListMotion(motion: Motion) {
  const { fadeIn, smooth } = motion
  // A row pulled up from the next page fades in where it lands.
  const entering = (_values: EntryAnimationsValues): RowAnimation => {
    "worklet"
    return { initialValues: { opacity: 0 }, animations: { opacity: animateTo(1, fadeIn) } }
  }
  // The rows below a removed row glide up on the UI thread (like the MiniRoom
  // speech bubble stack); under Reduce Motion they move at once.
  const layout = motion.reduceMotion
    ? undefined
    : (values: LayoutAnimationsValues): RowAnimation => {
      "worklet"
      return {
        initialValues: { originX: values.currentOriginX, originY: values.currentOriginY },
        animations: {
          originX: animateTo(values.targetOriginX, smooth),
          originY: animateTo(values.targetOriginY, smooth)
        }
      }
    }
  return { entering, layout }
}

const FULL_LIST_MOTION = createRowListMotion(resolveMotion(false))
const REDUCED_LIST_MOTION = createRowListMotion(resolveMotion(true))

/**
 * One piece of the Shop outfit list. Tapping it shows the piece; when the
 * piece is only tried on (`removable`), a small X or a swipe to the right
 * takes it out of the outfit. The swipe reveals a red backdrop; released past
 * the threshold the row slides away with a light haptic and the rows below
 * glide up, released before it springs back. Under Reduce Motion the row does
 * not slide: the backdrop fades in with the drag and the row fades out.
 * Removing only edits the try-on draft (useShopCardRemoval).
 */
export const ShopCombinationRow = memo(function ShopCombinationRow(props: {
  item: ShopCombinationItem
  locale: AppLocale
  selected: boolean
  onSelect?: (id: string) => void
  removable: boolean
  /** Takes the piece out of the outfit; false when the outfit cannot change now. */
  onRemove?: (id: string) => boolean
}) {
  const { item, locale, selected, onSelect, onRemove } = props
  const removable = props.removable && onRemove !== undefined
  const copy = getShopCopy(locale)
  const motion = useMotion()
  // Worklets capture these plain tokens, not the whole motion object.
  const { reduceMotion, fadeIn, fadeOut, snappy, press } = motion
  const listMotion = reduceMotion ? REDUCED_LIST_MOTION : FULL_LIST_MOTION
  const pagerGestureRef = useMainTabPagerGestureRef()
  const source = getShopProductThumbnailSource(item.id)
  const frame = getShopThumbnailLayout(getShopProductThumbnailBounds(item.id), 34, 34)

  const offset = useSharedValue(0)
  const rowOpacity = useSharedValue(1)
  const iconScale = useSharedValue(1)
  const rowWidth = useSharedValue(0)
  const armed = useSharedValue(false)
  const leaving = useSharedValue(false)
  const touchStartX = useSharedValue(0)
  const touchStartY = useSharedValue(0)

  const itemId = item.id
  // If the outfit could not change (a purchase started meanwhile), the row
  // comes back instead of staying invisible.
  const commitRemove = useCallback((): void => {
    if (onRemove?.(itemId)) return
    leaving.value = false
    armed.value = false
    iconScale.value = 1
    offset.value = 0
    rowOpacity.value = animateTo(1, fadeIn)
  }, [armed, fadeIn, iconScale, itemId, leaving, offset, onRemove, rowOpacity])

  // Slides the row off to the right (or fades it under Reduce Motion), then
  // removes the piece the moment the row is gone: an ease-out timing, not a
  // spring (a spring rests long after the row has left). Its fade ends with
  // the slide. Runs from the pan (UI thread) and from the X (JS).
  const leave = useCallback((velocityX: number): void => {
    "worklet"
    if (leaving.value) return
    leaving.value = true
    const done = (): void => {
      "worklet"
      scheduleOnRN(commitRemove)
    }
    if (reduceMotion) {
      rowOpacity.value = animateTo(0, fadeOut, done)
      return
    }
    const slide = getCombinationRowLeave({ offset: offset.value, velocityX, rowWidth: rowWidth.value })
    offset.value = animateSegment(slide.to, { durationMs: slide.durationMs, easing: Easing.out(Easing.cubic) }, done)
    rowOpacity.value = animateToAfter(Math.max(0, slide.durationMs - fadeOut.duration), 0, fadeOut)
  }, [commitRemove, fadeOut, leaving, offset, reduceMotion, rowOpacity, rowWidth])

  const restore = useCallback((velocityX: number): void => {
    "worklet"
    armed.value = false
    iconScale.value = animateTo(1, press)
    offset.value = animateTo(0, snappy, undefined, velocityX)
  }, [armed, iconScale, offset, press, snappy])

  const pressRemove = useCallback((): void => {
    if (!removable) return
    hapticLight()
    leave(0)
  }, [leave, removable])

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(removable)
    .manualActivation(true)
    .blocksExternalGesture(...(pagerGestureRef ? [pagerGestureRef] : []))
    .onTouchesDown((event) => {
      "worklet"
      const touch = event.allTouches[0]
      if (!touch) return
      touchStartX.value = touch.absoluteX
      touchStartY.value = touch.absoluteY
    })
    .onTouchesMove((event, stateManager) => {
      "worklet"
      const touch = event.allTouches[0]
      if (!touch || event.state !== State.BEGAN) return
      const claim = getCombinationRowSwipeClaim(touch.absoluteX - touchStartX.value, touch.absoluteY - touchStartY.value)
      if (claim === "claim" && !leaving.value) stateManager.activate()
      else if (claim === "fail") stateManager.fail()
    })
    .onStart(() => {
      "worklet"
      cancelAnimation(offset)
      armed.value = false
    })
    .onUpdate((event) => {
      "worklet"
      offset.value = getCombinationRowSwipeOffset(event.translationX)
      const threshold = getCombinationRowRemoveThreshold(rowWidth.value)
      const nowArmed = getCombinationRowRevealProgress(offset.value, threshold) >= 1
      if (nowArmed === armed.value) return
      armed.value = nowArmed
      iconScale.value = animateTo(nowArmed && !reduceMotion ? ARMED_ICON_SCALE : 1, press)
      // The light tap marks the point where letting go removes the piece.
      if (nowArmed) scheduleOnRN(hapticLight)
    })
    .onEnd((event, success) => {
      "worklet"
      if (!success) {
        restore(0)
        return
      }
      const release = resolveCombinationRowSwipeRelease({
        translationX: event.translationX,
        velocityX: event.velocityX,
        rowWidth: rowWidth.value
      })
      if (release === "restore") {
        restore(event.velocityX)
        return
      }
      // A flick that never armed the row still gets its one haptic.
      if (!armed.value) scheduleOnRN(hapticLight)
      leave(event.velocityX)
    }), [
    armed,
    iconScale,
    leave,
    leaving,
    offset,
    pagerGestureRef,
    press,
    reduceMotion,
    removable,
    restore,
    rowWidth,
    touchStartX,
    touchStartY
  ])

  const onLayout = useCallback((event: LayoutChangeEvent): void => {
    rowWidth.value = event.nativeEvent.layout.width
  }, [rowWidth])

  const containerStyle = useAnimatedStyle(() => ({ opacity: rowOpacity.value }))
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reduceMotion ? 0 : offset.value }]
  }), [reduceMotion])
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: leaving.value
      ? 1
      : getCombinationRowRevealProgress(offset.value, getCombinationRowRemoveThreshold(rowWidth.value))
  }))
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }))

  const priceLabel = item.owned
    ? copy.owned
    : item.price === null ? copy.combination.priceNeedsRefresh : `${formatCoins(item.price, locale)} ${copy.coins}`
  const title = item.title ?? copy.combination.itemUnavailable
  return (
    <Reanimated.View
      entering={listMotion.entering}
      layout={listMotion.layout}
      onLayout={onLayout}
      style={[local.container, containerStyle]}
    >
      {removable ? (
        <Reanimated.View pointerEvents="none" style={[local.backdrop, backdropStyle]}>
          <Reanimated.View style={iconStyle}>
            <Ionicons name="trash-outline" size={16} color={uiTheme.colors.surface} />
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
      <GestureDetector gesture={gesture}>
        <Reanimated.View style={slideStyle}>
          <PressableScale
            style={[styles.combinationRow, selected ? styles.combinationRowSelected : null, removable ? local.rowWithRemove : null]}
            onPress={() => onSelect?.(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${title}, ${priceLabel}`}
            accessibilityActions={removable ? [{ name: "remove", label: copy.combination.removeFromOutfit }] : undefined}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "remove") pressRemove()
            }}
          >
            <View style={styles.combinationThumbnail}>
              {source ? <ExpoImage source={source} contentFit="contain" cachePolicy="memory-disk" priority={selected ? "high" : "normal"} transition={0} style={frame ? { position: "absolute", ...frame } : { width: 34, height: 34 }} /> : <Ionicons name="shirt-outline" size={18} color={uiTheme.colors.primary} />}
            </View>
            <View style={styles.combinationRowCopy}>
              <Text style={styles.combinationItemTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.combinationItemPrice} numberOfLines={1}>{item.owned ? `✓ ${copy.owned}` : item.price === null ? "—" : `◇ ${formatCoins(item.price, locale)}`}</Text>
            </View>
          </PressableScale>
          {removable ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${copy.combination.removeFromOutfit}: ${title}`}
              onPress={pressRemove}
              hitSlop={REMOVE_HIT_SLOP}
              style={local.removeButton}
            >
              <View style={local.removeIcon}>
                <Ionicons name="close" size={11} color={uiTheme.colors.primary} />
              </View>
            </PressableScale>
          ) : null}
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  )
})

/** The X box is 30 pt; this slop makes its touch target 44 pt. */
const REMOVE_HIT_SLOP = { top: 7, bottom: 7, left: 7, right: 7 } as const

const local = StyleSheet.create({
  // Not clipped: the X's 44 pt touch target reaches past the row's edges.
  container: {
    borderRadius: 11
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    borderRadius: 11,
    backgroundColor: uiTheme.colors.danger,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12
  },
  rowWithRemove: {
    paddingRight: 26
  },
  removeButton: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 3,
    paddingRight: 3
  },
  removeIcon: {
    width: REMOVE_ICON_SIZE,
    height: REMOVE_ICON_SIZE,
    borderRadius: REMOVE_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: uiTheme.colors.primary
  }
})
