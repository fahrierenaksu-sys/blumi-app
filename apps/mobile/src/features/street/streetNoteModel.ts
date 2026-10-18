/**
 * Sokağım notes (prototype, 2026-10-18): a short line a person leaves over their own window, read by their
 * mutual matches. One line, no line breaks, at most 60 characters (counted as characters, not UTF-16 units,
 * so an emoji counts once).
 */
export const STREET_NOTE_MAX_LENGTH = 60

/** The note to show or save, or null when nothing but spaces is left. */
export function normalizeStreetNote(raw: string): string | null {
  const oneLine = raw.replace(/\s+/g, " ").trim()
  if (oneLine === "") return null
  const characters = Array.from(oneLine)
  return characters.length <= STREET_NOTE_MAX_LENGTH ? oneLine : characters.slice(0, STREET_NOTE_MAX_LENGTH).join("").trimEnd()
}

/** Characters still free in the editor (never below zero). */
export function streetNoteCharactersLeft(draft: string): number {
  return Math.max(0, STREET_NOTE_MAX_LENGTH - Array.from(draft.replace(/\s+/g, " ")).length)
}

export type StreetLight = "morning" | "day" | "evening" | "night"

const MORNING_FROM_HOUR = 6
const DAY_FROM_HOUR = 10
const EVENING_FROM_HOUR = 18
const NIGHT_FROM_HOUR = 22

/** The light in every window follows the viewer's own clock: one street, one sky. */
export function streetLightForHour(hour: number): StreetLight {
  if (hour >= NIGHT_FROM_HOUR || hour < MORNING_FROM_HOUR) return "night"
  if (hour < DAY_FROM_HOUR) return "morning"
  if (hour < EVENING_FROM_HOUR) return "day"
  return "evening"
}
