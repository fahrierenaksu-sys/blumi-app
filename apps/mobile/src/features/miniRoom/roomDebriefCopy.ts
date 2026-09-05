export type RoomDebriefLocale = "en" | "tr"

export interface RoomDebriefCopy {
  eyebrow: string
  duration: (totalSeconds: number) => string
  notConnectedMeta: string
  title: (partnerName: string, connected: boolean) => string
  subhead: string
  keptMemory: string
  momentLine: (connected: boolean, durationSeconds: number) => string
  passAccessibilityLabel: string
  passLabel: string
  passHint: string
  keepAccessibilityLabel: string
  keepLabel: string
  keepHint: string
  decideLaterAccessibilityLabel: string
  decideLater: string
  decisionPending: string
  decisionError: string
  decisionUnavailable: string
}

function formatEnglishDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  if (minutes <= 0) return `${seconds}s together`
  if (seconds === 0) return `${minutes} min together`
  return `${minutes} min ${seconds}s together`
}

function formatTurkishDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  if (minutes <= 0) return `${seconds} sn birlikte`
  if (seconds === 0) return `${minutes} dk birlikte`
  return `${minutes} dk ${seconds} sn birlikte`
}

const COPY: Record<RoomDebriefLocale, RoomDebriefCopy> = {
  en: {
    eyebrow: "Room ended",
    duration: formatEnglishDuration,
    notConnectedMeta: "You did not quite connect",
    title: (partnerName, connected) => connected
      ? `How was meeting ${partnerName}?`
      : "That room did not quite land.",
    subhead: "Save the moment if it felt worth returning to. It stays with you until both sides keep it.",
    keptMemory: "Kept memory",
    momentLine: (connected, durationSeconds) => {
      if (!connected) return "The room never fully settled, so this stays as a soft maybe."
      if (durationSeconds < 20) return "A quick hello, but a real one."
      if (durationSeconds < 90) return "Long enough to notice a first spark."
      return "You gave each other a real pocket of time."
    },
    passAccessibilityLabel: "Pass on this connection",
    passLabel: "Pass",
    passHint: "Not this one",
    keepAccessibilityLabel: "Keep this connection",
    keepLabel: "Keep this moment",
    keepHint: "Keep it close",
    decideLaterAccessibilityLabel: "Decide about this connection later",
    decideLater: "Decide later",
    decisionPending: "Waiting to save your choice when the connection returns.",
    decisionError: "We could not save that choice yet. Please try again.",
    decisionUnavailable: "That room is no longer available for a decision."
  },
  tr: {
    eyebrow: "Oda sona erdi",
    duration: formatTurkishDuration,
    notConnectedMeta: "Tam olarak bağlanamadınız",
    title: (partnerName, connected) => connected
      ? `${partnerName} ile tanışmak nasıldı?`
      : "Bu oda tam olarak akmadı.",
    subhead: "Geri dönmek isteyebileceğin bir andıysa sakla. İkiniz de saklamak istediğinizde bağlantın kalır.",
    keptMemory: "Saklanan an",
    momentLine: (connected, durationSeconds) => {
      if (!connected) return "Oda tam olarak oturmadı; bunu yumuşak bir belki olarak bırakabilirsin."
      if (durationSeconds < 20) return "Kısa bir merhaba, ama gerçek bir merhaba."
      if (durationSeconds < 90) return "İlk kıvılcımı fark edecek kadar zaman vardı."
      return "Birbirinize gerçekten zaman ayırdınız."
    },
    passAccessibilityLabel: "Bu bağlantıyı geç",
    passLabel: "Geç",
    passHint: "Bu kez değil",
    keepAccessibilityLabel: "Bu bağlantıyı sakla",
    keepLabel: "Bu anı sakla",
    keepHint: "Yakınında kalsın",
    decideLaterAccessibilityLabel: "Bu bağlantıya daha sonra karar ver",
    decideLater: "Sonra karar ver",
    decisionPending: "Bağlantı geri geldiğinde seçimini kaydetmeyi bekliyoruz.",
    decisionError: "Bu seçimi henüz kaydedemedik. Lütfen tekrar dene.",
    decisionUnavailable: "Bu oda için artık karar veremezsin."
  }
}

export function getRoomDebriefCopy(locale: RoomDebriefLocale): RoomDebriefCopy {
  return COPY[locale]
}
