import type { AccountRecoveryLocale } from "./accountRecoveryCopy"

export interface AuthEntryCopy {
  introGreeting: string
  worldPopulationLead: string
  worldPopulationValue: string
  worldPopulationTail: string
  worldPopulationAccessibilityLabel: string
  worldArrivalAccessibilityLabel: string
  worldSceneAccessibilityLabel: string
  pauseWorldAnimation: string
  resumeWorldAnimation: string
  skipWorldAnimation: string
  whoa: string
  letsGetStarted: string
  introGreetingAction: string
  alreadyHaveAccount: string
  identityStartsHere: string
  startProfile: string
  authEntryBody: string
  createAccount: string
  signIn: string
  tryDemoFirst: string
  demoNote: string
  backToAccountChoices: string
  newBeginning: string
  secureSignIn: string
  registerHeroMessage: string
  registerHeroTitle: string
  registerHeroBody: string
  registrationProgressLabel: (step: number, total: number) => string
  registrationProgressValue: (step: number, total: number) => string
  welcomeBack: string
  verifyNumber: string
  checkMessages: string
  signInPhoneBody: string
  createPhoneBody: string
  signInCodeBody: string
  createCodeBody: string
  phoneQuestion: string
  codeQuestion: string
  codeSent: string
  freshCodeSent: string
  codeExpiresSoon: string
  changePhoneNumber: string
  edit: string
  sixDigitCode: string
  sixDigitCodeAccessibilityLabel: string
  completeCodeError: string
  resendCode: string
  resendCodeIn: (seconds: number) => string
  resendCodeCountdown: (seconds: number) => string
  phoneNumberLabel: (countryName: string) => string
  localPhoneAccessibilityLabel: (countryName: string) => string
  localPhonePlaceholder: string
  trPhoneHint: string
  automaticCallingCodeHint: (callingCode: string) => string
  signInToBlumi: string
  verifyAndContinue: string
  continueToProfile: string
  sendVerificationCode: string
  sendCode: string
  phonePrivacy: string
  termsConsent: string
  acceptTerms: string
  privacy: string
  terms: string
  openPrivacyPolicy: string
  openTerms: string
  invalidPhoneNumber: (countryName: string) => string
  trLeadingZeroError: string
  trStartsWithFiveError: string
}

const COPY: Record<AccountRecoveryLocale, AuthEntryCopy> = {
  en: {
    introGreeting: "Hey, I’m Blumi!",
    worldPopulationLead: "World population",
    worldPopulationValue: "8,000,000,000+",
    worldPopulationTail: "people share this world.",
    worldPopulationAccessibilityLabel: "More than 8 billion people share this world.",
    worldArrivalAccessibilityLabel: "A Blumi character lands on the world as the intro scene settles.",
    worldSceneAccessibilityLabel: "Two Blumi characters are running on a gently rotating world.",
    pauseWorldAnimation: "Pause world animation",
    resumeWorldAnimation: "Resume world animation",
    skipWorldAnimation: "Skip animation",
    whoa: "Whoa!",
    letsGetStarted: "Let’s get started.",
    introGreetingAction: "Hi Blumi!",
    alreadyHaveAccount: "I already have an account",
    identityStartsHere: "Your identity starts here",
    startProfile: "Start your Blumi profile.",
    authEntryBody: "Create a new account or sign in with your phone, then start discovering people you want to know.",
    createAccount: "Create account",
    signIn: "Sign in",
    tryDemoFirst: "Try the demo first",
    demoNote: "Demo is temporary. Create an account when you want to keep your world.",
    backToAccountChoices: "Back to account choices",
    newBeginning: "NEW BEGINNING",
    secureSignIn: "SECURE SIGN-IN",
    registerHeroMessage: "Keep your world close.\nLet’s make it yours.",
    registerHeroTitle: "Create your Blumi profile.",
    registerHeroBody: "Use your phone to keep your world safe on every device.",
    registrationProgressLabel: (step, total) => `Registration progress: step ${step} of ${total}`,
    registrationProgressValue: (step, total) => `Step ${step} of ${total}`,
    welcomeBack: "Welcome back.",
    verifyNumber: "Let’s verify your number.",
    checkMessages: "Check your messages.",
    signInPhoneBody: "Use your Blumi phone number and we’ll sign you in securely.",
    createPhoneBody: "We’ll send a one-time code to secure the profile you just created.",
    signInCodeBody: "Enter the 6-digit code we sent. If this phone is linked, we’ll open your Blumi profile.",
    createCodeBody: "Enter the 6-digit code we sent. This is the final step before your Blumi world opens.",
    phoneQuestion: "Where should we send your code?",
    codeQuestion: "Enter your code",
    codeSent: "Code sent",
    freshCodeSent: "A fresh code is on its way.",
    codeExpiresSoon: "Code sent. It expires in a few minutes.",
    changePhoneNumber: "Change phone number",
    edit: "Edit",
    sixDigitCode: "Your 6-digit code",
    sixDigitCodeAccessibilityLabel: "6-digit SMS code",
    completeCodeError: "Enter the complete 6-digit code",
    resendCode: "Didn’t get it? Send a new code",
    resendCodeIn: (seconds) => `Resend SMS code in ${seconds} seconds`,
    resendCodeCountdown: (seconds) => `Send a new code in ${seconds}s`,
    phoneNumberLabel: (countryName) => `${countryName} phone number`,
    localPhoneAccessibilityLabel: (countryName) => `Local phone number for ${countryName}`,
    localPhonePlaceholder: "Local phone number",
    trPhoneHint: "Start with 5 — don’t add +90 or a leading 0",
    automaticCallingCodeHint: (callingCode) => `${callingCode} is added automatically — enter only your local number`,
    signInToBlumi: "Sign in to Blumi",
    verifyAndContinue: "Verify and continue",
    continueToProfile: "Continue to my profile",
    sendVerificationCode: "Send verification code",
    sendCode: "Send code",
    phonePrivacy: "Your phone is stored for sign-in and security, and never shown to other people.",
    termsConsent: "I confirm I am 18 or older and agree to the Terms of Service and Privacy Policy.",
    acceptTerms: "Confirm age and accept Terms of Service and Privacy Policy",
    privacy: "Privacy",
    terms: "Terms",
    openPrivacyPolicy: "Open Privacy Policy",
    openTerms: "Open Terms of Service",
    invalidPhoneNumber: (countryName) => `Enter a valid ${countryName} phone number.`,
    trLeadingZeroError: "Don’t add a leading 0 — start with 5",
    trStartsWithFiveError: "Turkish mobile numbers start with 5"
  },
  tr: {
    introGreeting: "Selam, biz Blumi!",
    worldPopulationLead: "Dünya nüfusu",
    worldPopulationValue: "8.000.000.000+",
    worldPopulationTail: "insan aynı dünyayı paylaşıyor.",
    worldPopulationAccessibilityLabel: "Dünyada 8 milyardan fazla insan aynı dünyayı paylaşıyor.",
    worldArrivalAccessibilityLabel: "Blumi karakteri dünyaya iniş yaparken intro sahnesi yerine oturuyor.",
    worldSceneAccessibilityLabel: "İki Blumi karakteri dönen dünyanın üzerinde koşuyor.",
    pauseWorldAnimation: "Dünya animasyonunu duraklat",
    resumeWorldAnimation: "Dünya animasyonunu sürdür",
    skipWorldAnimation: "Animasyonu atla",
    whoa: "Whoa!",
    letsGetStarted: "Hadi başlayalım.",
    introGreetingAction: "Merhaba Blumi!",
    alreadyHaveAccount: "Zaten hesabım var",
    identityStartsHere: "Kimliğin burada başlıyor",
    startProfile: "Blumi profilini oluşturmaya başla.",
    authEntryBody: "Yeni hesap oluştur veya telefon numaranla giriş yap; ardından tanımak istediğin kişileri keşfet.",
    createAccount: "Hesap oluştur",
    signIn: "Giriş yap",
    tryDemoFirst: "Önce demoyu dene",
    demoNote: "Demo geçicidir. Dünyanı saklamak istediğinde hesap oluştur.",
    backToAccountChoices: "Hesap seçeneklerine dön",
    newBeginning: "YENİ BAŞLANGIÇ",
    secureSignIn: "GÜVENLİ GİRİŞ",
    registerHeroMessage: "Dünyan kaybolmasın.\nOnu sana özel yapalım.",
    registerHeroTitle: "Blumi profilini oluştur.",
    registerHeroBody: "Telefonunla dünyanı her cihazda güvende tut.",
    registrationProgressLabel: (step, total) => `Kayıt ilerlemesi: ${total} adımın ${step}. adımı`,
    registrationProgressValue: (step, total) => `${total} adımın ${step}. adımı`,
    welcomeBack: "Tekrar hoş geldin.",
    verifyNumber: "Numaranı doğrulayalım.",
    checkMessages: "Mesajlarını kontrol et.",
    signInPhoneBody: "Blumi telefon numaranla güvenle giriş yap.",
    createPhoneBody: "Az önce oluşturduğun profili güvene almak için tek kullanımlık bir kod göndereceğiz.",
    signInCodeBody: "Gönderdiğimiz 6 haneli kodu gir. Bu numara bağlıysa Blumi profiline geçeceksin.",
    createCodeBody: "Gönderdiğimiz 6 haneli kodu gir. Bu, Blumi dünyan açılmadan önceki son adım.",
    phoneQuestion: "Kodunu nereye gönderelim?",
    codeQuestion: "Kodunu gir",
    codeSent: "Kod gönderildi",
    freshCodeSent: "Yeni kod yolda.",
    codeExpiresSoon: "Kod gönderildi. Birkaç dakika içinde geçerliliğini yitirir.",
    changePhoneNumber: "Telefon numarasını değiştir",
    edit: "Düzenle",
    sixDigitCode: "6 haneli kodun",
    sixDigitCodeAccessibilityLabel: "6 haneli SMS kodu",
    completeCodeError: "6 haneli kodun tamamını gir",
    resendCode: "Kod gelmedi mi? Yeni kod gönder",
    resendCodeIn: (seconds) => `${seconds} saniye sonra SMS kodunu yeniden gönder`,
    resendCodeCountdown: (seconds) => `${seconds} sn sonra yeni kod gönder`,
    phoneNumberLabel: (countryName) => `${countryName} telefon numarası`,
    localPhoneAccessibilityLabel: (countryName) => `${countryName} için yerel telefon numarası`,
    localPhonePlaceholder: "Yerel telefon numarası",
    trPhoneHint: "5 ile başla — +90 veya başta 0 ekleme",
    automaticCallingCodeHint: (callingCode) => `${callingCode} otomatik eklenir — yalnızca yerel numaranı gir`,
    signInToBlumi: "Blumi’ye giriş yap",
    verifyAndContinue: "Doğrula ve devam et",
    continueToProfile: "Profilime devam et",
    sendVerificationCode: "Doğrulama kodu gönder",
    sendCode: "Kod gönder",
    phonePrivacy: "Telefon numaran giriş ve güvenlik için saklanır; başka kişilere gösterilmez.",
    termsConsent: "18 yaşında veya daha büyük olduğumu doğruluyor, Kullanım Koşulları ve Gizlilik Politikası'nı kabul ediyorum.",
    acceptTerms: "Yaşı doğrula ve Kullanım Koşulları ile Gizlilik Politikası'nı kabul et",
    privacy: "Gizlilik",
    terms: "Koşullar",
    openPrivacyPolicy: "Gizlilik Politikasını aç",
    openTerms: "Hizmet Koşullarını aç",
    invalidPhoneNumber: (countryName) => `Geçerli bir ${countryName} telefon numarası gir.`,
    trLeadingZeroError: "Başta 0 ekleme — 5 ile başla",
    trStartsWithFiveError: "Türkiye mobil numaraları 5 ile başlar"
  }
}

export function getAuthEntryCopy(locale: AccountRecoveryLocale): AuthEntryCopy {
  return COPY[locale]
}
