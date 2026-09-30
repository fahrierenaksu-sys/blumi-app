import { Alert } from "react-native"
import type { AppLocale } from "../../session/appLocale"
import type { ShopCatalogItem } from "../shopCatalog"
import { getShopCopy } from "../shopCopy"
import { formatCoins } from "../shopFormatters"

/**
 * Asks the user to approve one queued avatar purchase. Resolves once: Buy
 * approves; Cancel or dismissing the alert declines. The remaining balance
 * shown is a local estimate; the server still decides the purchase.
 */
export function confirmAvatarShopPurchase(input: {
  product: ShopCatalogItem
  balance: number
  locale: AppLocale
}): Promise<boolean> {
  const copy = getShopCopy(input.locale).combination
  const price = input.product.priceCoins ?? 0
  const remaining = Math.max(0, input.balance - price)
  return new Promise((resolve) => {
    let settled = false
    const finish = (approved: boolean): void => {
      if (settled) return
      settled = true
      resolve(approved)
    }
    Alert.alert(
      copy.purchaseTitle,
      copy.purchaseSummary(
        input.product.title,
        formatCoins(price, input.locale),
        formatCoins(remaining, input.locale)
      ),
      [
        {
          text: copy.cancel,
          style: "cancel",
          onPress: () => finish(false)
        },
        {
          text: copy.buy,
          onPress: () => finish(true)
        }
      ],
      { cancelable: true, onDismiss: () => finish(false) }
    )
  })
}
