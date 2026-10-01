import type { ChatMessage } from "@blumi/contracts"
import type { InboxCopy } from "../chat/inboxCopy"
import type { AccountRecoveryLocale } from "../session/accountRecoveryCopy"

/**
 * Pure presentation rules for one inbox row: the last-activity time (live,
 * relative within the hour, then clock time, yesterday, weekday, date), the
 * preview with a "You:" prefix, the unread badge and the single VoiceOver
 * label (name, unread count, preview, time).
 */

export interface InboxTimestamp {
  /** What the row shows. */
  label: string
  /** What VoiceOver reads ("5 minutes ago" instead of "5m"). */
  spoken: string
}

export interface InboxTimeFormatter {
  time(ms: number): string
  weekday(ms: number): { label: string; spoken: string }
  date(ms: number, withYear: boolean): { label: string; spoken: string }
}

export interface InboxRowPreview {
  /** "You: " when the last message is mine. */
  prefix: string | undefined
  body: string | undefined
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const WEEK_DAYS = 7
/** Lands just after the minute flips, so the label has already changed. */
const CLOCK_TICK_SLACK_MS = 250
const UNREAD_BADGE_MAX = 99
const ROOM_INVITE_BODY = "__room_invite__"

/**
 * The device locale keeps its region (en-GB 24 h, en-US 12 h) only when it
 * speaks the app's language; otherwise the app language's default region.
 */
export function resolveInboxDateLocale(appLocale: AccountRecoveryLocale, deviceLocale: string | undefined): string {
  const language = deviceLocale?.split(/[-_]/)[0]?.toLowerCase()
  if (deviceLocale && language === appLocale) return deviceLocale
  return appLocale === "tr" ? "tr-TR" : "en-US"
}

function usesTwentyFourHourClock(locale: string): boolean {
  const options = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions() as {
    hourCycle?: string
    hour12?: boolean
  }
  if (options.hourCycle) return options.hourCycle === "h23" || options.hourCycle === "h24"
  return options.hour12 === false
}

export function createInboxTimeFormatter(locale: string): InboxTimeFormatter {
  const time = new Intl.DateTimeFormat(locale, {
    hour: usesTwentyFourHourClock(locale) ? "2-digit" : "numeric",
    minute: "2-digit"
  })
  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: "short" })
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: "long" })
  const dateShort = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
  const dateLong = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" })
  const yearShort = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" })
  const yearLong = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" })
  return {
    time: (ms) => time.format(ms),
    weekday: (ms) => ({ label: weekdayShort.format(ms), spoken: weekdayLong.format(ms) }),
    date: (ms, withYear) => withYear
      ? { label: yearShort.format(ms), spoken: yearLong.format(ms) }
      : { label: dateShort.format(ms), spoken: dateLong.format(ms) }
  }
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Whole local calendar days between two instants (DST-safe). */
function calendarDaysBetween(earlierMs: number, laterMs: number): number {
  return Math.round((startOfLocalDay(laterMs) - startOfLocalDay(earlierMs)) / (24 * HOUR_MS))
}

export function formatInboxTimestamp(
  isoDate: string | undefined,
  nowMs: number,
  copy: InboxCopy,
  format: InboxTimeFormatter
): InboxTimestamp {
  if (!isoDate) return { label: "", spoken: "" }
  const sentMs = Date.parse(isoDate)
  if (!Number.isFinite(sentMs)) return { label: "", spoken: "" }
  const elapsedMs = Math.max(0, nowMs - sentMs)
  if (elapsedMs < MINUTE_MS) return { label: copy.time.now, spoken: copy.time.nowSpoken }
  if (elapsedMs < HOUR_MS) {
    const minutes = Math.floor(elapsedMs / MINUTE_MS)
    return { label: copy.time.minutes(minutes), spoken: copy.time.minutesSpoken(minutes) }
  }
  const days = calendarDaysBetween(sentMs, nowMs)
  if (days <= 0) {
    const time = format.time(sentMs)
    return { label: time, spoken: time }
  }
  if (days === 1) return { label: copy.time.yesterday, spoken: copy.time.yesterday }
  if (days < WEEK_DAYS) return format.weekday(sentMs)
  return format.date(sentMs, new Date(sentMs).getFullYear() !== new Date(nowMs).getFullYear())
}

/** Delay until the row times next change (the next minute boundary). */
export function getInboxClockRefreshDelayMs(nowMs: number): number {
  return MINUTE_MS - (nowMs % MINUTE_MS) + CLOCK_TICK_SLACK_MS
}

export function buildInboxRowPreview(input: {
  lastMessage: Pick<ChatMessage, "senderUserId" | "body"> | undefined
  currentUserId: string
  copy: InboxCopy
}): InboxRowPreview {
  const { lastMessage, copy } = input
  if (!lastMessage) return { prefix: undefined, body: undefined }
  const trimmed = lastMessage.body.trim()
  const body = trimmed === ROOM_INVITE_BODY ? copy.roomInvitation : trimmed.replace(/\s+/g, " ")
  if (!body) return { prefix: undefined, body: undefined }
  return {
    prefix: lastMessage.senderUserId === input.currentUserId ? `${copy.youPrefix}: ` : undefined,
    body
  }
}

export function formatInboxUnreadBadge(count: number): string | null {
  if (!(count > 0)) return null
  return count > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(count)
}

export function buildInboxRowAccessibilityLabel(copy: InboxCopy, input: {
  partnerName: string
  unreadCount: number
  preview: InboxRowPreview
  timeSpoken: string
}): string {
  const parts = [input.partnerName]
  if (input.unreadCount > 0) parts.push(copy.unreadMessages(input.unreadCount))
  parts.push(input.preview.body ? `${input.preview.prefix ?? ""}${input.preview.body}` : copy.startWithSpark)
  if (input.timeSpoken) parts.push(input.timeSpoken)
  return parts.join(", ")
}
