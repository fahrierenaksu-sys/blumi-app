import type { AccountRecoveryLocale } from "./accountRecoveryCopy"

export interface ProfileSetupCopy {
  backToCharacterSetup: string
  signingOut: string
  signOutOfBlumi: string
  signOut: string
  title: string
  subtitle: string
  displayName: string
  displayNamePlaceholder: string
  age: string
  publicNameHint: string
  gender: string
  genderChangeHint: string
  starterCharacterHint: string
  woman: string
  man: string
  useTwoToThirtyCharacters: string
  ageRangeError: string
  saveChanges: string
  continueToCharacter: string
}

const COPY: Record<AccountRecoveryLocale, ProfileSetupCopy> = {
  en: {
    backToCharacterSetup: "Back to character setup",
    signingOut: "Signing out",
    signOutOfBlumi: "Sign out of Blumi",
    signOut: "Sign out",
    title: "How should we know you?",
    subtitle: "First, choose how you would like us to address you.",
    displayName: "Display name",
    displayNamePlaceholder: "First name or nickname",
    age: "Age",
    publicNameHint: "This name is public. A first name or nickname is enough.",
    gender: "Gender",
    genderChangeHint: "You can change this in the next step.",
    starterCharacterHint: "We’ll suggest a starter character. You can change the body next.",
    woman: "Woman",
    man: "Man",
    useTwoToThirtyCharacters: "Use 2–30 characters for your name.",
    ageRangeError: "Age must be between 18 and 99.",
    saveChanges: "Save changes",
    continueToCharacter: "Let’s prepare my character"
  },
  tr: {
    backToCharacterSetup: "Karakter kurulumuna dön",
    signingOut: "Çıkış yapılıyor",
    signOutOfBlumi: "Blumi’den çıkış yap",
    signOut: "Çıkış yap",
    title: "Seni nasıl tanıyalım?",
    subtitle: "İlk olarak sana nasıl sesleneceğimizi seçelim.",
    displayName: "Görünen ad",
    displayNamePlaceholder: "Ad veya takma ad",
    age: "Yaş",
    publicNameHint: "Bu ad herkese açıktır. Adın veya takma adın yeterli.",
    gender: "Cinsiyet",
    genderChangeHint: "Sonraki adımda değiştirebilirsin.",
    starterCharacterHint: "Başlangıç karakteri önereceğiz. Sonraki adımda bedeni değiştirebilirsin.",
    woman: "Kadın",
    man: "Erkek",
    useTwoToThirtyCharacters: "Adın 2–30 karakter olmalı.",
    ageRangeError: "Yaş 18 ile 99 arasında olmalı.",
    saveChanges: "Değişiklikleri kaydet",
    continueToCharacter: "Karakterimi hazırlayalım"
  }
}

export function getProfileSetupCopy(locale: AccountRecoveryLocale): ProfileSetupCopy {
  return COPY[locale]
}
