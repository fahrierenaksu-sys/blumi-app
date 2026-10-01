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
    settingsDescription: "App preferences"
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
    settingsDescription: "Uygulama tercihleri"
  }
}

export function getYouScreenCopy(locale: AppLocale): YouScreenCopy {
  return COPY[locale]
}
