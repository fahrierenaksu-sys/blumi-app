export const MINI_ROOM_INVITE_DECISIONS = ["accepted", "declined", "cancelled"] as const;

export type MiniRoomInviteDecisionStatus = (typeof MINI_ROOM_INVITE_DECISIONS)[number];

export interface MiniRoomInviteDecision {
  inviteId: string;
  senderUserId: string;
  recipientUserId: string;
  status: MiniRoomInviteDecisionStatus;
  decidedAt: string;
}
