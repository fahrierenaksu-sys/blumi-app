import type { CatReturnState, CatTripKind } from "./catTripModel"

/**
 * Turkish copy for the traveling cat (the app's first language). Names appear
 * only inside the app, after the reveal; pushes never carry one (server copy).
 */

const FRONT_VOWELS = new Set(["e", "i", "ö", "ü"])
const ROUNDED_VOWELS = new Set(["o", "u", "ö", "ü"])
const VOWELS = new Set(["a", "e", "ı", "i", "o", "ö", "u", "ü"])

function lastVowel(word: string): string {
  const lower = word.toLocaleLowerCase("tr-TR")
  for (let index = lower.length - 1; index >= 0; index -= 1) {
    if (VOWELS.has(lower[index]!)) return lower[index]!
  }
  return "e"
}

function endsWithVowel(word: string): boolean {
  return VOWELS.has(word.toLocaleLowerCase("tr-TR").slice(-1))
}

/** Genitive with an apostrophe, by vowel harmony: Mert'in, Ece'nin, Can'ın, Oğuz'un, Gül'ün. */
export function withGenitive(name: string): string {
  const vowel = lastVowel(name)
  const front = FRONT_VOWELS.has(vowel)
  const rounded = ROUNDED_VOWELS.has(vowel)
  const suffixVowel = front ? (rounded ? "ü" : "i") : (rounded ? "u" : "ı")
  return `${name}'${endsWithVowel(name) ? "n" : ""}${suffixVowel}n`
}

/** Dative with an apostrophe: Mert'e, Ece'ye, Can'a, Ali'ye. */
export function withDative(name: string): string {
  const suffixVowel = FRONT_VOWELS.has(lastVowel(name)) ? "e" : "a"
  return `${name}'${endsWithVowel(name) ? "y" : ""}${suffixVowel}`
}

/** The first word of a display name, trimmed; null when there is none. */
export function firstName(displayName: string | undefined | null): string | null {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? first : null
}

export interface CatSouvenirCopy {
  readonly label: string
  readonly glyph: string
}

/** Keys come from the server's souvenir catalog; an unknown key still shows as a keepsake. */
const SOUVENIR_COPY: Readonly<Record<string, CatSouvenirCopy>> = Object.freeze({
  ribbon: { label: "minik bir kurdele", glyph: "🎀" },
  leaf: { label: "bir yaprak", glyph: "🍃" },
  cushion_feather: { label: "bir yastık tüyü", glyph: "🪶" },
  button: { label: "bir düğme", glyph: "🔘" },
  pebble: { label: "pürüzsüz bir çakıl taşı", glyph: "🪨" },
  bell: { label: "küçük bir çan", glyph: "🔔" },
  star_sticker: { label: "bir yıldız çıkartması", glyph: "⭐" },
  tiny_flower: { label: "minicik bir çiçek", glyph: "🌼" },
  friend_trinket: { label: "arkadaşından minik bir hediye", glyph: "🎁" },
  moon_charm: { label: "ay şeklinde bir tılsım", glyph: "🌙" }
})

const UNKNOWN_SOUVENIR: CatSouvenirCopy = Object.freeze({ label: "küçük bir hatıra", glyph: "✨" })

export function getCatSouvenirCopy(key: string): CatSouvenirCopy {
  return SOUVENIR_COPY[key] ?? UNKNOWN_SOUVENIR
}

const RETURN_STATE_LINE: Readonly<Record<CatReturnState, string>> = Object.freeze({
  sleepy: "Biraz uykulu görünüyor.",
  petals: "Üstü başı çiçek yaprağı dolu!"
})

export const CAT_TRIP_COPY = Object.freeze({
  ownerClueTitle: (kind: CatTripKind) => kind === "sleepover" ? "Günaydın! Kedin eve döndü" : "Kedin eve döndü, bak ne getirdi",
  ownerClueBody: (souvenirLabel: string) => `Yanında ${souvenirLabel} var.`,
  returnStateLine: (state: CatReturnState | undefined) => (state ? RETURN_STATE_LINE[state] : null),
  ownerGuess: "Kimin evinde uyudu dersin?",
  flipCard: "Kartı çevir",
  later: "Sonra",
  ownerRevealTitle: (name: string | null, kind: CatTripKind) => {
    const where = name ? `${withGenitive(name)} evinde` : "bir arkadaşının evinde"
    return kind === "sleepover" ? `Bu gece ${where} uyudu!` : `Bugün ${where} kestirdi!`
  },
  ownerRevealBody: "Hatırası odandaki rafta.",
  writeTo: (name: string) => `${withDative(name)} yaz`,
  hostTitle: "Evinde minik bir misafir var",
  hostBody: "Halında mışıl mışıl uyuyor. Kimin kedisi acaba?",
  hostTapHint: "Dokun, tasmasındaki etikete bak",
  hostTag: (name: string | null) => (name ? `${withGenitive(name)} kedisi` : "Bir arkadaşının kedisi"),
  hostChip: "Bugün bir süre sende",
  awayChip: "Kedin gezmeye çıktı. Dönünce haber verir.",
  shelfTitle: "Kedinin hatıraları",
  revealUnavailable: "Bu kartı şu an açamadık. Biraz sonra tekrar dene.",
  settingsSection: "Gezgin kedi",
  settingsTravel: "Kedim misafirliğe gitsin",
  settingsTravelHint: "Kedin bazen sohbet ettiğin bir arkadaşının odasında uyur.",
  settingsHost: "Misafir kedi kabul et",
  settingsHostHint: "Kapatırsan kimseye söylenmez.",
  settingsPush: "Kedi haberleri",
  settingsPushHint: "Kedin bir yere gidince ya da evine misafir gelince haber ver. İsim yazılmaz.",
  settingsUnavailable: "Bu ayar henüz hazır değil.",
  settingsSaveFailed: "Ayar kaydedilemedi. Tekrar dene."
})
