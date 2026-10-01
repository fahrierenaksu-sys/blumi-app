import type { AppLocale } from "../session/appLocale"

/**
 * User-facing text of the two match surfaces (UX audit DSC-1: the match moment
 * was English on Turkish devices). English keeps the shipped wording.
 */
export interface MatchResultCopy {
  connectionModal: {
    headline: string
    body: (matchedUserName: string) => string
    badgeLabel: string
    closeLabel: string
    sendMessage: string
    keepDiscovering: string
  }
  discoveryRoute: {
    headline: string
    eyebrow: string
    title: string
    body: string
    nextStepTitle: string
    nextStepBody: string
    backLabel: string
    safetyLabel: (matchedUserName: string) => string
    sendMessage: string
    keepDiscovering: string
  }
}

const MATCH_RESULT_COPY: Record<AppLocale, MatchResultCopy> = {
  en: {
    connectionModal: {
      headline: "It's a vibe.",
      body: (name) => `You and ${name} both felt it. Start with a message when you are ready.`,
      badgeLabel: "Mutual match",
      closeLabel: "Close match result",
      sendMessage: "Start chatting",
      keepDiscovering: "Keep exploring"
    },
    discoveryRoute: {
      headline: "It’s a vibe.",
      eyebrow: "New match",
      title: "You two just matched.",
      body: "Start with a message and get to know each other at your pace.",
      nextStepTitle: "Make the first move feel natural.",
      nextStepBody: "A thoughtful hello is enough to get the conversation going.",
      backLabel: "Return to Discover",
      safetyLabel: (name) => `Safety options for ${name}`,
      sendMessage: "Say Hi",
      keepDiscovering: "Keep Exploring"
    }
  },
  tr: {
    connectionModal: {
      headline: "Enerjiniz tuttu.",
      body: (name) => `Sen ve ${name} aynı şeyi hissettiniz. Hazır olduğunda bir mesajla başla.`,
      badgeLabel: "Karşılıklı eşleşme",
      closeLabel: "Eşleşme ekranını kapat",
      sendMessage: "Sohbete başla",
      keepDiscovering: "Keşfetmeye devam et"
    },
    discoveryRoute: {
      headline: "Enerjiniz tuttu.",
      eyebrow: "Yeni eşleşme",
      title: "Az önce eşleştiniz.",
      body: "Bir mesajla başlayın, birbirinizi kendi hızınızda tanıyın.",
      nextStepTitle: "İlk adım doğal olsun.",
      nextStepBody: "Düşünceli bir selam sohbeti başlatmaya yeter.",
      backLabel: "Keşfet'e dön",
      safetyLabel: (name) => `${name} için güvenlik seçenekleri`,
      sendMessage: "Selam ver",
      keepDiscovering: "Keşfetmeye devam et"
    }
  }
}

export function getMatchResultCopy(locale: AppLocale): MatchResultCopy {
  return MATCH_RESULT_COPY[locale]
}
