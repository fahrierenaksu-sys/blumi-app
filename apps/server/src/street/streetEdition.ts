/**
 * The street changes once a day (spec §2). An edition starts at 05:00
 * Europe/Istanbul, which has been UTC+3 all year since 2016, so the start is
 * 02:00 UTC. A change saved during the previous edition shows all day in the
 * current one, so a label never tells when it was made, only "since yesterday".
 */
const EDITION_START_UTC_HOUR = 2
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export interface StreetEdition {
  /** YYYY-MM-DD of the edition's Istanbul morning. */
  readonly id: string
  readonly startsAt: Date
  readonly previousStartsAt: Date
}

export function resolveStreetEdition(now: Date): StreetEdition {
  const shifted = new Date(now.getTime() - EDITION_START_UTC_HOUR * HOUR_MS)
  const id = shifted.toISOString().slice(0, 10)
  const startsAt = new Date(`${id}T0${EDITION_START_UTC_HOUR}:00:00.000Z`)
  return Object.freeze({
    id,
    startsAt,
    previousStartsAt: new Date(startsAt.getTime() - DAY_MS)
  })
}

/** Whether a change saved at `changedAt` is news in `edition`: saved during the edition before it. */
export function isNewsInEdition(changedAt: Date | null, edition: StreetEdition): boolean {
  if (!changedAt) return false
  const time = changedAt.getTime()
  return time >= edition.previousStartsAt.getTime() && time < edition.startsAt.getTime()
}
