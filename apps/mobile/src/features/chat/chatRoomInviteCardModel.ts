import { getRoomInviteActions, getRoomInvitePresentation, type ChatLocale, type ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"

const COPY = {
  tr: {
    label: "Oda daveti", pendingTitle: "Biraz da odada takılalım mı?", acceptedTitle: "Davet kabul edildi!",
    closedTitle: "Başka bir zamana.", sent: "Oda davetini gönderdin.", received: "Seni odasına davet etti.",
    ready: "Hazır olduğunda odaya geçebilirsin.", waiting: "Kabul etmesi bekleniyor", note: "Seni bekliyorum",
    incomingNote: "Gelir misin?", acceptedNote: "Kabul ettim!", closedNote: "Sonra görüşürüz",
    enter: "Odaya geç", accept: "Daveti kabul et", decline: "Şimdi değil", cancel: "Daveti geri çek"
  },
  en: {
    label: "Room invitation", pendingTitle: "Shall we hang out in the room?", acceptedTitle: "Invitation accepted!",
    closedTitle: "Another time.", sent: "You sent a room invitation.", received: "They invited you to their room.",
    ready: "Enter the room when you’re ready.", waiting: "Waiting for them to accept", note: "Waiting for you",
    incomingNote: "Coming over?", acceptedNote: "I’m in!", closedNote: "See you later",
    enter: "Enter room", accept: "Accept invitation", decline: "Not now", cancel: "Cancel invitation"
  }
} as const

/** Presentation never grants access; only a server-approved action can enter. */
export function getRoomInviteCardState(invite: ChatRoomInviteTimelineItem, userId: string, locale: ChatLocale) {
  const copy = COPY[locale]
  const actions = getRoomInviteActions(invite, userId)
  const primaryAction = actions.find(action => action.type === "accept" || action.type === "open_room")
  const secondaryAction = actions.find(action => action.type === "cancel" || action.type === "decline")
  const isSender = invite.senderUserId === userId
  const isParticipant = isSender || invite.recipientUserId === userId
  const pending = invite.status === "pending"
  const accepted = invite.status === "accepted"
  return {
    label: copy.label,
    title: pending ? copy.pendingTitle : accepted ? copy.acceptedTitle : copy.closedTitle,
    detail: accepted ? copy.ready : isSender ? copy.sent : copy.received,
    note: accepted ? copy.acceptedNote : pending ? isSender ? copy.note : copy.incomingNote : copy.closedNote,
    statusLabel: pending && isSender ? copy.waiting : getRoomInvitePresentation(invite, userId, locale).statusLabel,
    primaryLabel: primaryAction?.type === "accept" ? copy.accept : copy.enter,
    secondaryLabel: secondaryAction?.type === "cancel" ? copy.cancel : copy.decline,
    primaryAction,
    secondaryAction,
    showPrimary: isParticipant && (pending || accepted),
    doorOpen: primaryAction?.type === "open_room",
    isSender
  }
}
