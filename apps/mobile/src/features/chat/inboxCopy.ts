import type { AccountRecoveryLocale } from "../session/accountRecoveryCopy"

export interface InboxCopy {
  title: string
  /** The label over the conversation list. */
  messagesHeading: string
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
  unknownPartner: string
  /** Prefix of my own last message in a row preview ("You: …"). */
  youPrefix: string
  unreadMessages: (count: number) => string
  openChatHint: string
  time: {
    now: string
    nowSpoken: string
    minutes: (minutes: number) => string
    minutesSpoken: (minutes: number) => string
    yesterday: string
  }
}

const COPY: Record<AccountRecoveryLocale, InboxCopy> = {
  en: {
    title: "Chats",
    messagesHeading: "Messages",
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
    unknownPartner: "Someone",
    youPrefix: "You",
    unreadMessages: (count) => `${count} unread message${count === 1 ? "" : "s"}`,
    openChatHint: "Opens the conversation.",
    time: {
      now: "Now",
      nowSpoken: "just now",
      minutes: (minutes) => `${minutes}m`,
      minutesSpoken: (minutes) => `${minutes} minute${minutes === 1 ? "" : "s"} ago`,
      yesterday: "Yesterday"
    }
  },
  tr: {
    title: "Sohbetler",
    messagesHeading: "Mesajlar",
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
    unknownPartner: "Biri",
    youPrefix: "Sen",
    unreadMessages: (count) => `${count} okunmamış mesaj`,
    openChatHint: "Sohbeti açar.",
    time: {
      now: "Şimdi",
      nowSpoken: "şimdi",
      minutes: (minutes) => `${minutes} dk`,
      minutesSpoken: (minutes) => `${minutes} dakika önce`,
      yesterday: "Dün"
    }
  }
}

export function getInboxCopy(locale: AccountRecoveryLocale): InboxCopy {
  return COPY[locale]
}
