import type { AccountRecoveryLocale } from "../session/accountRecoveryCopy"

export interface InboxConversationActionsCopy {
  /** VoiceOver custom action and sheet title prefix. */
  actions: string
  sheetTitle: (partnerName: string) => string
  pin: string
  unpin: string
  pinHint: string
  unpinHint: string
  delete: string
  deleteHint: string
  confirmTitle: string
  confirmBody: (partnerName: string) => string
  confirmDelete: string
  cancel: string
  close: string
  pinned: string
  longPressHint: string
}

const COPY: Record<AccountRecoveryLocale, InboxConversationActionsCopy> = {
  en: {
    actions: "Chat options",
    sheetTitle: (partnerName) => `Chat with ${partnerName}`,
    pin: "Pin to top",
    unpin: "Unpin",
    pinHint: "Keeps this chat above the others.",
    unpinHint: "Returns this chat to its usual place.",
    delete: "Delete chat",
    deleteHint: "Removes this chat from your list.",
    confirmTitle: "Delete this chat?",
    confirmBody: (partnerName) =>
      `It is removed from your Chats list on this phone. ${partnerName} still has the conversation, and a new message brings it back.`,
    confirmDelete: "Delete",
    cancel: "Cancel",
    close: "Close chat options",
    pinned: "Pinned",
    longPressHint: "Touch and hold for chat options."
  },
  tr: {
    actions: "Sohbet seçenekleri",
    sheetTitle: (partnerName) => `${partnerName} ile sohbet`,
    pin: "En üste sabitle",
    unpin: "Sabitlemeyi kaldır",
    pinHint: "Bu sohbeti diğerlerinin üstünde tutar.",
    unpinHint: "Bu sohbeti her zamanki yerine döndürür.",
    delete: "Sohbeti sil",
    deleteHint: "Bu sohbeti listenden kaldırır.",
    confirmTitle: "Bu sohbet silinsin mi?",
    confirmBody: (partnerName) =>
      `Bu telefondaki Sohbetler listenden kaldırılır. ${partnerName} konuşmayı görmeye devam eder; yeni bir mesaj gelirse sohbet geri gelir.`,
    confirmDelete: "Sil",
    cancel: "Vazgeç",
    close: "Sohbet seçeneklerini kapat",
    pinned: "Sabitlendi",
    longPressHint: "Sohbet seçenekleri için basılı tut."
  }
}

export function getInboxConversationActionsCopy(locale: AccountRecoveryLocale): InboxConversationActionsCopy {
  return COPY[locale]
}
