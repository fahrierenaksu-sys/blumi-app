import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo } from "react"
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import Reanimated, { FadeIn, ZoomIn } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useReducedMotion } from "../../../ui/animations"
import { SwipeDismissSheet, SwipeDismissSheetScrollView } from "../../../ui/SwipeDismissSheet"
import { uiTheme } from "../../../ui/theme"
import type { AppLocale } from "../../session/appLocale"
import { getShopProductThumbnailSource } from "../shopAssets"
import {
  getShopCheckoutSummary,
  isShopCheckoutDismissible,
  type ShopCheckout,
  type ShopCheckoutLine
} from "../shopCheckoutModel"
import { getShopCopy, type ShopCopy } from "../shopCopy"
import { formatCoins } from "../shopFormatters"
import { PressableScale } from "../../../ui/PressableScale"

const COIN_COLOR = "#D79111"
const TEXT_SCALE_CAP = 1.6

/**
 * SHOP-1: one bottom sheet for "Buy the look" (the app's SwipeDismissSheet
 * pattern). Review lists every piece, the total and the balance after the
 * purchase; one confirm buys them in order and each line ticks after its
 * server-confirmed purchase. A failure stops the queue and shows which
 * pieces are yours and which were not charged.
 */
export function ShopCheckoutSheet(props: {
  checkout: ShopCheckout | null
  /** Server-confirmed balance, or null while inventory is unverified. */
  balance: number | null
  canPerformActions: boolean
  locale: AppLocale
  onConfirm: () => void
  onClose: () => void
  onRetry: () => void
}) {
  const { checkout, balance, canPerformActions, locale, onConfirm, onClose, onRetry } = props
  const copy = getShopCopy(locale)
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const dismissible = isShopCheckoutDismissible(checkout)
  return (
    <Modal visible={checkout !== null} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.overlay}>
        {checkout ? (
          <SwipeDismissSheet
            onDismiss={onClose}
            enabled={dismissible}
            backdrop={{
              style: styles.backdrop,
              onPress: dismissible ? onClose : undefined,
              accessibilityLabel: copy.checkout.closeAccessibility
            }}
            accessibilityViewIsModal
            testID="shop-checkout-sheet"
            style={[styles.sheet, { maxHeight: height * 0.86, paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <CheckoutContent
              checkout={checkout}
              balance={balance}
              canPerformActions={canPerformActions}
              copy={copy}
              locale={locale}
              reduceMotion={reduceMotion}
              onConfirm={onConfirm}
              onClose={onClose}
              onRetry={onRetry}
            />
          </SwipeDismissSheet>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  )
}

function CheckoutContent(props: {
  checkout: ShopCheckout
  balance: number | null
  canPerformActions: boolean
  copy: ShopCopy
  locale: AppLocale
  reduceMotion: boolean
  onConfirm: () => void
  onClose: () => void
  onRetry: () => void
}) {
  const { checkout, balance, canPerformActions, copy, locale, reduceMotion } = props
  const text = copy.checkout
  const summary = getShopCheckoutSummary(checkout, balance)
  const coins = (value: number) => formatCoins(value, locale)
  const totalLabel = summary.total === null ? "—" : coins(summary.total)
  const isReview = checkout.phase === "review"
  const isBusy = checkout.phase === "purchasing" || checkout.phase === "applying"
  const canConfirm = summary.canConfirm && canPerformActions
  const status = checkout.phase === "purchasing"
    ? text.buying
    : checkout.phase === "applying"
      ? text.applying
      : checkout.phase === "applied"
        ? text.applied
        : checkout.phase === "apply_failed"
          ? text.applyFailed
          : checkout.phase === "partial"
            ? summary.purchasedCount > 0
              ? text.partial(summary.purchasedCount, checkout.lines.length)
              : text.noneCharged
            : null
  const reviewNotice = !isReview
    ? null
    : !canPerformActions
      ? copy.offline.actionUnavailable
      : summary.total === null
        ? text.priceUnknown
        : summary.shortfall > 0
          ? text.shortfall(coins(summary.shortfall))
          : null
  const canRetry = checkout.phase === "apply_failed" || (
    checkout.phase === "partial" &&
    checkout.lines.some((line) => line.status === "failed" &&
      line.failureReason !== "not_enough_coins" && line.failureReason !== "invalid_item")
  )

  return (
    <>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.title}>
            {text.title}
          </Text>
          <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.subtitle}>
            {text.itemCount(checkout.lines.length)}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={text.closeAccessibility}
          accessibilityState={{ disabled: isBusy }}
          disabled={isBusy}
          onPress={props.onClose}
          hitSlop={10}
          style={[styles.closeButton, isBusy ? styles.disabled : null]}
        >
          <Ionicons name="close" size={20} color={uiTheme.colors.textMuted} />
        </PressableScale>
      </View>

      <SwipeDismissSheetScrollView style={styles.lines} contentContainerStyle={styles.linesContent}>
        {checkout.lines.map((line) => (
          <CheckoutLine
            key={line.productId}
            line={line}
            copy={copy}
            locale={locale}
            reduceMotion={reduceMotion}
          />
        ))}
      </SwipeDismissSheetScrollView>

      <View style={styles.summary}>
        <SummaryRow label={text.total} value={totalLabel} strong />
        {isReview ? (
          <SummaryRow
            label={text.balanceAfter}
            value={summary.balanceAfter === null ? "—" : coins(summary.balanceAfter)}
          />
        ) : (
          <SummaryRow label={text.balance} value={balance === null ? "—" : coins(balance)} />
        )}
      </View>

      {reviewNotice || status ? (
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={TEXT_SCALE_CAP}
          style={[
            styles.notice,
            checkout.phase === "partial" || checkout.phase === "apply_failed" || reviewNotice
              ? styles.noticeWarning
              : null
          ]}
        >
          {reviewNotice ?? status}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {isReview ? (
          <>
            <SheetButton label={text.cancel} kind="secondary" onPress={props.onClose} />
            <SheetButton
              testID="shop-checkout-confirm"
              label={text.confirm(totalLabel)}
              accessibilityLabel={text.confirmAccessibility(totalLabel)}
              kind="primary"
              disabled={!canConfirm}
              onPress={props.onConfirm}
            />
          </>
        ) : isBusy ? (
          <View accessibilityRole="progressbar" accessibilityLabel={status ?? text.buying} style={styles.busy}>
            <ActivityIndicator color={uiTheme.colors.primary} />
          </View>
        ) : (
          <>
            {canRetry ? <SheetButton label={text.retry} kind="secondary" onPress={props.onRetry} /> : null}
            <SheetButton
              label={checkout.phase === "applied" ? text.done : text.close}
              kind="primary"
              onPress={props.onClose}
            />
          </>
        )}
      </View>
    </>
  )
}

const CheckoutLine = memo(function CheckoutLine(props: {
  line: ShopCheckoutLine
  copy: ShopCopy
  locale: AppLocale
  reduceMotion: boolean
}) {
  const { line, copy, locale, reduceMotion } = props
  const title = line.title ?? copy.checkout.unknownItem
  const price = line.priceCoins === null ? "—" : formatCoins(line.priceCoins, locale)
  const statusLabel = line.status === "failed"
    ? copy.combination.purchaseFailure(line.failureReason)
    : line.status === "not_charged"
      ? copy.checkout.lineStatus.notCharged
      : copy.checkout.lineStatus[line.status]
  const thumbnail = getShopProductThumbnailSource(line.productId)
  // Each status icon enters once when it changes; Reduce Motion shows it at once.
  const entering = reduceMotion ? undefined : ZoomIn.springify().dampingRatio(0.7).duration(320)
  return (
    <View
      accessible
      accessibilityLabel={copy.checkout.lineAccessibility(title, price, statusLabel)}
      style={[styles.line, line.status === "not_charged" ? styles.lineMuted : null]}
    >
      <View style={styles.thumb}>
        {thumbnail ? (
          <ExpoImage source={thumbnail} contentFit="contain" transition={0} style={styles.thumbImage} />
        ) : (
          <Ionicons name="shirt-outline" size={18} color={uiTheme.colors.textMuted} />
        )}
      </View>
      <View style={styles.lineCopy}>
        <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} numberOfLines={2} style={styles.lineTitle}>
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_SCALE_CAP}
          numberOfLines={2}
          style={[styles.lineStatus, line.status === "failed" ? styles.lineStatusFailed : null]}
        >
          {statusLabel}
        </Text>
      </View>
      <View style={styles.linePrice}>
        <Ionicons name="diamond" size={12} color={COIN_COLOR} />
        <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.linePriceText}>{price}</Text>
      </View>
      <View style={styles.lineIcon}>
        {line.status === "purchasing" ? (
          <ActivityIndicator size="small" color={uiTheme.colors.primary} />
        ) : line.status === "purchased" ? (
          <Reanimated.View key="purchased" entering={entering}>
            <Ionicons name="checkmark-circle" size={22} color={uiTheme.colors.successInk} />
          </Reanimated.View>
        ) : line.status === "failed" ? (
          <Reanimated.View key="failed" entering={reduceMotion ? undefined : FadeIn.duration(160)}>
            <Ionicons name="alert-circle" size={22} color={uiTheme.colors.dangerInk} />
          </Reanimated.View>
        ) : null}
      </View>
    </View>
  )
})

function SummaryRow(props: { label: string; value: string; strong?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${props.label}: ${props.value}`} style={styles.summaryRow}>
      <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={[styles.summaryLabel, props.strong ? styles.summaryStrong : null]}>
        {props.label}
      </Text>
      <View style={styles.summaryValue}>
        <Ionicons name="diamond" size={12} color={COIN_COLOR} />
        <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={[styles.summaryLabel, props.strong ? styles.summaryStrong : null]}>
          {props.value}
        </Text>
      </View>
    </View>
  )
}

function SheetButton(props: {
  label: string
  accessibilityLabel?: string
  kind: "primary" | "secondary"
  disabled?: boolean
  testID?: string
  onPress: () => void
}) {
  const primary = props.kind === "primary"
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        props.disabled ? styles.disabled : null,
        pressed && !props.disabled ? styles.buttonPressed : null
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        numberOfLines={2}
        style={[styles.buttonText, primary ? styles.buttonTextPrimary : null]}
      >
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  // Drawn by the sheet so it fades with a swipe-down instead of trailing it.
  backdrop: {
    backgroundColor: "rgba(35, 18, 42, 0.24)"
  },
  sheet: {
    borderTopLeftRadius: uiTheme.radius.xxl,
    borderTopRightRadius: uiTheme.radius.xxl,
    backgroundColor: "rgba(255, 250, 253, 0.97)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.80)",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.sm,
    gap: uiTheme.spacing.sm,
    ...uiTheme.shadow.card
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: uiTheme.colors.border
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm
  },
  headerCopy: {
    flex: 1
  },
  title: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800"
  },
  subtitle: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  lines: {
    flexGrow: 0
  },
  linesContent: {
    gap: 8
  },
  line: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 255, 255, 0.92)"
  },
  lineMuted: {
    opacity: 0.6
  },
  thumb: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#FFF0F6",
    overflow: "hidden"
  },
  thumbImage: {
    width: "100%",
    height: "100%"
  },
  lineCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  lineTitle: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary
  },
  lineStatus: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  lineStatusFailed: {
    color: uiTheme.colors.dangerInk
  },
  linePrice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3
  },
  linePriceText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    fontVariant: ["tabular-nums"]
  },
  lineIcon: {
    width: 24,
    alignItems: "center"
  },
  summary: {
    gap: 4,
    paddingTop: uiTheme.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: uiTheme.colors.border
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  summaryValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  summaryLabel: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    fontVariant: ["tabular-nums"]
  },
  summaryStrong: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary
  },
  notice: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  noticeWarning: {
    color: uiTheme.colors.dangerInk
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.sm,
    paddingTop: uiTheme.spacing.xs
  },
  busy: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  button: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 8,
    borderRadius: 18,
    borderCurve: "continuous"
  },
  buttonPrimary: {
    backgroundColor: uiTheme.colors.primary
  },
  buttonSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: uiTheme.colors.border
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }]
  },
  buttonText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  buttonTextPrimary: {
    color: "#FFFFFF"
  },
  disabled: {
    opacity: uiTheme.opacity.disabled
  }
})
