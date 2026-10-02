import type { AccountRecoveryLocale } from "../session/accountRecoveryCopy"
import { formatRoomChatHistoryDay } from "./roomChatHistoryModel"

export interface MiniRoomCopy {
  roomTitle: string
  roomSubtitle: (partnerFirstName: string) => string
  youLabel: string
  leaveRoom: string
  retryRoomConnection: string
  retry: string
  muteMicrophone: string
  turnOnMicrophone: string
  voiceOn: string
  voiceOff: string
  openSafetyOptions: string
  safety: string
  moveAvatar: string
  moveAvatarHint: string
  welcome: (partnerFirstName: string) => string
  roomMessage: string
  roomMessagePlaceholder: string
  sendRoomMessage: string
  dismissRoomMessage: string
  roomOptions: string
  closeRoomOptions: string
  safetyOptions: string
  voiceUnavailableHint: string
  voiceWaitsForConnectionHint: string
  openChatHistory: string
  hideChatHistory: string
  returnToRoom: string
  /** The history-mode composer button: scrolls the transcript to its newest message. */
  goToLatestMessage: string
  historyHeading: string
  /** The day of the newest history message: today, yesterday or a short date; null without a time. */
  historyDay: (newestSentAt: string | undefined, now?: Date) => string | null
  roomPairCaption: string
  roomPairTitle: (partnerName: string) => string
  closeKeyboard: string
  keyboardSuggestions: string
  keyboardSuggestionsHint: string
  keyboardSuggestionsOn: string
  keyboardSuggestionsOff: string
  chatHistory: string
  historyEmpty: string
  historyLoading: string
  historyFailed: string
  historyUnavailable: string
  messageSending: string
  messageNotSent: string
  messageFrom: (senderName: string, body: string) => string
  sendFailedNotice: string
  connecting: string
  reconnecting: string
  connectionFailed: string
  roomRefreshFailed: string
  /** Shown after the person left when the close for both could not be confirmed. */
  leftRoomUnconfirmed: string
  legacyDecorNotice: string
  leaveConfirmTitle: string
  leaveConfirmBody: string
  leaveConfirmStay: string
  /** Short in-room notices; each is also announced to screen readers. */
  partnerHere: (partnerFirstName: string) => string
  partnerBack: (partnerFirstName: string) => string
  partnerAway: (partnerFirstName: string) => string
  seatTaken: string
  /** Shown after this device leaves a room the same account continued elsewhere. */
  continuedOnOtherDevice: string
}

export function getMiniRoomCopy(locale: AccountRecoveryLocale): MiniRoomCopy {
  return MINI_ROOM_COPY[locale]
}

const MINI_ROOM_COPY: Record<AccountRecoveryLocale, MiniRoomCopy> = {
  en: {
    roomTitle: "Match room",
    roomSubtitle: (partnerFirstName) => `You & ${partnerFirstName}`,
    youLabel: "You",
    leaveRoom: "Leave room",
    retryRoomConnection: "Retry room connection",
    retry: "Retry",
    muteMicrophone: "Mute microphone",
    turnOnMicrophone: "Turn on microphone",
    voiceOn: "Voice on",
    voiceOff: "Voice off",
    openSafetyOptions: "Open room safety options",
    safety: "Safety",
    moveAvatar: "Move your avatar in the room",
    moveAvatarHint: "Tap a clear place to walk there",
    welcome: (partnerFirstName) => `You & ${partnerFirstName} · your cozy room`,
    roomMessage: "Room message",
    roomMessagePlaceholder: "Write something…",
    sendRoomMessage: "Send room message",
    dismissRoomMessage: "Dismiss room message",
    roomOptions: "Room options",
    closeRoomOptions: "Close room options",
    safetyOptions: "Safety options",
    voiceUnavailableHint: "Live voice isn't available in this version",
    voiceWaitsForConnectionHint: "Available once the room is connected",
    openChatHistory: "Show chat history",
    hideChatHistory: "Hide chat history",
    returnToRoom: "Close the keyboard and return to the conversation",
    goToLatestMessage: "Go to latest message",
    historyHeading: "Your conversation",
    historyDay: (newestSentAt, now) => formatRoomChatHistoryDay(newestSentAt,
      { today: "Today", yesterday: "Yesterday", dateLocale: "en-US" }, now),
    roomPairCaption: "Just the two of you.",
    roomPairTitle: (partnerName) => `You and ${partnerName}`,
    closeKeyboard: "Close keyboard",
    keyboardSuggestions: "MiniRoom keyboard suggestions",
    keyboardSuggestionsHint: "Only changes this room's keyboard suggestions, autocorrection and spelling checks",
    keyboardSuggestionsOn: "On",
    keyboardSuggestionsOff: "Off",
    chatHistory: "Room chat",
    historyEmpty: "No messages yet",
    historyLoading: "Loading messages…",
    historyFailed: "Messages couldn't load. New messages still appear here.",
    historyUnavailable: "Chat isn't available right now.",
    messageSending: "Sending…",
    messageNotSent: "Not sent",
    messageFrom: (senderName, body) => `${senderName}: ${body}`,
    sendFailedNotice: "Message not sent. It's back in the box; tap send to try again.",
    connecting: "Connecting to the room…",
    reconnecting: "Connection lost. Reconnecting…",
    connectionFailed: "Couldn't connect to the room.",
    roomRefreshFailed: "Room details could not be refreshed. Your current room is unchanged; it will retry after the next reconnection.",
    leftRoomUnconfirmed: "You left the room. Its closing isn't confirmed yet; you can close it with your next invite.",
    legacyDecorNotice: "This older session has no saved decor. A shared default room is shown.",
    leaveConfirmTitle: "Leave the room?",
    leaveConfirmBody: "The room closes for both of you.",
    leaveConfirmStay: "Stay",
    partnerHere: (partnerFirstName) => `${partnerFirstName} is here`,
    partnerBack: (partnerFirstName) => `${partnerFirstName} is back`,
    partnerAway: (partnerFirstName) => `${partnerFirstName} stepped away`,
    seatTaken: "That seat is taken",
    continuedOnOtherDevice: "This room continued on your other device."
  },
  tr: {
    roomTitle: "Eşleşme odası",
    roomSubtitle: (partnerFirstName) => `Sen & ${partnerFirstName}`,
    youLabel: "Sen",
    leaveRoom: "Odadan ayrıl",
    retryRoomConnection: "Oda bağlantısını yeniden dene",
    retry: "Tekrar dene",
    muteMicrophone: "Mikrofonu kapat",
    turnOnMicrophone: "Mikrofonu aç",
    voiceOn: "Ses açık",
    voiceOff: "Ses kapalı",
    openSafetyOptions: "Oda güvenlik seçeneklerini aç",
    safety: "Güvenlik",
    moveAvatar: "Avatarını odada hareket ettir",
    moveAvatarHint: "Yürümek için boş bir yere dokun",
    welcome: (partnerFirstName) => `Sen ve ${partnerFirstName} · rahat odanız`,
    roomMessage: "Oda mesajı",
    roomMessagePlaceholder: "Bir şey yaz…",
    sendRoomMessage: "Oda mesajını gönder",
    dismissRoomMessage: "Oda mesajını kapat",
    roomOptions: "Oda seçenekleri",
    closeRoomOptions: "Oda seçeneklerini kapat",
    safetyOptions: "Güvenlik seçenekleri",
    voiceUnavailableHint: "Canlı ses bu sürümde kullanılamıyor",
    voiceWaitsForConnectionHint: "Oda bağlanınca kullanılabilir",
    openChatHistory: "Sohbet geçmişini aç",
    hideChatHistory: "Sohbet geçmişini gizle",
    returnToRoom: "Klavyeyi kapat ve sohbete dön",
    goToLatestMessage: "En yeni mesaja git",
    historyHeading: "Sohbetiniz",
    historyDay: (newestSentAt, now) => formatRoomChatHistoryDay(newestSentAt,
      { today: "Bugün", yesterday: "Dün", dateLocale: "tr-TR" }, now),
    roomPairCaption: "Sadece ikiniz.",
    roomPairTitle: (partnerName) => `Sen ve ${partnerName}`,
    closeKeyboard: "Klavyeyi kapat",
    keyboardSuggestions: "MiniRoom klavye önerileri",
    keyboardSuggestionsHint: "Yalnızca bu odadaki kelime önerilerini, otomatik düzeltmeyi ve yazım denetimini değiştirir",
    keyboardSuggestionsOn: "Açık",
    keyboardSuggestionsOff: "Kapalı",
    chatHistory: "Oda sohbeti",
    historyEmpty: "Henüz mesaj yok",
    historyLoading: "Mesajlar yükleniyor…",
    historyFailed: "Mesajlar yüklenemedi. Yeni mesajlar yine burada görünür.",
    historyUnavailable: "Sohbet şu an kullanılamıyor.",
    messageSending: "Gönderiliyor…",
    messageNotSent: "Gönderilemedi",
    messageFrom: (senderName, body) => `${senderName}: ${body}`,
    sendFailedNotice: "Mesaj gönderilemedi. Metin kutuda; tekrar göndermek için gönder'e dokun.",
    connecting: "Odaya bağlanılıyor…",
    reconnecting: "Bağlantı koptu. Yeniden bağlanılıyor…",
    connectionFailed: "Oda bağlantısı kurulamadı.",
    roomRefreshFailed: "Oda bilgileri yenilenemedi. Mevcut oda korunuyor; bağlantı tekrar kurulunca yeniden denenecek.",
    leftRoomUnconfirmed: "Odadan çıktın. Odanın kapandığı henüz onaylanmadı; bir sonraki davetinde kapatabilirsin.",
    legacyDecorNotice: "Bu eski oturumda dekor kaydı yok. Ortak varsayılan oda gösteriliyor.",
    leaveConfirmTitle: "Odadan ayrılmak istiyor musun?",
    leaveConfirmBody: "Oda ikiniz için de kapanır.",
    leaveConfirmStay: "Kal",
    partnerHere: (partnerFirstName) => `${partnerFirstName} odada`,
    partnerBack: (partnerFirstName) => `${partnerFirstName} geri döndü`,
    partnerAway: (partnerFirstName) => `${partnerFirstName} odadan uzaklaştı`,
    seatTaken: "Bu koltuk dolu",
    continuedOnOtherDevice: "Bu oda diğer cihazında devam ediyor."
  }
}
