import type { AppLocale } from "./appLocale"

export interface YouScreenCopy {
  title: string
  back: string
  age: (age: number) => string
  customVibe: string
  vibe: (label: string) => string
  editProfile: string
  editProfileDescription: string
  settings: string
  settingsDescription: string
  signOut: string
  signOutAccessibility: string
  signOutTitle: string
  signOutBody: string
  cancel: string
}

const COPY: Record<AppLocale, YouScreenCopy> = {
  en: {
    title: "My profile",
    back: "Go back",
    age: (age) => `${age} years old`,
    customVibe: "Custom",
    vibe: (label) => `${label} vibe`,
    editProfile: "Edit profile",
    editProfileDescription: "Update your details",
    settings: "Settings",
    settingsDescription: "App preferences",
    signOut: "Sign out",
    signOutAccessibility: "Sign out of Blumi",
    signOutTitle: "Sign out of Blumi?",
    signOutBody: "You can sign in again with your phone number.",
    cancel: "Cancel"
  },
  tr: {
    title: "Profilim",
    back: "Geri dön",
    age: (age) => `${age} yaşında`,
    customVibe: "Kendine özel",
    vibe: (label) => `${label} havası`,
    editProfile: "Profili düzenle",
    editProfileDescription: "Bilgilerini güncelle",
    settings: "Ayarlar",
    settingsDescription: "Uygulama tercihleri",
    signOut: "Çıkış yap",
    signOutAccessibility: "Blumi’den çıkış yap",
    signOutTitle: "Blumi’den çıkış yapılsın mı?",
    signOutBody: "Telefon numaranla yeniden giriş yapabilirsin.",
    cancel: "Vazgeç"
  }
}

export function getYouScreenCopy(locale: AppLocale): YouScreenCopy {
  return COPY[locale]
}
