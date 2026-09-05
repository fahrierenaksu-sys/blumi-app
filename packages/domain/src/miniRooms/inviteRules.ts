import type { NearbyUser } from "@blumi/contracts";

export const INVITE_DENIAL_REASONS = [
  "self",
  "not_nearby",
  "blocked",
  "sender_busy",
  "recipient_busy",
] as const;

export type InviteDenialReason = (typeof INVITE_DENIAL_REASONS)[number];

export interface InviteEligibilityResult {
  allowed: boolean;
  reason?: InviteDenialReason;
}

export function canInviteUser(params: {
  senderUserId: string;
  recipientUserId: string;
  nearbyUsers: NearbyUser[];
  senderInMiniRoom: boolean;
  recipientInMiniRoom: boolean;
}): InviteEligibilityResult {
  const {
    senderUserId,
    recipientUserId,
    nearbyUsers,
    senderInMiniRoom,
    recipientInMiniRoom,
  } = params;

  if (senderUserId === recipientUserId) {
    return { allowed: false, reason: "self" };
  }

  if (senderInMiniRoom) {
    return { allowed: false, reason: "sender_busy" };
  }

  if (recipientInMiniRoom) {
    return { allowed: false, reason: "recipient_busy" };
  }

  const nearbyUser = nearbyUsers.find((user) => user.userId === recipientUserId);
  if (!nearbyUser) {
    return { allowed: false, reason: "not_nearby" };
  }

  if (nearbyUser.blocked) {
    return { allowed: false, reason: "blocked" };
  }

  if (!nearbyUser.canInvite) {
    return { allowed: false, reason: "not_nearby" };
  }

  return { allowed: true };
}
