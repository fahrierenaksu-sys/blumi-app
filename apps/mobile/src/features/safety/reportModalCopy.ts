import type { ReportReason } from "@blumi/contracts"

export type ReportModalLocale = "en" | "tr"
export type ReportModalStep = "reason" | "confirm" | "done"

export interface ReportModalCopy {
  title: (name: string, step: ReportModalStep) => string
  reasonLabel: (reason: ReportReason) => string
  reportReasonAccessibilityLabel: (label: string) => string
  closeAccessibilityLabel: string
  reasonSubtitle: string
  hideWithoutReporting: string
  hiding: string
  hideAccessibilityLabel: (name: string) => string
  hiddenToast: (name: string) => string
  couldNotHide: string
  confirmBody: (name: string) => string
  detailsAccessibilityLabel: string
  detailsPlaceholder: string
  reportAndHideAccessibilityLabel: (name: string) => string
  reportAndHide: string
  sending: string
  goBackAccessibilityLabel: string
  goBack: string
  doneMessage: string
  thankYouToast: string
  reportNotSent: string
  tryAgain: string
}

const EN_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate: "Inappropriate content",
  harassment: "Harassment or bullying",
  spam: "Spam or scam",
  fake_profile: "Fake profile",
  fake_or_bot: "May be fake or a bot",
  underage: "Under 18",
  other: "Something else"
}

const TR_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate: "Uygunsuz içerik",
  harassment: "Taciz veya zorbalık",
  spam: "Spam veya dolandırıcılık",
  fake_profile: "Sahte profil",
  fake_or_bot: "Sahte veya bot olabilir",
  underage: "18 yaş altı",
  other: "Başka bir durum"
}

const COPY: Record<ReportModalLocale, ReportModalCopy> = {
  en: {
    title: (name, step) => step === "done" ? "Done" : `Report ${name}`,
    reasonLabel: (reason) => EN_REASON_LABELS[reason],
    reportReasonAccessibilityLabel: (label) => `Report reason: ${label}`,
    closeAccessibilityLabel: "Close report",
    reasonSubtitle: "Tell us what felt wrong. We will keep this private.",
    hideWithoutReporting: "Hide without reporting",
    hiding: "Hiding...",
    hideAccessibilityLabel: (name) => `Hide ${name} without reporting`,
    hiddenToast: (name) => `${name} hidden from you`,
    couldNotHide: "Could not hide this person",
    confirmBody: (name) => `This sends a safety report and hides ${name} from you.`,
    detailsAccessibilityLabel: "Report details",
    detailsPlaceholder: "Add a short detail if it helps.",
    reportAndHideAccessibilityLabel: (name) => `Report and hide ${name}`,
    reportAndHide: "Report and hide",
    sending: "Sending...",
    goBackAccessibilityLabel: "Go back to report reasons",
    goBack: "Go back",
    doneMessage: "Thanks for keeping Blumi safe.",
    thankYouToast: "Thanks for telling us",
    reportNotSent: "Report not sent",
    tryAgain: "Try again in a moment."
  },
  tr: {
    title: (name, step) => step === "done" ? "Tamam" : `${name} kişisini bildir`,
    reasonLabel: (reason) => TR_REASON_LABELS[reason],
    reportReasonAccessibilityLabel: (label) => `Bildirim nedeni: ${label}`,
    closeAccessibilityLabel: "Bildirimi kapat",
    reasonSubtitle: "Seni rahatsız eden durumu seç. Bunu gizli tutacağız.",
    hideWithoutReporting: "Bildirmeden gizle",
    hiding: "Gizleniyor...",
    hideAccessibilityLabel: (name) => `${name} kişisini bildirmeden gizle`,
    hiddenToast: (name) => `${name} artık senin için gizlendi`,
    couldNotHide: "Bu kişiyi henüz gizleyemedik",
    confirmBody: (name) => `Bu işlem bir güvenlik bildirimi gönderir ve ${name} kişisini senin için gizleyecek.`,
    detailsAccessibilityLabel: "Bildirim ayrıntıları",
    detailsPlaceholder: "Yardımcı olacak kısa bir ayrıntı ekleyebilirsin.",
    reportAndHideAccessibilityLabel: (name) => `${name} kişisini bildir ve gizle`,
    reportAndHide: "Bildir ve gizle",
    sending: "Gönderiliyor...",
    goBackAccessibilityLabel: "Bildirim nedenlerine geri dön",
    goBack: "Geri dön",
    doneMessage: "Blumi'yi güvenli tuttuğun için teşekkürler.",
    thankYouToast: "Bize bildirdiğin için teşekkürler",
    reportNotSent: "Bildirim gönderilemedi",
    tryAgain: "Kısa süre sonra tekrar dene."
  }
}

export function getReportModalCopy(locale: ReportModalLocale): ReportModalCopy {
  return COPY[locale]
}
