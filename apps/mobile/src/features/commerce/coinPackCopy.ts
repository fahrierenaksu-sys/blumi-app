import type { AppLocale } from "../session/appLocale"
import type { CoinPackWalletStateKind } from "./coinPackWalletModel"

interface CoinPackCopy {
  title: string
  subtitle: string
  coins: string
  buy: string
  processing: string
  status: Record<CoinPackWalletStateKind, string>
  serverNotice: string
  noRestorePromise: string
}

const COPY: Record<AppLocale, CoinPackCopy> = {
  en: {
    title: "Coin packs",
    subtitle: "Use coins to unlock Blumi styles and room pieces.",
    coins: "coins",
    buy: "Buy coins",
    processing: "Verifying purchase…",
    status: {
      ready: "Choose a pack. Your wallet updates after server verification.",
      offline: "Reconnect to buy coin packs.",
      unavailable: "Coin packs are not available in this build yet.",
      processing: "Your purchase is being verified. Please keep this screen open.",
      pending: "Your purchase is pending store verification. Check your wallet again shortly.",
      error: "We could not verify that purchase yet. Your wallet was not changed."
    },
    serverNotice: "Coins are added only after Blumi verifies the store transaction.",
    noRestorePromise: "Coin packs are consumable. Your server wallet follows your signed-in account."
  },
  tr: {
    title: "Jeton paketleri",
    subtitle: "Jetonları Blumi stillerini ve oda parçalarını açmak için kullan.",
    coins: "jeton",
    buy: "Jeton al",
    processing: "Satın alma doğrulanıyor…",
    status: {
      ready: "Bir paket seç. Cüzdanın sunucu doğrulamasından sonra güncellenir.",
      offline: "Jeton paketi almak için yeniden bağlan.",
      unavailable: "Jeton paketleri bu build’de henüz kullanılamıyor.",
      processing: "Satın alman doğrulanıyor. Bu ekranı açık tut.",
      pending: "Satın alman mağaza doğrulamasını bekliyor. Kısa süre sonra cüzdanını tekrar kontrol et.",
      error: "Bu satın alma henüz doğrulanamadı. Cüzdanın değiştirilmedi."
    },
    serverNotice: "Jetonlar yalnızca Blumi mağaza işlemini doğruladıktan sonra eklenir.",
    noRestorePromise: "Jeton paketleri tüketilebilirdir. Sunucu cüzdanın giriş yaptığın hesabını takip eder."
  }
}

export function getCoinPackCopy(locale: AppLocale): CoinPackCopy {
  return COPY[locale]
}
