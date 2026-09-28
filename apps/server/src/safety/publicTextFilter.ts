import { PublicRequestError } from "../errors/publicRequestError"

// A deliberately narrow, locally evaluated first line of defence. Reporting,
// blocking and human moderation remain necessary; this is not a full classifier.
const DISALLOWED_PHRASE_PATTERNS = [
  /\bkill\s+yourself\b/,
  /\bi\s+(?:will|ll)\s+kill\s+you\b/,
  /\bkendini\s+oldur\b/,
  /\bseni\s+oldurecegim\b/,
  /\bsend\s+(?:me\s+)?nudes?\b/,
  /\bsend\s+(?:me\s+)?nude\s+photos?\b/,
  /\bciplak\s+foto(?:graf)?\s+gonder\b/
] as const

const DISALLOWED_COMPACT_MESSAGES = [
  /^killyourself$/,
  /^(?:iwill|ill)killyou$/,
  /^kendinioldur$/,
  /^senioldurecegim$/,
  /^send(?:me)?nudes?$/,
  /^send(?:me)?nudep(?:hotos?|ics?)$/,
  /^ciplakfoto(?:graf)?gonder$/
] as const

export function isPublicTextAllowed(value: string): boolean {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (!normalized) return true

  const words = normalized.split(/\s+/)
  const obfuscationNormalized = collapseSingleLetterRuns(words).join(" ")
  const compactMessage = words.join("")
  return ![
    normalized,
    obfuscationNormalized
  ].some((candidate) => DISALLOWED_PHRASE_PATTERNS.some((pattern) => pattern.test(candidate))) &&
    !DISALLOWED_COMPACT_MESSAGES.some((pattern) => pattern.test(compactMessage))
}

function collapseSingleLetterRuns(words: readonly string[]): string[] {
  const result: string[] = []
  let singleLetters: string[] = []
  const flush = () => {
    if (singleLetters.length >= 3) result.push(singleLetters.join(""))
    else result.push(...singleLetters)
    singleLetters = []
  }

  for (const word of words) {
    if (word.length === 1) {
      singleLetters.push(word)
      continue
    }
    flush()
    result.push(word)
  }
  flush()
  return result
}

export function assertPublicTextAllowed(value: string): void {
  if (!isPublicTextAllowed(value)) {
    throw new PublicRequestError("This text cannot be shared under the community rules. Please rephrase it.")
  }
}
