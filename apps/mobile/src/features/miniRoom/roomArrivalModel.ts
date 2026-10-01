import type { AppLocale } from "../session/appLocale"

/**
 * What happens when the server reports a ready shared room (`mini_room.ready`).
 * UX audit ROOM-09: the inviter used to be pulled into the room from any
 * screen with a plain fade. Only an explicit Enter room action opens it now.
 * The invitation chat stays on its card; other screens show a ready-room banner.
 */
export type ReadyRoomArrival = "enter" | "announce" | "stay"

export function resolveReadyRoomArrival(input: {
  /** The user tapped Enter room; accepting alone never enters. */
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
  return threadId === input.sourceThreadId ? "stay" : "announce"
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
