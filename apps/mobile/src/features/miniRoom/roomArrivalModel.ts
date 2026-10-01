import type { AppLocale } from "../session/appLocale"

/**
 * What happens when the server reports a ready shared room (`mini_room.ready`).
 * UX audit ROOM-09: the inviter used to be pulled into the room from any
 * screen with a plain fade. The room now opens directly only from the invite's
 * own chat or when the user asked for it (accept, join, demo); anywhere else a
 * "X is in the room · Join" banner is shown.
 */
export type ReadyRoomArrival = "enter" | "announce"

export function resolveReadyRoomArrival(input: {
  /** The user accepted or tapped join; never second-guess an explicit action. */
  requestedByUser: boolean
  currentRouteName: string | undefined
  currentRouteParams: unknown
  sourceThreadId: string | undefined
}): ReadyRoomArrival {
  if (input.requestedByUser) return "enter"
  if (input.currentRouteName !== "ChatThread" || !input.sourceThreadId) return "announce"
  const params = input.currentRouteParams
  const threadId = params && typeof params === "object"
    ? (params as { threadId?: unknown }).threadId
    : undefined
  return threadId === input.sourceThreadId ? "enter" : "announce"
}

/** Long enough to notice and tap; the chat's invite card still offers Join. */
export const ROOM_ARRIVAL_BANNER_MS = 10_000

export interface RoomArrivalBanner {
  title: string
  body: string
  accessibilityLabel: string
}

const ROOM_ARRIVAL_COPY: Record<AppLocale, {
  title: (partnerName: string) => string
  body: string
  closed: string
}> = {
  en: {
    title: (partnerName) => `${partnerName} is in the room`,
    body: "Tap to join",
    closed: "This room has closed"
  },
  tr: {
    title: (partnerName) => `${partnerName} odada`,
    body: "Katılmak için dokun",
    closed: "Bu oda kapandı"
  }
}

export function getRoomArrivalBanner(locale: AppLocale, partnerName: string): RoomArrivalBanner {
  const copy = ROOM_ARRIVAL_COPY[locale]
  const title = copy.title(partnerName)
  return { title, body: copy.body, accessibilityLabel: `${title}. ${copy.body}` }
}

export function getRoomArrivalClosedTitle(locale: AppLocale): string {
  return ROOM_ARRIVAL_COPY[locale].closed
}
