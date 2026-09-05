import type { MiniRoom } from "@blumi/contracts";

export const CONNECTION_DECISION_DENIAL_REASONS = [
  "actor_not_participant",
  "partner_not_participant",
  "partner_mismatch",
] as const;

export type ConnectionDecisionDenialReason =
  (typeof CONNECTION_DECISION_DENIAL_REASONS)[number];

export interface ConnectionDecisionEligibilityResult {
  allowed: boolean;
  reason?: ConnectionDecisionDenialReason;
}

export function canRecordConnectionDecision(params: {
  miniRoom: MiniRoom;
  actorUserId: string;
  partnerUserId: string;
}): ConnectionDecisionEligibilityResult {
  const { miniRoom, actorUserId, partnerUserId } = params;
  const participants = miniRoom.participantUserIds;

  if (!participants.includes(actorUserId)) {
    return { allowed: false, reason: "actor_not_participant" };
  }

  if (!participants.includes(partnerUserId)) {
    return { allowed: false, reason: "partner_not_participant" };
  }

  const expectedPartnerUserId = participants.find((userId) => userId !== actorUserId);
  if (expectedPartnerUserId !== partnerUserId) {
    return { allowed: false, reason: "partner_mismatch" };
  }

  return { allowed: true };
}
