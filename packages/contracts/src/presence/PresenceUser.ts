import type { AvatarSelection } from "../avatar/AvatarSelection";

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatar: AvatarSelection;
  spotId: string;
  inMiniRoom: boolean;
}
