import type { AppLocale } from "../session/appLocale"

const COPY = {
  en: {
    refreshTitle: "Discover needs a moment", watchSaveTitle: "Vibe Card wasn’t saved", watchSaveBody: "Try again when you’re connected.",
    watchCancelTitle: "Vibe Card is still active", watchCancelBody: "Try cancelling again when you’re connected.",
    inviteTitle: "Invite not sent", inviteBody: "Wait a moment, then try again.", inviteFeedback: "Invite not sent. Try again in a moment.",
    passed: "Passed for now.", skipped: "Skipped for now.", matched: "It’s a match.", liked: "Like sent.", retry: "Try that again in a moment.",
    quota: "Today’s Discover limit reached", inviteSent: "Invite sent. A shared room opens if they accept.",
    unavailable: "This profile is no longer available in Discover.", someone: "Someone",
    finding: "Finding people who match your vibe", everyoneSeen: "You've seen everyone for now",
    peopleToMeet: (count: number) => `${count} ${count === 1 ? "person" : "people"} to meet`,
    filtersLocalTitle: "Your filters are active on this device.", filtersLocalBody: "Blumi could not sync them to your account yet."
  },
  tr: {
    refreshTitle: "Keşfet için biraz bekle", watchSaveTitle: "Vibe Kartı kaydedilemedi", watchSaveBody: "Bağlantın gelince tekrar dene.",
    watchCancelTitle: "Vibe Kartı hâlâ etkin", watchCancelBody: "Bağlantın gelince iptali yeniden dene.",
    inviteTitle: "Davet gönderilemedi", inviteBody: "Biraz bekleyip yeniden dene.", inviteFeedback: "Davet gönderilemedi. Biraz sonra tekrar dene.",
    passed: "Şimdilik geçtin.", skipped: "Şimdilik atlandı.", matched: "Eşleştiniz!", liked: "Beğeni gönderildi.", retry: "Biraz sonra tekrar dene.",
    quota: "Bugünkü Keşfet limitine ulaştın", inviteSent: "Davet gönderildi. Kabul ederse ortak oda açılır.",
    unavailable: "Bu profil artık Keşfet’te yok.", someone: "Biri",
    finding: "Sana uygun kişiler aranıyor", everyoneSeen: "Şimdilik herkesi gördün",
    peopleToMeet: (count: number) => `Tanışabileceğin ${count} kişi`,
    filtersLocalTitle: "Filtrelerin bu cihazda etkin.", filtersLocalBody: "Blumi filtreleri hesabınla henüz eşitleyemedi."
  }
} as const

export function getLobbyFeedbackCopy(locale: AppLocale) {
  return COPY[locale]
}
