/**
 * Room pet (P1) rules shared by the server and, later, the app.
 *
 * The server is the only judge of who owns which pet: this module only says
 * which species exist and what a well-formed pet name looks like. Species IDs
 * are canonical item IDs and never change once published; a retired species
 * is hidden, never renamed or reused.
 */
export const ROOM_PET_CAT_SPECIES_ID = "pet_cat_blumi_v1"

/** P1 ships one species. Add new canonical IDs here; never rename one. */
export const ROOM_PET_SPECIES_IDS: readonly string[] = Object.freeze([ROOM_PET_CAT_SPECIES_ID])

/** Species that count as "a cat" for features built on the room cat (Gezgin kedi). */
export const ROOM_PET_CAT_SPECIES_IDS: readonly string[] = Object.freeze([ROOM_PET_CAT_SPECIES_ID])

export const ROOM_PET_NAME_MIN_LENGTH = 1
export const ROOM_PET_NAME_MAX_LENGTH = 16
/** More digits than this in one name reads as a phone number fragment. */
export const ROOM_PET_NAME_MAX_DIGITS = 4

export type RoomPetNameProblem = "empty" | "too_long" | "control_characters" | "phone_like"

export type RoomPetNameCheck =
  | { ok: true; name: string }
  | { ok: false; problem: RoomPetNameProblem }

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/
const DIGITS = /\p{Nd}/gu

export function isRoomPetSpeciesId(value: unknown): value is string {
  return typeof value === "string" && ROOM_PET_SPECIES_IDS.includes(value)
}

/**
 * NFC-normalises, trims and collapses inner whitespace, then checks length
 * (in code points, as PostgreSQL's char_length counts), invisible or control
 * characters and phone-number-like digit counts. Content moderation (the
 * public text filter) is the server's separate, additional step.
 */
export function normalizeRoomPetName(value: unknown): RoomPetNameCheck {
  if (typeof value !== "string") return { ok: false, problem: "empty" }
  const raw = value.normalize("NFC")
  if (CONTROL_CHARACTERS.test(raw.replace(/[\t\n\r]/g, " "))) return { ok: false, problem: "control_characters" }
  const name = raw.replace(/\s+/g, " ").trim()
  const length = [...name].length
  if (length < ROOM_PET_NAME_MIN_LENGTH) return { ok: false, problem: "empty" }
  if (length > ROOM_PET_NAME_MAX_LENGTH) return { ok: false, problem: "too_long" }
  if ((name.match(DIGITS) ?? []).length > ROOM_PET_NAME_MAX_DIGITS) return { ok: false, problem: "phone_like" }
  return { ok: true, name }
}
