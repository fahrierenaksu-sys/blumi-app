import type { AccountRecoveryLocale } from "../session/accountRecoveryCopy"

export interface InboxCopy {
  title: string
  eyebrow: string
  inboxTitle: string
  headerSubhead: string
  startWithSpark: string
  roomInvitation: string
  opening: string
  failedTitle: string
  retryOpeningChats: string
  tryAgain: string
  emptyTitle: string
  emptyBody: string
  discoverPeople: string
  goToDiscover: string
  back: string
  conversationCount: (count: number) => string
  openChatWith: (name: string, hasUnread: boolean) => string
}

const COPY: Record<AccountRecoveryLocale, InboxCopy> = {
  en: {
    title: "Chats",
    eyebrow: "Conversations",
    inboxTitle: "Your inbox",
    headerSubhead: "Conversations from mutual matches.",
    startWithSpark: "Start with a spark.",
    roomInvitation: "Blumi Room invitation",
    opening: "Opening your conversations…",
    failedTitle: "Chats could not open",
    retryOpeningChats: "Retry opening chats",
    tryAgain: "Try again",
    emptyTitle: "No chats yet",
    emptyBody: "When a mutual match happens, your conversation starts here. Keep discovering until it clicks.",
    discoverPeople: "Discover people",
    goToDiscover: "Go to Discover",
    back: "Go back",
    conversationCount: (count) => `${count} conversation${count === 1 ? "" : "s"}`,
    openChatWith: (name, hasUnread) =>
      `Open chat with ${name}${hasUnread ? ", unread messages" : ""}`
  },
  tr: {
    title: "Sohbetler",
    eyebrow: "Konuşmalar",
    inboxTitle: "Gelen kutun",
    headerSubhead: "Karşılıklı eşleşmelerinden konuşmalar.",
    startWithSpark: "Bir kıvılcımla başla.",
    roomInvitation: "Blumi Oda daveti",
    opening: "Konuşmaların açılıyor…",
    failedTitle: "Sohbetler açılamadı",
    retryOpeningChats: "Sohbetleri tekrar aç",
    tryAgain: "Tekrar dene",
    emptyTitle: "Henüz sohbet yok",
    emptyBody: "Karşılıklı bir eşleşme olduğunda konuşman burada başlar. Sana uyan kişiyi bulana kadar keşfetmeye devam et.",
    discoverPeople: "Keşfet",
    goToDiscover: "Keşfet'e git",
    back: "Geri dön",
    conversationCount: (count) => `${count} konuşma`,
    openChatWith: (name, hasUnread) =>
      `${name} ile sohbeti aç${hasUnread ? ", okunmamış mesajlar" : ""}`
  }
}

export function getInboxCopy(locale: AccountRecoveryLocale): InboxCopy {
  return COPY[locale]
}
