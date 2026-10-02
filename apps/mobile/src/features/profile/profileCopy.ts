import type { AppLocale } from "../session/appLocale"
import type { ProfileCompletionStep } from "./profileViewModel"

/** TR/EN text and VoiceOver labels for the own profile page and its entry. */
export interface OwnProfileCopy {
  title: string
  back: string
  settings: string
  editProfile: string
  editProfileHint: string
  customVibe: string
  vibe: (label: string) => string
  heroAvatar: (name: string) => string
  heroAvatarHint: string
  completenessTitle: (percent: number) => string
  completenessDone: string
  completenessDoneBody: string
  completenessNext: Record<ProfileCompletionStep, string>
  completenessAccessibility: (done: number, total: number) => string
  aboutTitle: string
  interestsTitle: string
  promptsTitle: string
  addBio: string
  addBioHint: string
  addInterests: string
  addInterestsHint: string
  addPrompt: string
  addPromptHint: string
  previewTitle: string
  previewBody: string
  /** My Room's top-right entry. */
  myRoomEntryLabel: string
  myRoomEntryAccessibilityLabel: string
}

const COPY: Record<AppLocale, OwnProfileCopy> = {
  en: {
    title: "My profile",
    back: "Go back",
    settings: "Settings",
    editProfile: "Edit profile",
    editProfileHint: "Change your name, bio, interests and prompts",
    customVibe: "Custom",
    vibe: (label) => `${label} vibe`,
    heroAvatar: (name) => `${name}'s character`,
    heroAvatarHint: "Double tap to cheer your character up",
    completenessTitle: (percent) => `Your profile is ${percent}% ready`,
    completenessDone: "Your profile is glowing",
    completenessDoneBody: "Everything people want to know is here. Keep it fresh whenever you like.",
    completenessNext: {
      bio: "Add a short bio so people know where to start.",
      interests: "Add a few interests to spark easy conversations.",
      prompt: "Answer a prompt to give people a fun opener."
    },
    completenessAccessibility: (done, total) => `${done} of ${total} profile steps done`,
    aboutTitle: "About me",
    interestsTitle: "Interests",
    promptsTitle: "Conversation starters",
    addBio: "Add a bio",
    addBioHint: "A line or two about you",
    addInterests: "Add interests",
    addInterestsHint: "Coffee, films, long walks…",
    addPrompt: "Answer a prompt",
    addPromptHint: "Give people an easy first message",
    previewTitle: "See how others see you",
    previewBody: "Open your profile as people in Discover see it",
    myRoomEntryLabel: "Profile",
    myRoomEntryAccessibilityLabel: "Open my profile"
  },
  tr: {
    title: "Profilim",
    back: "Geri dön",
    settings: "Ayarlar",
    editProfile: "Profili düzenle",
    editProfileHint: "Adını, bio'nu, ilgi alanlarını ve sorularını değiştir",
    customVibe: "Kendine özel",
    vibe: (label) => `${label} havası`,
    heroAvatar: (name) => `${name} karakteri`,
    heroAvatarHint: "Karakterini neşelendirmek için iki kez dokun",
    completenessTitle: (percent) => `Profilin %${percent} hazır`,
    completenessDone: "Profilin parlıyor",
    completenessDoneBody: "İnsanların merak ettiği her şey burada. İstediğin zaman tazeleyebilirsin.",
    completenessNext: {
      bio: "Kısa bir bio ekle, insanlar nereden başlayacağını bilsin.",
      interests: "Birkaç ilgi alanı ekle, sohbet kendiliğinden açılsın.",
      prompt: "Bir soruyu yanıtla, insanlara eğlenceli bir giriş bırak."
    },
    completenessAccessibility: (done, total) => `${total} profil adımından ${done} tanesi tamam`,
    aboutTitle: "Hakkımda",
    interestsTitle: "İlgi alanları",
    promptsTitle: "Sohbet başlatıcılar",
    addBio: "Bio ekle",
    addBioHint: "Kendinden bir iki cümle",
    addInterests: "İlgi alanı ekle",
    addInterestsHint: "Kahve, film, uzun yürüyüşler…",
    addPrompt: "Bir soruyu yanıtla",
    addPromptHint: "İnsanlara kolay bir ilk mesaj bırak",
    previewTitle: "Başkaları seni nasıl görüyor",
    previewBody: "Profilini Keşfet'te göründüğü gibi aç",
    myRoomEntryLabel: "Profilim",
    myRoomEntryAccessibilityLabel: "Profilimi aç"
  }
}

export function getOwnProfileCopy(locale: AppLocale): OwnProfileCopy {
  return COPY[locale]
}
