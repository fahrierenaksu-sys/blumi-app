/** A user's local calendar, from the zone their quiet hours already use. */
export interface CatLocalClock {
  dayKey(ms: number): string
  /** First instant of the local day. */
  dayStartMs(dayKey: string): number
  /** First instant of the next local day. */
  dayEndMs(dayKey: string): number
  minuteOfDay(ms: number): number
}

const MINUTE_MS = 60_000
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

export function createCatLocalClock(input: { timeZone?: string | null; utcOffsetMinutes?: number }): CatLocalClock {
  const formatter = input.timeZone
    ? safeFormatter(input.timeZone)
    : null
  const fixedOffsetMs = (input.utcOffsetMinutes ?? 0) * MINUTE_MS
  const offsetAt = (ms: number): number => {
    if (!formatter) return fixedOffsetMs
    const parts = readParts(formatter, ms)
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    return asUtc - Math.floor(ms / MINUTE_MS) * MINUTE_MS
  }
  const dayStartMs = (dayKey: string): number => {
    const match = DAY_KEY.exec(dayKey)
    if (!match) throw new RangeError("Invalid day key")
    const midnightUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    // Two passes settle the offset across a daylight-saving change.
    const first = midnightUtc - offsetAt(midnightUtc)
    return midnightUtc - offsetAt(first)
  }
  const clock: CatLocalClock = {
    dayKey(ms) {
      const local = new Date(ms + offsetAt(ms))
      return local.toISOString().slice(0, 10)
    },
    dayStartMs,
    dayEndMs(dayKey) {
      const next = new Date(Date.parse(`${dayKey}T00:00:00Z`) + 36 * 60 * 60_000).toISOString().slice(0, 10)
      return dayStartMs(next)
    },
    minuteOfDay(ms) {
      const local = new Date(ms + offsetAt(ms))
      return local.getUTCHours() * 60 + local.getUTCMinutes()
    }
  }
  return Object.freeze(clock)
}

function safeFormatter(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    })
  } catch {
    return null
  }
}

function readParts(formatter: Intl.DateTimeFormat, ms: number) {
  const parts = formatter.formatToParts(new Date(ms))
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") }
}
