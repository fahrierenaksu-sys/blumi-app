import type { AppLocale } from "../session/appLocale"

export interface ProfilePreviewCopy {
  loading: string
  unavailableTitle: string
  unavailableBody: string
  failedTitle: string
  failedBody: string
  tryAgain: string
  backToDiscover: string
  back: string
  safetyOptions: (displayName: string) => string
  yourProfile: string
  availableNow: string
  discoverProfile: string
  profileNote: string
  passProfile: string
  likeProfile: (displayName: string) => string
  sayHi: string
  saving: string
  viewOnlyExplanation: string
  yourMatch: string
  selfPreviewNote: string
  backToChat: string
  inviteToRoom: string
  inviteToRoomHint: (displayName: string) => string
}

const COPY: Record<AppLocale, ProfilePreviewCopy> = {
  en: {
    loading: "Preparing view…",
    unavailableTitle: "This profile is no longer available.",
    unavailableBody: "It may have been removed or is no longer visible to you.",
    failedTitle: "We couldn't load this profile.",
    failedBody: "Check your connection and try again.",
    tryAgain: "Try again",
    backToDiscover: "Back to Discover",
    back: "Go back",
    safetyOptions: (displayName) => `Safety options for ${displayName}`,
    yourProfile: "Your profile",
    availableNow: "Available now",
    discoverProfile: "Discover profile",
    profileNote: "Profile note",
    passProfile: "Pass on this profile",
    likeProfile: (displayName) => `Like ${displayName}`,
    sayHi: "Say hi",
    saving: "Saving…",
    viewOnlyExplanation: "This profile is visible, but it is not available for a decision right now.",
    yourMatch: "Your match",
    selfPreviewNote: "This is how people in Discover see your profile.",
    backToChat: "Back to chat",
    inviteToRoom: "Invite to room",
    inviteToRoomHint: (displayName) => `Sends ${displayName} a room invitation in your chat`
  },
  tr: {
    loading: "Görünüm hazırlanıyor…",
    unavailableTitle: "Bu profil artık kullanılamıyor.",
    unavailableBody: "Profil kaldırılmış veya artık sana görünür değil olabilir.",
    failedTitle: "Bu profil yüklenemedi.",
    failedBody: "Bağlantını kontrol edip tekrar dene.",
    tryAgain: "Tekrar dene",
    backToDiscover: "Keşfet'e dön",
    back: "Geri dön",
    safetyOptions: (displayName) => `${displayName} için güvenlik seçenekleri`,
    yourProfile: "Profilin",
    availableNow: "Şimdi müsait",
    discoverProfile: "Keşfet profili",
    profileNote: "Profil notu",
    passProfile: "Bu profili geç",
    likeProfile: (displayName) => `${displayName} profilini beğen`,
    sayHi: "Selam ver",
    saving: "Kaydediliyor…",
    viewOnlyExplanation: "Bu profil görünür, ancak şu anda karar vermeye uygun değil.",
    yourMatch: "Eşleşmen",
    selfPreviewNote: "Keşfet'teki insanlar profilini böyle görüyor.",
    backToChat: "Sohbete dön",
    inviteToRoom: "Odaya davet et",
    inviteToRoomHint: (displayName) => `Sohbetinizde ${displayName} kişisine oda daveti gönderir`
  }
}

export function getProfilePreviewCopy(locale: AppLocale): ProfilePreviewCopy {
  return COPY[locale]
}
