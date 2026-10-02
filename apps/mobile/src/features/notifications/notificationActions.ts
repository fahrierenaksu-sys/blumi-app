/**
 * iOS notification categories and what their buttons do. The server sends
 * chat message pushes with category CHAT_MESSAGE and room invite pushes with
 * ROOM_INVITE (apps/server/src/notifications/pushMessagePolicy.ts); the
 * identifiers must stay in step with it.
 *
 * No runtime imports: runs under plain Node tests.
 */
export const CHAT_MESSAGE_CATEGORY_ID = "CHAT_MESSAGE"
export const ROOM_INVITE_CATEGORY_ID = "ROOM_INVITE"
export const ROOM_INVITE_ENTER_ACTION_ID = "ROOM_INVITE_ENTER"
export const ROOM_INVITE_LATER_ACTION_ID = "ROOM_INVITE_LATER"
/** expo-notifications' identifier for a plain tap on the notification. */
export const DEFAULT_NOTIFICATION_ACTION_ID = "expo.modules.notifications.actions.DEFAULT"
/** iOS reports a swipe-away with this identifier (custom dismiss categories only). */
const SYSTEM_DISMISS_ACTION_ID = "com.apple.UNNotificationDismissActionIdentifier"

export type NotificationCategoryLocale = "en" | "tr"

export interface NotificationCategoryDefinition {
  identifier: string
  actions: NotificationCategoryAction[]
  options: { previewPlaceholder: string }
}

export interface NotificationCategoryAction {
  identifier: string
  buttonTitle: string
  options: { opensAppToForeground: boolean; isDestructive?: boolean }
}

const COPY: Record<NotificationCategoryLocale, {
  enterRoom: string
  later: string
  messagePlaceholder: string
  invitePlaceholder: string
}> = {
  en: { enterRoom: "Enter room", later: "Later", messagePlaceholder: "New message", invitePlaceholder: "Room invitation" },
  tr: { enterRoom: "Odaya gir", later: "Sonra", messagePlaceholder: "Yeni mesaj", invitePlaceholder: "Oda daveti" }
}

/** What to register with setNotificationCategoryAsync, in the app's language. */
export function getNotificationCategories(locale: NotificationCategoryLocale): NotificationCategoryDefinition[] {
  const copy = COPY[locale]
  return [
    {
      identifier: CHAT_MESSAGE_CATEGORY_ID,
      actions: [],
      // Shown instead of the text when the user hides previews.
      options: { previewPlaceholder: copy.messagePlaceholder }
    },
    {
      identifier: ROOM_INVITE_CATEGORY_ID,
      actions: [
        { identifier: ROOM_INVITE_ENTER_ACTION_ID, buttonTitle: copy.enterRoom, options: { opensAppToForeground: true } },
        // "Later" only closes the notification; the invite stays in the chat.
        { identifier: ROOM_INVITE_LATER_ACTION_ID, buttonTitle: copy.later, options: { opensAppToForeground: false } }
      ],
      options: { previewPlaceholder: copy.invitePlaceholder }
    }
  ]
}

/** How a notification response is handled: routed like a tap, routed to enter the room, or only dismissed. */
export type NotificationResponseIntent =
  | { kind: "open" }
  | { kind: "enter_room" }
  | { kind: "dismiss" }

export function resolveNotificationResponseIntent(actionIdentifier: unknown): NotificationResponseIntent {
  if (actionIdentifier === ROOM_INVITE_ENTER_ACTION_ID) return { kind: "enter_room" }
  if (actionIdentifier === ROOM_INVITE_LATER_ACTION_ID || actionIdentifier === SYSTEM_DISMISS_ACTION_ID) {
    return { kind: "dismiss" }
  }
  // A plain tap, or a response without an action (older payloads).
  return { kind: "open" }
}
