import type { AppLocale } from "../session/appLocale"

// Test OTA publish via GitHub Actions
const TURKISH_GENITIVE_BY_VOWEL: Record<string, string> = {
  a: "ın",
  ı: "ın",
  e: "in",
  i: "in",
  o: "un",
  u: "un",
  ö: "ün",
  ü: "ün"
}

// Foreign vowels follow the nearest Turkish vowel for harmony.
const VOWEL_ALIASES: Record<string, string> = {
  â: "a", á: "a", à: "a", ä: "e", å: "a",
  ê: "e", é: "e", è: "e", ë: "e",
  î: "i", í: "i", ì: "i", ï: "i",
  ô: "o", ó: "o", ò: "o",
  û: "u", ú: "u", ù: "u",
  y: "i"
}

function normalizeVowel(letter: string): string | null {
  if (TURKISH_GENITIVE_BY_VOWEL[letter]) return letter
  return VOWEL_ALIASES[letter] ?? null
}

/**
 * The genitive suffix a Turkish proper name takes: "Evren" -> "in",
 * "Arda" -> "nın", "Doğu" -> "nun". The last vowel sets the harmony and a
 * final vowel takes the buffer "n".
 */
export function turkishGenitiveSuffix(name: string): string {
  const letters = [...name.toLocaleLowerCase("tr")].filter((letter) => /\p{L}/u.test(letter))
  const lastLetter = letters.at(-1)
  let harmonyVowel = "e"
  for (let index = letters.length - 1; index >= 0; index -= 1) {
    const vowel = normalizeVowel(letters[index])
    if (vowel) {
      harmonyVowel = vowel
      break
    }
  }
  const suffix = TURKISH_GENITIVE_BY_VOWEL[harmonyVowel]
  const endsWithVowel = lastLetter !== undefined && normalizeVowel(lastLetter) !== null
  return endsWithVowel ? `n${suffix}` : suffix
}

/** "Evren'in odası" / "Evren's room"; null when there is no usable name. */
export function formatRoomOwnerLabel(
  displayName: string | null | undefined,
  locale: AppLocale
): string | null {
  const firstName = displayName?.trim().split(/\s+/u)[0] ?? ""
  if (!/\p{L}/u.test(firstName)) return null
  if (locale === "tr") return `${firstName}’${turkishGenitiveSuffix(firstName)} odası`
  return `${firstName}’s room`
}
