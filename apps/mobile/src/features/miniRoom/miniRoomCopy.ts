import type { ReactionType } from "@blumi/contracts"
import type { AccountRecoveryLocale } from "../session/accountRecoveryCopy"

export interface MiniRoomCopy {
  roomTitle: string
  roomSubtitle: (partnerFirstName: string) => string
  youLabel: string
  leaveRoom: string
  retryRoomConnection: string
  retry: string
  textRoom: string
  muteMicrophone: string
  turnOnMicrophone: string
  voiceOn: string
  voiceOff: string
  openSafetyOptions: string
  safety: string
  moveAvatar: string
  moveAvatarHint: string
  welcome: (partnerFirstName: string) => string
  sendReaction: (reaction: ReactionType) => string
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
  closeKeyboard: string
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
  leaveNotConfirmed: string
  legacyDecorNotice: string
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
    textRoom: "Text room · voice off",
    muteMicrophone: "Mute microphone",
    turnOnMicrophone: "Turn on microphone",
    voiceOn: "Voice on",
    voiceOff: "Voice off",
    openSafetyOptions: "Open room safety options",
    safety: "Safety",
    moveAvatar: "Move your avatar in the room",
    moveAvatarHint: "Tap a clear place to walk there",
    welcome: (partnerFirstName) => `You & ${partnerFirstName} · your cozy room`,
    sendReaction: (reaction) => `Send ${reaction} reaction`,
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
    returnToRoom: "Close the keyboard and return to the room",
    closeKeyboard: "Close keyboard",
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
    leaveNotConfirmed: "Leaving the room could not be confirmed. Check your connection and try again.",
    legacyDecorNotice: "This older session has no saved decor. A shared default room is shown."
  },
  tr: {
    roomTitle: "Eşleşme odası",
    roomSubtitle: (partnerFirstName) => `Sen & ${partnerFirstName}`,
    youLabel: "Sen",
    leaveRoom: "Odadan ayrıl",
    retryRoomConnection: "Oda bağlantısını yeniden dene",
    retry: "Tekrar dene",
    textRoom: "Yazılı oda · ses kapalı",
    muteMicrophone: "Mikrofonu kapat",
    turnOnMicrophone: "Mikrofonu aç",
    voiceOn: "Ses açık",
    voiceOff: "Ses kapalı",
    openSafetyOptions: "Oda güvenlik seçeneklerini aç",
    safety: "Güvenlik",
    moveAvatar: "Avatarını odada hareket ettir",
    moveAvatarHint: "Yürümek için boş bir yere dokun",
    welcome: (partnerFirstName) => `Sen ve ${partnerFirstName} · rahat odanız`,
    sendReaction: (reaction) => `${REACTION_LABELS.tr[reaction]} tepkisi gönder`,
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
    returnToRoom: "Klavyeyi kapat ve oda görünümüne dön",
    closeKeyboard: "Klavyeyi kapat",
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
    leaveNotConfirmed: "Odadan çıkış sunucuda doğrulanamadı. Bağlantını kontrol edip tekrar dene.",
    legacyDecorNotice: "Bu eski oturumda dekor kaydı yok. Ortak varsayılan oda gösteriliyor."
  }
}

const REACTION_LABELS: Record<AccountRecoveryLocale, Record<ReactionType, string>> = {
  en: {
    wave: "wave",
    heart: "heart",
    laugh: "laugh",
    fire: "fire"
  },
  tr: {
    wave: "El sallama",
    heart: "Kalp",
    laugh: "Gülme",
    fire: "Ateş"
  }
}
