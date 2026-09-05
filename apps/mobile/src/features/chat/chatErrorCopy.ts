const SAFE_THREAD_LIST_ERROR_MESSAGES = new Set([
  "Chats need a connection.",
  "We could not refresh your chats yet."
])

const SAFE_MESSAGE_LIST_ERROR_MESSAGES = new Set([
  "Chat needs a connection.",
  "We could not open that conversation yet."
])

const SAFE_MATCH_CHAT_OPEN_ERROR_MESSAGES = new Set([
  "We could not open that chat yet."
])

const SAFE_MESSAGE_SEND_ERROR_MESSAGES = new Set([
  "That message could not be sent."
])

const SAFE_ROOM_INVITATION_LOAD_ERROR_MESSAGES = new Set([
  "We could not load room invitations yet."
])

const SAFE_ROOM_INVITATION_ACTION_ERROR_MESSAGES = new Set([
  "That Blumi Room invitation is no longer available."
])

export type ChatErrorLocale = "en" | "tr"

const FALLBACK_COPY: Record<
  "threadList" | "messageList" | "matchOpen" | "messageSend" | "roomInvitationLoad" | "roomInvitationAction",
  Record<ChatErrorLocale, string>
> = {
  threadList: {
    en: "We couldn't load your chats. Check your connection and try again.",
    tr: "Sohbetlerini şu anda yükleyemedik. Bağlantını kontrol edip tekrar dene."
  },
  messageList: {
    en: "We couldn't load this conversation. Check your connection and try again.",
    tr: "Bu sohbeti şu anda yükleyemedik. Bağlantını kontrol edip tekrar dene."
  },
  matchOpen: {
    en: "We couldn't open that chat. Check your connection and try again.",
    tr: "Bu sohbeti şu anda açamadık. Bağlantını kontrol edip tekrar dene."
  },
  messageSend: {
    en: "Your message wasn't sent. Check your connection and try again.",
    tr: "Mesajın gönderilemedi. Bağlantını kontrol edip tekrar dene."
  },
  roomInvitationLoad: {
    en: "We couldn't load room invitations. Try again in a moment.",
    tr: "Oda davetlerini şu anda yükleyemedik. Biraz sonra tekrar dene."
  },
  roomInvitationAction: {
    en: "That room invitation isn't available right now. Try again.",
    tr: "Bu oda daveti şu anda kullanılamıyor. Tekrar dene."
  }
}

export const CHAT_THREAD_LIST_UNAVAILABLE_COPY =
  FALLBACK_COPY.threadList.en

export const CHAT_MESSAGE_LIST_UNAVAILABLE_COPY =
  FALLBACK_COPY.messageList.en

export const MATCH_CHAT_OPEN_UNAVAILABLE_COPY =
  FALLBACK_COPY.matchOpen.en

export const CHAT_MESSAGE_SEND_UNAVAILABLE_COPY =
  FALLBACK_COPY.messageSend.en

export const CHAT_ROOM_INVITATION_LOAD_UNAVAILABLE_COPY =
  FALLBACK_COPY.roomInvitationLoad.en

export const CHAT_ROOM_INVITATION_ACTION_UNAVAILABLE_COPY =
  FALLBACK_COPY.roomInvitationAction.en

export function getThreadListErrorMessageForDisplay(
  errorMessage: string,
  locale?: ChatErrorLocale
): string {
  return getKnownOrFallback(
    errorMessage,
    SAFE_THREAD_LIST_ERROR_MESSAGES,
    FALLBACK_COPY.threadList,
    locale
  )
}

export function getMessageListErrorMessageForDisplay(
  errorMessage: string,
  locale?: ChatErrorLocale
): string {
  return getKnownOrFallback(
    errorMessage,
    SAFE_MESSAGE_LIST_ERROR_MESSAGES,
    FALLBACK_COPY.messageList,
    locale
  )
}

export function getMatchChatOpenErrorMessageForDisplay(
  errorMessage: string,
  locale?: ChatErrorLocale
): string {
  return getKnownOrFallback(
    errorMessage,
    SAFE_MATCH_CHAT_OPEN_ERROR_MESSAGES,
    FALLBACK_COPY.matchOpen,
    locale
  )
}

export function getMessageSendErrorMessageForDisplay(
  errorMessage: string,
  locale?: ChatErrorLocale
): string {
  return getKnownOrFallback(
    errorMessage,
    SAFE_MESSAGE_SEND_ERROR_MESSAGES,
    FALLBACK_COPY.messageSend,
    locale
  )
}

export function getRoomInvitationLoadErrorMessageForDisplay(
  errorMessage: string,
  locale?: ChatErrorLocale
): string {
  return getKnownOrFallback(
    errorMessage,
    SAFE_ROOM_INVITATION_LOAD_ERROR_MESSAGES,
    FALLBACK_COPY.roomInvitationLoad,
    locale
  )
}

export function getRoomInvitationActionErrorMessageForDisplay(
  errorMessage: string,
  locale?: ChatErrorLocale
): string {
  return getKnownOrFallback(
    errorMessage,
    SAFE_ROOM_INVITATION_ACTION_ERROR_MESSAGES,
    FALLBACK_COPY.roomInvitationAction,
    locale
  )
}

function getKnownOrFallback(
  errorMessage: string,
  safeMessages: ReadonlySet<string>,
  fallback: Record<ChatErrorLocale, string>,
  locale?: ChatErrorLocale
): string {
  const normalized = errorMessage.trim()
  const resolvedLocale = resolveChatErrorLocale(locale)
  return safeMessages.has(normalized) && resolvedLocale === "en"
    ? normalized
    : fallback[resolvedLocale]
}

function resolveChatErrorLocale(locale: ChatErrorLocale | undefined): ChatErrorLocale {
  if (locale) return locale
  return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("tr")
    ? "tr"
    : "en"
}
