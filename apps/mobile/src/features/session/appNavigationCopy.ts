import type { AccountRecoveryLocale } from "./accountRecoveryCopy"

export interface AppNavigationCopy {
  discover: string
  chats: string
  myRoom: string
  shop: string
}

const COPY: Record<AccountRecoveryLocale, AppNavigationCopy> = {
  en: {
    discover: "Discover",
    chats: "Chats",
    myRoom: "My Room",
    shop: "Shop"
  },
  tr: {
    discover: "Keşfet",
    chats: "Sohbetler",
    myRoom: "Odam",
    shop: "Mağaza"
  }
}

export function getAppNavigationCopy(
  locale: AccountRecoveryLocale
): AppNavigationCopy {
  return COPY[locale]
}
