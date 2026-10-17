import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { AppLocale } from "../session/appLocale"
import { formatCoins } from "../shop/shopFormatters"
import { getCoinPackCopy } from "./coinPackCopy"
import {
  COIN_PACKS,
  type CoinPackId,
  type CoinPackStoreProduct
} from "./revenueCatCoinPackClient"
import type { CoinPackWalletState } from "./coinPackWalletModel"
import { uiTheme } from "../../ui/theme"

export function CoinPackWalletPanel(props: {
  locale: AppLocale
  state: CoinPackWalletState
  products: readonly CoinPackStoreProduct[]
  onPurchase: (packId: CoinPackId) => void
}) {
  const copy = getCoinPackCopy(props.locale)
  const priceById = new Map(props.products.map((product) => [product.id, product.priceString]))

  return (
    <View testID="coin-pack-wallet" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="diamond" size={18} color="#B9820D" />
          <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        </View>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {copy.status[props.state.kind]}
      </Text>
      <View style={styles.packList}>
        {COIN_PACKS.map((pack) => {
          const price = priceById.get(pack.id)
          const disabled = !props.state.canPurchase || !price
          return (
            <Pressable
              key={pack.id}
              testID={`coin-pack-${pack.coins}`}
              accessibilityRole="button"
              accessibilityLabel={`${formatCoins(pack.coins, props.locale)} ${copy.coins}${price ? `, ${price}` : ""}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => props.onPurchase(pack.id)}
              style={({ pressed }) => [
                styles.pack,
                disabled ? styles.packDisabled : null,
                pressed && !disabled ? styles.packPressed : null
              ]}
            >
              <View>
                <Text style={styles.amount}>{formatCoins(pack.coins, props.locale)}</Text>
                <Text style={styles.amountLabel}>{copy.coins}</Text>
              </View>
              <Text style={styles.price}>{price ?? "—"}</Text>
              <Text style={styles.buy}>{props.state.kind === "processing" ? copy.processing : copy.buy}</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={styles.notice}>{copy.serverNotice}</Text>
      <Text style={styles.notice}>{copy.noRestorePromise}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(236, 111, 166, 0.18)"
  },
  header: { gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: uiTheme.colors.textPrimary, fontSize: 18, fontWeight: "800" },
  subtitle: { color: uiTheme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  status: { color: uiTheme.colors.textSecondary, fontSize: 12, lineHeight: 17 },
  packList: { gap: 8 },
  pack: {
    minHeight: 64,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255, 241, 248, 0.78)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  packDisabled: { opacity: 0.58 },
  packPressed: { transform: [{ scale: 0.985 }] },
  amount: { color: uiTheme.colors.textPrimary, fontSize: 16, fontWeight: "800" },
  amountLabel: { color: uiTheme.colors.textSecondary, fontSize: 11 },
  price: { color: uiTheme.colors.textPrimary, fontSize: 14, fontWeight: "700", marginLeft: "auto" },
  buy: { color: uiTheme.colors.primary, fontSize: 12, fontWeight: "800" },
  notice: { color: uiTheme.colors.textSecondary, fontSize: 11, lineHeight: 16 }
})
