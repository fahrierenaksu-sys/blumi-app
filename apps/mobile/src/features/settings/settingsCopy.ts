import type { AppLocale } from "../session/appLocale"

export interface SettingsCopy {
  title: string
  back: string
  matching: string
  discoveryPreferences: string
  discoveryNote: string
  notifications: string
  notificationsLoading: string
  notificationsUnavailable: string
  notificationsRetry: string
  enableNotifications: string
  openNotificationSettings: string
  notificationDescription: string
  opening: string
  enable: string
  notificationNote: string
  safety: string
  noHiddenPeople: string
  privacy: string
  analytics: string
  on: string
  off: string
  analyticsNote: string
  about: string
  version: string
  philosophy: string
  philosophyValue: string
  legal: string
  privacyPolicy: string
  terms: string
  communityGuidelines: string
  account: string
  downloadData: string
  changePhone: string
  signOut: string
  deleteAccount: string
  tagline: string
  exportTitle: string
  exportBody: string
  exportCode: string
  cancelExport: string
  verifyExport: string
  preparing: string
  continue: string
  currentPhoneTitle: string
  newPhoneTitle: string
  verifyNewPhoneTitle: string
  currentPhoneBody: string
  newPhoneBody: string
  verifyNewPhoneBody: string
  newPhoneInput: string
  localPhonePlaceholder: string
  currentPhoneCode: string
  newPhoneCode: string
  cancelPhoneChange: string
  verifyCurrentCode: string
  sendCodeToNewPhone: string
  finishPhoneChange: string
  checking: string
  finishing: string
  sendCode: string
  finish: string
  deletedTitle: string
  deletedBody: string
  cancel: string
  codeNotSent: string
  signInRequired: string
  signInBeforeDelete: string
  signInBeforeExport: string
  signInBeforePhone: string
  deletePermanentlyTitle: string
  deletePermanentlyBody: string
  deletePermanently: string
  deleteAccountPromptBody: string
  sending: string
  sendDeletionCode: string
  dataExportPromptBody: string
  sendExportCode: string
  phoneChangePromptBody: string
  sendSecurityCode: string
  signOutTitle: string
  signOutBody: string
  showAgainTitle: string
  showAgainBody: string
  showAgain: string
  personVisibleAgain: string
  deletionCodeTitle: string
  deletionCodeBody: string
  deletionCode: string
  cancelDeletion: string
  verifyDeletion: string
  tryAgain: string
  privacyNotSaved: string
  notificationToggle: (label: string) => string
}

const COPY: Record<AppLocale, SettingsCopy> = {
  en: {
    title: "Settings", back: "Go back", matching: "MATCHING", discoveryPreferences: "Discovery preferences",
    discoveryNote: "Choose the ages, genders, and shared vibes you want to see.",
    notifications: "NOTIFICATIONS", notificationsLoading: "Loading notification settings…",
    notificationsUnavailable: "Notification settings unavailable", notificationsRetry: "Retry",
    enableNotifications: "Get useful Blumi updates", openNotificationSettings: "Open device notification access",
    notificationDescription: "Choose this when you want match and message updates outside the app. Blumi will ask for device permission next.",
    opening: "Opening…", enable: "Enable", notificationNote: "Choose only the moments that are useful to you. Quiet hours and delivery limits are enforced by Blumi.",
    safety: "SAFETY", noHiddenPeople: "No one is hidden right now. If you hide someone, they will appear here.",
    privacy: "PRIVACY", analytics: "Product analytics", on: "On", off: "Off",
    analyticsNote: "Optional, anonymous product events only. No messages, profile text, photos, session replay, or advertising identifiers.",
    about: "ABOUT", version: "Version", philosophy: "Philosophy", philosophyValue: "Avatar-first dating",
    legal: "LEGAL", privacyPolicy: "Privacy Policy", terms: "Terms of Service", communityGuidelines: "Community Guidelines",
    account: "ACCOUNT", downloadData: "Download account data", changePhone: "Change sign-in phone", signOut: "Sign out", deleteAccount: "Delete my account",
    tagline: "Made with intention for avatar-first dating.\nA softer way to meet, chat, and share your world.",
    exportTitle: "Confirm your export", exportBody: "Enter the 6-digit code sent to your sign-in phone. We’ll prepare your account, activity, inventory, and messages you wrote right after verification.",
    exportCode: "Account export code", cancelExport: "Cancel account export", verifyExport: "Verify account export code", preparing: "Preparing…", continue: "Continue",
    currentPhoneTitle: "Verify your current phone", newPhoneTitle: "Enter your new phone", verifyNewPhoneTitle: "Verify your new phone",
    currentPhoneBody: "Enter the 6-digit code sent to your current sign-in phone.", newPhoneBody: "Choose the country, then enter the local phone number. We’ll text the new number next.", verifyNewPhoneBody: "Enter the 6-digit code sent to your new phone number. Finishing this will sign out every active session.",
    newPhoneInput: "New local sign-in phone number", localPhonePlaceholder: "Local phone number", currentPhoneCode: "Current phone verification code", newPhoneCode: "New phone verification code",
    cancelPhoneChange: "Cancel phone change", verifyCurrentCode: "Verify current phone code", sendCodeToNewPhone: "Send code to new phone", finishPhoneChange: "Finish phone change", checking: "Checking…", finishing: "Finishing…", sendCode: "Send code", finish: "Finish",
    deletedTitle: "Account deleted", deletedBody: "Your Blumi session has been cleared.", tryAgain: "Try again in a moment.", privacyNotSaved: "Privacy setting not saved",
    cancel: "Cancel", codeNotSent: "Code not sent", signInRequired: "Sign in required", signInBeforeDelete: "Sign in to your production account before deleting it.", signInBeforeExport: "Sign in to your production account before exporting data.", signInBeforePhone: "Sign in to your production account before changing your phone.",
    deletePermanentlyTitle: "Delete permanently?", deletePermanentlyBody: "Your code is confirmed. This permanently removes your profile, avatar, room, matches, messages, and active account data. This cannot be undone.", deletePermanently: "Delete permanently",
    deleteAccountPromptBody: "We’ll send a one-time code to your sign-in phone. After you enter it, you’ll make one final permanent-delete confirmation.", sending: "Sending…", sendDeletionCode: "Send deletion code",
    dataExportPromptBody: "We’ll send a one-time code to your sign-in phone, then prepare a JSON export of your account, activity, inventory, and messages you wrote for sharing.", sendExportCode: "Send export code",
    phoneChangePromptBody: "We’ll verify your current phone first, then the new one. When the change is complete, this device will be signed out.", sendSecurityCode: "Send security code",
    signOutTitle: "Sign out of Blumi?", signOutBody: "You can sign back in with your phone number anytime.",
    showAgainTitle: "Show this person again?", showAgainBody: "They can appear in Blumi spaces again after this.", showAgain: "Show again", personVisibleAgain: "They can appear again",
    deletionCodeTitle: "Confirm with your code", deletionCodeBody: "Enter the 6-digit code sent to your sign-in phone. It expires in 5 minutes.", deletionCode: "Account deletion code", cancelDeletion: "Cancel account deletion", verifyDeletion: "Verify account deletion code",
    notificationToggle: (label) => `${label} notifications`
  },
  tr: {
    title: "Ayarlar", back: "Geri dön", matching: "EŞLEŞME", discoveryPreferences: "Keşfet tercihleri",
    discoveryNote: "Görmek istediğin yaşları, cinsiyetleri ve ortak havaları seç.",
    notifications: "BİLDİRİMLER", notificationsLoading: "Bildirim ayarları yükleniyor…",
    notificationsUnavailable: "Bildirim ayarları kullanılamıyor", notificationsRetry: "Tekrar dene",
    enableNotifications: "Yararlı Blumi güncellemelerini al", openNotificationSettings: "Cihaz bildirim erişimini aç",
    notificationDescription: "Uygulama dışında eşleşme ve mesaj güncellemeleri istediğinde bunu seç. Blumi birazdan cihaz izni ister.",
    opening: "Açılıyor…", enable: "Etkinleştir", notificationNote: "Yalnızca sana yararlı anları seç. Sessiz saatler ve gönderim sınırları Blumi tarafından uygulanır.",
    safety: "GÜVENLİK", noHiddenPeople: "Şu an gizlediğin kimse yok. Birini gizlersen burada görünür.",
    privacy: "GİZLİLİK", analytics: "Ürün analitiği", on: "Açık", off: "Kapalı",
    analyticsNote: "Yalnızca isteğe bağlı ve anonim ürün olayları. Mesajlar, profil metni, fotoğraflar, oturum kaydı veya reklam tanımlayıcıları dahil değildir.",
    about: "HAKKINDA", version: "Sürüm", philosophy: "Yaklaşım", philosophyValue: "Avatar öncelikli flört",
    legal: "YASAL", privacyPolicy: "Gizlilik Politikası", terms: "Kullanım Koşulları", communityGuidelines: "Topluluk Kuralları",
    account: "HESAP", downloadData: "Hesap verilerini indir", changePhone: "Giriş telefonunu değiştir", signOut: "Çıkış yap", deleteAccount: "Hesabımı sil",
    tagline: "Avatar öncelikli flört için özenle tasarlandı.\nTanışmak, sohbet etmek ve dünyanı paylaşmak için daha yumuşak bir yol.",
    exportTitle: "Dışa aktarımını onayla", exportBody: "Giriş telefonuna gönderilen 6 haneli kodu gir. Doğrulamanın hemen ardından hesabını, etkinliklerini, envanterini ve yazdığın mesajları hazırlayacağız.",
    exportCode: "Hesap dışa aktarım kodu", cancelExport: "Hesap dışa aktarımını iptal et", verifyExport: "Hesap dışa aktarım kodunu doğrula", preparing: "Hazırlanıyor…", continue: "Devam et",
    currentPhoneTitle: "Mevcut telefonunu doğrula", newPhoneTitle: "Yeni telefonunu gir", verifyNewPhoneTitle: "Yeni telefonunu doğrula",
    currentPhoneBody: "Mevcut giriş telefonuna gönderilen 6 haneli kodu gir.", newPhoneBody: "Ülkeyi seç, ardından yerel telefon numaranı gir. Yeni numaraya sonraki adımda mesaj göndeririz.", verifyNewPhoneBody: "Yeni telefonuna gönderilen 6 haneli kodu gir. Tamamlandığında tüm aktif oturumlar kapatılır.",
    newPhoneInput: "Yeni yerel giriş telefon numarası", localPhonePlaceholder: "Yerel telefon numarası", currentPhoneCode: "Mevcut telefon doğrulama kodu", newPhoneCode: "Yeni telefon doğrulama kodu",
    cancelPhoneChange: "Telefon değişikliğini iptal et", verifyCurrentCode: "Mevcut telefon kodunu doğrula", sendCodeToNewPhone: "Yeni telefona kod gönder", finishPhoneChange: "Telefon değişikliğini bitir", checking: "Kontrol ediliyor…", finishing: "Tamamlanıyor…", sendCode: "Kod gönder", finish: "Bitir",
    deletedTitle: "Hesap silindi", deletedBody: "Blumi oturumun temizlendi.", tryAgain: "Biraz sonra tekrar dene.", privacyNotSaved: "Gizlilik ayarı kaydedilmedi",
    cancel: "Vazgeç", codeNotSent: "Kod gönderilemedi", signInRequired: "Oturum açman gerekiyor", signInBeforeDelete: "Hesabını silmeden önce production hesabında oturum aç.", signInBeforeExport: "Verilerini dışa aktarmadan önce production hesabında oturum aç.", signInBeforePhone: "Giriş telefonunu değiştirmeden önce production hesabında oturum aç.",
    deletePermanentlyTitle: "Kalıcı olarak silinsin mi?", deletePermanentlyBody: "Kodun doğrulandı. Bu işlem profilini, avatarını, odanı, eşleşmelerini, mesajlarını ve etkin hesap verilerini kalıcı olarak siler. Geri alınamaz.", deletePermanently: "Kalıcı olarak sil",
    deleteAccountPromptBody: "Giriş telefonuna tek kullanımlık bir kod göndereceğiz. Kodu girdikten sonra son bir kalıcı silme onayı vereceksin.", sending: "Gönderiliyor…", sendDeletionCode: "Silme kodu gönder",
    dataExportPromptBody: "Giriş telefonuna tek kullanımlık bir kod göndereceğiz; ardından hesabının, etkinliklerinin, envanterinin ve yazdığın mesajların JSON dışa aktarımını hazırlayacağız.", sendExportCode: "Dışa aktarım kodu gönder",
    phoneChangePromptBody: "Önce mevcut telefonunu, sonra yenisini doğrulayacağız. İşlem tamamlandığında bu cihazın oturumu kapatılır.", sendSecurityCode: "Güvenlik kodu gönder",
    signOutTitle: "Blumi’den çıkış yapılsın mı?", signOutBody: "Telefon numaranla dilediğin zaman yeniden giriş yapabilirsin.",
    showAgainTitle: "Bu kişi yeniden gösterilsin mi?", showAgainBody: "Bu işlemden sonra Blumi alanlarında yeniden görünebilir.", showAgain: "Yeniden göster", personVisibleAgain: "Bu kişi yeniden görünebilir",
    deletionCodeTitle: "Kodunla onayla", deletionCodeBody: "Giriş telefonuna gönderilen 6 haneli kodu gir. Kod 5 dakika içinde geçerliliğini yitirir.", deletionCode: "Hesap silme kodu", cancelDeletion: "Hesap silmeyi iptal et", verifyDeletion: "Hesap silme kodunu doğrula",
    notificationToggle: (label) => `${label} bildirimleri`
  }
}

export function getSettingsCopy(locale: AppLocale): SettingsCopy {
  return COPY[locale]
}
