import type { FetchThreadMessagesOptions } from "../chatApi"
import type {
  ChatLocale,
  ChatRoomInviteAction,
  ChatRoomInviteTimelineItem
} from "../chatRoomInviteModel"

/**
 * Chat transport, read-state and room-invitation callbacks the root owns and
 * hands to the ChatThread screen as a prop. They never travel through route
 * params, which carry serialisable ids only.
 */
export interface ChatThreadBindings {
  sendChatMessage: (
    threadId: string,
    body: string,
    clientMessageId: string
  ) => Promise<void>
  requestMessages: (threadId: string, options?: FetchThreadMessagesOptions) => Promise<void>
  markThreadRead: (threadId: string) => void
  roomInvites: readonly ChatRoomInviteTimelineItem[]
  onRoomInviteAction: (action: ChatRoomInviteAction) => Promise<void>
  /** Production sessions only. */
  onCloseActiveRoom?: (expectedRoomSessionId: string) => Promise<void>
  locale: ChatLocale
}
