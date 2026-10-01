export type ChatTypingLocale = "tr" | "en"

export interface ChatTypingCopy {
  /** Short visible label next to the dots. */
  typing: string
  /** Spoken once per typing session (with a cooldown). */
  partnerTyping: (name: string) => string
}

export const CHAT_TYPING_COPY: Readonly<Record<ChatTypingLocale, ChatTypingCopy>> = Object.freeze({
  tr: { typing: "yazıyor…", partnerTyping: (name: string) => `${name} yazıyor…` },
  en: { typing: "typing…", partnerTyping: (name: string) => `${name} is typing…` }
})

export function getChatTypingCopy(locale: string | undefined): ChatTypingCopy {
  return locale?.toLowerCase().startsWith("tr") ? CHAT_TYPING_COPY.tr : CHAT_TYPING_COPY.en
}
