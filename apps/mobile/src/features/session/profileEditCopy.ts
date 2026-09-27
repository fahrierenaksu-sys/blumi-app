import type { AppLocale } from "./appLocale"

const COPY = {
  en: {
    title: "Edit Profile", back: "Go back", saveError: "We could not save that yet. Your profile is still safe.",
    yourName: "Your Name", nameHint: "This is the name people see first.", about: "About me",
    displayName: "Display name", namePlaceholder: "What should people call you?", nameError: "Use a name from 2 to 30 characters",
    age: "Age", ageError: "Use an age from 18 to 99", ageHint: "Keep it simple. Your avatar and room add the personality.",
    bio: "Bio", bioPlaceholder: "A quick line about your vibe", identity: "My identity", identityError: "Choose one option to keep your profile complete",
    interests: "Interests", interestsAccessibility: "Interests, one interest per line", interestHint: "One interest per line",
    interestLimit: (count: number) => `Choose up to ${count} interests`,
    interestLength: (count: number) => `Keep each interest to ${count} characters or fewer`,
    conversation: "Conversation starters", choosePrompts: (count: number) => `Choose up to ${count}. Your own words only.`,
    togglePrompt: (question: string) => `Toggle conversation starter: ${question}`,
    answer: (question: string) => `Answer: ${question}`, answerPlaceholder: "Write a short, real answer",
    promptEmpty: "Answer each selected prompt or remove it", promptLimit: "Choose up to two different prompts with short answers",
    saved: "Saved", saving: "Saving...", save: "Save profile", savedStatus: "Profile saved", savingAccessibility: "Saving profile",
    audience: "Who I’d like to meet", everyone: "Everyone", radius: "Search area", character: "Character frame",
    characterHelp: "Separate from your identity. Change your look in Avatar Studio.", editCharacter: "Edit in Avatar Studio",
    genderAccessibility: (gender: string) => `${gender} gender`, defaultBody: "Default"
  },
  tr: {
    title: "Profili düzenle", back: "Geri dön", saveError: "Profilin kaydedilemedi. Bilgilerin güvende; tekrar dene.",
    yourName: "Adın", nameHint: "İnsanların ilk gördüğü ad bu.", about: "Hakkımda",
    displayName: "Görünen ad", namePlaceholder: "Sana nasıl seslenelim?", nameError: "Adın 2–30 karakter olmalı",
    age: "Yaş", ageError: "Yaşın 18–99 arasında olmalı", ageHint: "Kısa tut; karakterin ve odan seni anlatır.",
    bio: "Biyografi", bioPlaceholder: "Kendin hakkında kısa bir cümle", identity: "Kimliğim", identityError: "Profilini tamamlamak için bir seçenek belirle",
    interests: "İlgi alanları", interestsAccessibility: "İlgi alanları, her satıra bir tane", interestHint: "Her satıra bir ilgi alanı",
    interestLimit: (count: number) => `En fazla ${count} ilgi alanı seç`,
    interestLength: (count: number) => `Her ilgi alanı en fazla ${count} karakter olabilir`,
    conversation: "Sohbet başlangıçları", choosePrompts: (count: number) => `En fazla ${count} tane seç. Yanıtlar kendi sözlerin olsun.`,
    togglePrompt: (question: string) => `Sohbet sorusunu seç: ${question}`,
    answer: (question: string) => `Yanıt: ${question}`, answerPlaceholder: "Kısa ve içten bir yanıt yaz",
    promptEmpty: "Seçtiğin soruları yanıtla veya kaldır", promptLimit: "En fazla iki farklı soru seçip kısaca yanıtla",
    saved: "Kaydedildi", saving: "Kaydediliyor...", save: "Profili kaydet", savedStatus: "Profil kaydedildi", savingAccessibility: "Profil kaydediliyor",
    audience: "Kiminle tanışmak istiyorum", everyone: "Herkes", radius: "Arama alanı", character: "Karakter gövdesi",
    characterHelp: "Kimliğinden bağımsızdır. Görünüşünü Avatar Stüdyosu’nda değiştirebilirsin.", editCharacter: "Avatar Stüdyosu’nda düzenle",
    genderAccessibility: (gender: string) => `${gender} seçeneği`, defaultBody: "Varsayılan"
  }
} as const

export function getProfileEditCopy(locale: AppLocale) {
  return COPY[locale]
}
