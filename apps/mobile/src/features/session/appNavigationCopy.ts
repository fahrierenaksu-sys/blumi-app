import type { AccountRecoveryLocale } from "./accountRecoveryCopy"

export interface AppNavigationCopy {
  discover: string
  chats: string
  myRoom: string
  shop: string
  /** VoiceOver label for the Chats tab; it carries the unread count the badge shows. */
  chatsWithUnread: (count: number) => string
}

const COPY: Record<AccountRecoveryLocale, AppNavigationCopy> = {
  en: {
    discover: "Discover",
    chats: "Chats",
    myRoom: "My Room",
    shop: "Shop",
    chatsWithUnread: (count) => `Chats, ${count} unread ${count === 1 ? "message" : "messages"}`
  },
  tr: {
    discover: "Keşfet",
    chats: "Sohbetler",
    myRoom: "Odam",
    shop: "Mağaza",
    chatsWithUnread: (count) => `Sohbetler, ${count} okunmamış mesaj`
  }
}

export function getAppNavigationCopy(
  locale: AccountRecoveryLocale
): AppNavigationCopy {
  return COPY[locale]
}

/** The tab's spoken label: the visible name, plus the unread count when the Chats badge shows one. */
export function getBottomNavTabAccessibilityLabel(
  copy: AppNavigationCopy,
  label: string,
  unreadCount: number | null
): string {
  if (unreadCount === null || !Number.isFinite(unreadCount) || unreadCount <= 0) return label
  return copy.chatsWithUnread(Math.floor(unreadCount))
}
