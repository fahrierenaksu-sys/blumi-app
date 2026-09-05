export const REACTION_TYPES = ["wave", "heart", "laugh", "fire"] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

export interface ReactionEvent {
  roomId: string;
  actorUserId: string;
  targetUserId?: string;
  reaction: ReactionType;
  createdAt: string;
}
