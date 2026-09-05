export const COIN_PACKS = [
  {
    productId: "com.blumi.mobile.coins.500",
    coins: 500,
    usdPriceCents: 199
  },
  {
    productId: "com.blumi.mobile.coins.1500",
    coins: 1500,
    usdPriceCents: 499
  },
  {
    productId: "com.blumi.mobile.coins.4000",
    coins: 4000,
    usdPriceCents: 999
  }
] as const

export type CoinPack = (typeof COIN_PACKS)[number]
export type CoinPackProductId = CoinPack["productId"]

export function findCoinPack(productId: string): CoinPack | null {
  return COIN_PACKS.find((coinPack) => coinPack.productId === productId) ?? null
}
