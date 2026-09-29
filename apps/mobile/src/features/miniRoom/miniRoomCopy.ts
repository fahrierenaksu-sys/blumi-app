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
}

export function getMiniRoomCopy(locale: AccountRecoveryLocale): MiniRoomCopy {
  return MINI_ROOM_COPY[locale]
}

const MINI_ROOM_COPY: Record<AccountRecoveryLocale, MiniRoomCopy> = {
  en: {
    roomTitle: "Shared room",
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
    roomMessagePlaceholder: "Send a message...",
    sendRoomMessage: "Send room message",
    dismissRoomMessage: "Dismiss room message"
  },
  tr: {
    roomTitle: "Ortak oda",
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
    roomMessagePlaceholder: "Mesaj gönder...",
    sendRoomMessage: "Oda mesajını gönder",
    dismissRoomMessage: "Oda mesajını kapat"
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
