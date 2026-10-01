import type { ChatLocale } from "../chatRoomInviteModel"

export type ChatThreadCopy = {
  chat: string
  back: string
  unknownPartner: string
  pendingConversation: string
  pendingCreationFailed: string
  retryOpenChat: string
  openingChat: string
  gettingReady: string
  startSpark: string
  startSparkDetail: string
  sending: string
  notSent: string
  tryAgain: string
  loadEarlier: string
  loading: string
  loadFailed: string
  retryLoading: string
  messagePlaceholder: string
  messageAccessibilityLabel: (partnerName: string) => string
  sendAccessibilityLabel: (partnerName: string) => string
  safetyAccessibilityLabel: (partnerName: string) => string
  roomInviteUnavailableTitle: string
  roomInvitePendingReason: string
  roomInviteConversationReason: string
  roomInviteUnavailableReason: string
  roomInviteClosePreviousBody: string
  roomInviteClosePreviousAction: string
  roomInviteCloseFailed: string
  roomInviteRetryFailed: string
  cancel: string
  today: string
  yesterday: string
  bubbleSelf: string
  bubbleStatusSent: string
  bubbleStatusSending: string
  bubbleStatusFailed: string
  bubbleStatusDelivered: string
  bubbleStatusRead: string
}

export const CHAT_COPY: Record<ChatLocale, ChatThreadCopy> = {
  en: {
    chat: "Chat",
    back: "Go back",
    unknownPartner: "Someone",
    pendingConversation: "This conversation is still getting ready.",
    pendingCreationFailed: "We couldn't open this chat. Check your connection and try again.",
    retryOpenChat: "Retry opening chat",
    openingChat: "Opening your chat...",
    gettingReady: "Getting the conversation ready.",
    startSpark: "Start with a spark",
    startSparkDetail: "Send a spark and keep the conversation going.",
    sending: "Sending…",
    notSent: "Not sent",
    tryAgain: "Try again",
    loadEarlier: "Load earlier",
    loading: "Loading...",
    loadFailed: "This conversation could not open.",
    retryLoading: "Try loading again",
    messagePlaceholder: "Message…",
    messageAccessibilityLabel: (partnerName) => `Message ${partnerName}`,
    sendAccessibilityLabel: (partnerName) => `Send message to ${partnerName}`,
    safetyAccessibilityLabel: (partnerName) => `Safety options for ${partnerName}`,
    roomInviteUnavailableTitle: "Room invitation unavailable",
    roomInvitePendingReason: "There is already a room invitation waiting for a response.",
    roomInviteConversationReason: "Wait until this conversation is ready.",
    roomInviteUnavailableReason: "Room invitations are not available in this chat yet.",
    roomInviteClosePreviousBody: "Your previous shared room is still open. Closing it ends that room for both people. Close it and send this invitation?",
    roomInviteClosePreviousAction: "Close room and invite",
    roomInviteCloseFailed: "The previous room could not be closed. Check your connection and try again.",
    roomInviteRetryFailed: "The previous room was closed, but this invitation could not be sent. Please try again.",
    cancel: "Cancel",
    today: "Today",
    yesterday: "Yesterday",
    bubbleSelf: "You",
    bubbleStatusSent: "sent",
    bubbleStatusSending: "sending",
    bubbleStatusFailed: "not sent",
    bubbleStatusDelivered: "delivered",
    bubbleStatusRead: "read"
  },
  tr: {
    chat: "Sohbet",
    back: "Geri dön",
    unknownPartner: "Biri",
    pendingConversation: "Bu sohbet hâlâ hazırlanıyor.",
    pendingCreationFailed: "Bu sohbet açılamadı. Bağlantını kontrol edip tekrar dene.",
    retryOpenChat: "Sohbeti tekrar aç",
    openingChat: "Sohbetin hazırlanıyor...",
    gettingReady: "Sohbet hazırlanıyor.",
    startSpark: "Bir kıvılcımla başla",
    startSparkDetail: "Bir mesaj gönder, sohbeti kendi hızında ilerlet.",
    sending: "Gönderiliyor…",
    notSent: "Gönderilemedi",
    tryAgain: "Tekrar dene",
    loadEarlier: "Önceki mesajları yükle",
    loading: "Yükleniyor...",
    loadFailed: "Bu sohbet açılamadı.",
    retryLoading: "Tekrar yükle",
    messagePlaceholder: "Mesaj yaz…",
    messageAccessibilityLabel: (partnerName) => `${partnerName} için mesaj yaz`,
    sendAccessibilityLabel: (partnerName) => `${partnerName} kişisine mesaj gönder`,
    safetyAccessibilityLabel: (partnerName) => `${partnerName} için güvenlik seçenekleri`,
    roomInviteUnavailableTitle: "Oda daveti kullanılamıyor",
    roomInvitePendingReason: "Bu sohbette zaten yanıt bekleyen bir oda daveti var.",
    roomInviteConversationReason: "Bu sohbet hazır olana kadar bekle.",
    roomInviteUnavailableReason: "Oda davetleri bu sohbette henüz kullanılamıyor.",
    roomInviteClosePreviousBody: "Önceki ortak odan hâlâ açık. Kapatırsan iki kişi için de sona erer. Kapatıp bu daveti göndermek ister misin?",
    roomInviteClosePreviousAction: "Odayı kapat ve davet et",
    roomInviteCloseFailed: "Önceki oda kapatılamadı. Bağlantını kontrol edip tekrar dene.",
    roomInviteRetryFailed: "Önceki oda kapatıldı ancak bu davet gönderilemedi. Tekrar dene.",
    cancel: "Vazgeç",
    today: "Bugün",
    yesterday: "Dün",
    bubbleSelf: "Sen",
    bubbleStatusSent: "gönderildi",
    bubbleStatusSending: "gönderiliyor",
    bubbleStatusFailed: "gönderilemedi",
    bubbleStatusDelivered: "iletildi",
    bubbleStatusRead: "görüldü"
  }
}

/**
 * The route may pin the chat locale; otherwise the device (ICU) locale
 * decides. The device locale is only read when the route provides none.
 */
export function resolveChatThreadLocale(
  routeLocale: ChatLocale | undefined,
  deviceLocale?: string
): ChatLocale {
  return routeLocale ?? (
    (deviceLocale ?? Intl.DateTimeFormat().resolvedOptions().locale).toLowerCase().startsWith("tr")
      ? "tr"
      : "en"
  )
}
