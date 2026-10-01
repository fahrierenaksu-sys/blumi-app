import type { AvatarSelection } from "../avatar/AvatarSelection"

export interface MiniRoomParticipant {
  userId: string
  displayName: string
  avatar: AvatarSelection
}
