/**
 * Chat emotes (prototype, EXPO_PUBLIC_BLUMI_CHAT_EMOTES): a short room line can
 * make the sender's chibi react once — hearts, a laugh, a thought, a wave,
 * sparkles or a sleepy "z".
 *
 * Every phone derives the emote from the chat message it already shows, so no
 * new realtime event exists and the server stays the only authority over the
 * chat itself. The result is only an emote name: no part of the message text
 * ever leaves this module (no log, no analytics, no state that holds it).
 */
export const CHAT_EMOTES = ["heart", "laugh", "think", "wave", "sparkle", "sleepy"] as const
export type ChatEmote = (typeof CHAT_EMOTES)[number]

/** Longer lines are conversation, not a reaction: they never emote. */
export const CHAT_EMOTE_MAX_MESSAGE_CHARS = 60
/** One emote per sender at most this often; a burst of lines reacts once. */
export const CHAT_EMOTE_SENDER_COOLDOWN_MS = 3_000
/**
 * A line delivered later than this (a reconnect catching up) does not emote.
 * Generous on purpose: the server time is compared with this phone's clock,
 * and a skewed phone only loses a decoration, never a message.
 */
export const CHAT_EMOTE_MAX_MESSAGE_AGE_MS = 30_000

interface ChatEmoteTriggers {
  /** Whole words, folded (no Turkish letters, lower case). */
  readonly words: readonly string[]
  /** Word beginnings, for Turkish suffixes (teşekkür-ler, tebrik-ler). */
  readonly stems: readonly string[]
  /** Several words in a row. */
  readonly phrases: readonly string[]
  readonly emoji: readonly string[]
  /** Checked against each squeezed word. */
  readonly patterns: readonly RegExp[]
  /** Checked against each folded word before squeezing (where a doubled letter matters). */
  readonly rawPatterns: readonly RegExp[]
}

/**
 * When one line carries several reactions, the first emote in this order wins
 * (good-night beats a pet name, a pet name beats a greeting).
 */
const CHAT_EMOTE_PRIORITY: readonly ChatEmote[] = ["sleepy", "heart", "laugh", "wave", "sparkle", "think"]

const NONE: readonly never[] = []

const CHAT_EMOTE_TRIGGERS: Readonly<Record<ChatEmote, ChatEmoteTriggers>> = {
  heart: {
    words: ["seviyorum", "sevdim", "ozledim", "askim", "askm", "sevgilim", "canimsin", "tatlisin", "kalp", "love",
      "ily", "ilysm", "xoxo", "thx", "tsk", "tsm", "sagol", "sagolun"],
    stems: ["tesekkur", "thank"],
    phrases: ["love you", "miss you", "seni seviyorum"],
    emoji: ["❤", "♥", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "🩷", "💕", "💖", "💗", "💓", "💞", "💘", "💝",
      "😍", "🥰", "😘", "😻", "🫶", "<3"],
    patterns: NONE,
    rawPatterns: NONE
  },
  laugh: {
    words: ["lol", "lmao", "lmfao", "rofl", "xd", "komik", "komiksin", "koptum"],
    stems: ["kahkaha", "gulmekten"],
    phrases: NONE,
    emoji: ["😂", "🤣", "😆", "😹", "😄", "😁", "😸"],
    // hahaha, ahah, hehe, hihi and the Turkish keyboard laugh "sjsjsj"
    patterns: [/^(?:ha|ah|he|eh|hi|ih)+h?$/, /^(?:sj|js)+s?j?$/],
    rawPatterns: NONE
  },
  think: {
    words: ["acaba", "bilmem", "bilmiyorum", "idk", "dunno", "thinking", "hmm"],
    stems: ["dusun"],
    phrases: ["emin degilim", "not sure", "let me think"],
    emoji: ["🤔", "💭", "🧐", "🤨"],
    patterns: NONE,
    // hm, hmm, hımm (but never "him")
    rawPatterns: [/^hm+$/, /^him{2,}$/]
  },
  wave: {
    words: ["selam", "selamlar", "slm", "sa", "merhaba", "merhabalar", "mrb", "mrhb", "naber", "nbr", "gunaydin",
      "hey", "hi", "hello", "hola", "bye", "baybay", "gorusuruz", "hoscakal"],
    stems: NONE,
    phrases: ["hosca kal", "iyi aksamlar", "good morning", "see you", "gorusmek uzere"],
    emoji: ["👋", "🙋"],
    patterns: NONE,
    rawPatterns: NONE
  },
  sparkle: {
    words: ["harika", "muhtesem", "mukemmel", "super", "sahane", "efsane", "wow", "vay", "yasasin", "yey", "yay",
      "amazing", "awesome", "bravo", "perfect", "omg", "congrats", "congratulations"],
    stems: ["tebrik"],
    phrases: ["iyi ki dogdun", "happy birthday"],
    emoji: ["✨", "🌟", "⭐", "🎉", "🎊", "🥳", "🤩", "💫"],
    patterns: NONE,
    rawPatterns: NONE
  },
  sleepy: {
    words: ["uykum", "uykulu", "uykuluyum", "uyuyorum", "uyucam", "uyuyacagim", "yatiyorum", "yatcam", "yatacagim",
      "yorgunum", "yoruldum", "esniyorum", "sleepy", "tired", "gn", "zzz"],
    stems: NONE,
    phrases: ["iyi geceler", "iyi uykular", "tatli ruyalar", "good night", "sweet dreams", "uykum geldi"],
    emoji: ["😴", "💤", "🥱", "😪", "🛌"],
    patterns: NONE,
    rawPatterns: NONE
  }
}

const TURKISH_LETTER_FOLD: Readonly<Record<string, string>> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u"
}
/** Emoji presentation selector, zero-width joiner and skin tones: a 👋🏽 is a 👋. */
const EMOJI_DECORATION = /[️‍]|\uD83C[\uDFFB-\uDFFF]/g

/** Lower case without Turkish letters, so "Günaydın", "GUNAYDIN" and "gunaydin" match alike. */
function foldText(text: string): string {
  return text
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (letter) => TURKISH_LETTER_FOLD[letter] ?? letter)
}

/** One letter per run, so "selaaam" is "selam" and "hmmm" is "hm" (triggers are squeezed alike). */
function squeeze(word: string): string {
  return word.replace(/(.)\1+/g, "$1")
}

function toWords(folded: string): string[] {
  return folded.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0)
}

interface PreparedTriggers {
  readonly words: ReadonlySet<string>
  readonly stems: readonly string[]
  readonly phrases: readonly string[]
  readonly emoji: readonly string[]
  readonly patterns: readonly RegExp[]
  readonly rawPatterns: readonly RegExp[]
}

function prepare(triggers: ChatEmoteTriggers): PreparedTriggers {
  return {
    words: new Set(triggers.words.map(squeeze)),
    stems: triggers.stems.map(squeeze),
    phrases: triggers.phrases.map((phrase) => ` ${toWords(foldText(phrase)).map(squeeze).join(" ")} `),
    emoji: triggers.emoji,
    patterns: triggers.patterns,
    rawPatterns: triggers.rawPatterns
  }
}

const PREPARED_TRIGGERS: Readonly<Record<ChatEmote, PreparedTriggers>> = Object.freeze(Object.fromEntries(
  CHAT_EMOTES.map((emote) => [emote, prepare(CHAT_EMOTE_TRIGGERS[emote])])
) as Record<ChatEmote, PreparedTriggers>)

/** At least four letters, so "ha" or "hi" is not read as a laugh. */
const MIN_PATTERN_WORD_LENGTH = 4

interface MessageView {
  readonly emojiText: string
  readonly rawWords: readonly string[]
  readonly words: readonly string[]
  readonly joined: string
  readonly onlyQuestionMarks: boolean
}

function viewMessage(body: string): MessageView {
  const folded = foldText(body)
  const rawWords = toWords(folded)
  const words = rawWords.map(squeeze)
  return {
    emojiText: body.replace(EMOJI_DECORATION, ""),
    rawWords,
    words,
    joined: ` ${words.join(" ")} `,
    onlyQuestionMarks: /^[?？\s]+$/.test(body)
  }
}

function matches(view: MessageView, triggers: PreparedTriggers): boolean {
  if (triggers.emoji.some((emoji) => view.emojiText.includes(emoji))) return true
  if (view.words.some((word) => triggers.words.has(word))) return true
  if (view.words.some((word) => triggers.stems.some((stem) => word.startsWith(stem)))) return true
  if (triggers.phrases.some((phrase) => view.joined.includes(phrase))) return true
  if (view.words.some((word) => word.length >= MIN_PATTERN_WORD_LENGTH &&
    triggers.patterns.some((pattern) => pattern.test(word)))) return true
  return view.rawWords.some((word) => triggers.rawPatterns.some((pattern) => pattern.test(word)))
}

/** The one emote a chat line asks for, or null. Pure; the text is read and dropped. */
export function detectChatEmote(body: string): ChatEmote | null {
  const trimmed = body.trim()
  if (trimmed.length === 0) return null
  if (Array.from(trimmed).length > CHAT_EMOTE_MAX_MESSAGE_CHARS) return null
  const view = viewMessage(trimmed)
  if (view.onlyQuestionMarks) return "think"
  for (const emote of CHAT_EMOTE_PRIORITY) {
    if (matches(view, PREPARED_TRIGGERS[emote])) return emote
  }
  return null
}

/** When each sender last emoted (in memory only; never logged or sent). */
export interface ChatEmoteGateState {
  readonly lastEmoteAtBySender: Readonly<Record<string, number>>
}

export const EMPTY_CHAT_EMOTE_GATE: ChatEmoteGateState = Object.freeze({
  lastEmoteAtBySender: Object.freeze({})
})

export interface ChatEmoteGateInput {
  readonly senderUserId: string
  readonly body: string
  readonly nowMs: number
  /** Server send time when known (an incoming line); a line this phone just sent omits it. */
  readonly sentAtMs?: number
}

export interface ChatEmoteDecision {
  readonly state: ChatEmoteGateState
  readonly emote: ChatEmote | null
}

/**
 * Whether this line emotes, and the gate after it. Only a line that emotes
 * starts the sender's cooldown; the state is never changed in place.
 */
export function decideChatEmote(state: ChatEmoteGateState, input: ChatEmoteGateInput): ChatEmoteDecision {
  const unchanged: ChatEmoteDecision = { state, emote: null }
  if (input.sentAtMs !== undefined && Number.isFinite(input.sentAtMs) &&
    input.nowMs - input.sentAtMs > CHAT_EMOTE_MAX_MESSAGE_AGE_MS) return unchanged
  const last = state.lastEmoteAtBySender[input.senderUserId]
  if (last !== undefined && input.nowMs - last < CHAT_EMOTE_SENDER_COOLDOWN_MS) return unchanged
  const emote = detectChatEmote(input.body)
  if (!emote) return unchanged
  return {
    emote,
    state: { lastEmoteAtBySender: { ...state.lastEmoteAtBySender, [input.senderUserId]: input.nowMs } }
  }
}
