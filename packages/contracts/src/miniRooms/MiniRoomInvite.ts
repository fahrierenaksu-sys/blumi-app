export const MINI_ROOM_INVITE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled"
] as const;

export type MiniRoomInviteStatus = (typeof MINI_ROOM_INVITE_STATUSES)[number];

export interface MiniRoomInvite {
  inviteId: string;
  /** Legacy lobby context. Chat-originated invites intentionally omit it. */
  roomId?: string;
  senderUserId: string;
  recipientUserId: string;
  /** Legacy lobby position. It is not collected for a private chat invite. */
  senderSpotId?: string;
  /** The authoritative chat thread that originated this private invite. */
  sourceThreadId?: string;
  createdAt: string;
  /** Private chat invites expire after ten minutes; legacy records may omit it. */
  expiresAt?: string;
  /** Present after acceptance so a relaunched chat can reopen its room. */
  roomSessionId?: string;
}
