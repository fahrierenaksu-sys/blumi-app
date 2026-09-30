import type { ImageSourcePropType } from "react-native"
import type { RoomAvatarAppearance } from "../../avatarV2/room/avatarRoom.types"
import type { RoomV2AvatarRenderLayer } from "../../roomV2/roomV2.types"
import type { MiniRoomAvatarPosition } from "./miniRoomAvatarPositions"

export interface RoomPoint {
  x: number
  y: number
}

export type AvatarFacing = "front" | "back" | "left" | "right"

export interface WalkableArea {
  id: string
  points: RoomPoint[]
}

export interface SpawnPoint {
  id: string
  role: "local" | "partner"
  x: number
  y: number
  facing: AvatarFacing
}

export interface RoomMap {
  mapId: string
  backgroundAsset: ImageSourcePropType
  width: number
  height: number
  walkableAreas: WalkableArea[]
  safeInsets: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

export interface RoomHotspot {
  id: string
  kind: "seat" | "stand" | "decor" | "activity"
  x: number
  y: number
  label?: string
  approachPoint?: RoomPoint
  facingOnArrival?: AvatarFacing
  padWidth?: number
  padHeight?: number
}

export interface FurniturePlacement {
  id: string
  asset: ImageSourcePropType
  x: number
  y: number
  width: number
  height: number
  depthY: number
  blocksMovement: boolean
}

export interface RoomScene {
  sceneId: string
  map: RoomMap
  furniture: FurniturePlacement[]
  spawnPoints: SpawnPoint[]
  hotspots: RoomHotspot[]
}

export interface AvatarAppearance {
  base: "female_base_01" | "male_base_01" | "avatar_base_01"
  snapshotSource: MiniRoomParticipantAvatarSnapshotSource
  roomAvatarLayers?: RoomV2AvatarRenderLayer[]
  roomAvatarAppearance?: RoomAvatarAppearance
  fullBodyAsset?: ImageSourcePropType
  fallbackReason?: string
  skinTone?: string
  hair?: string
  eyes?: string
  brows?: string
  mouth?: string
  top?: string
  bottom?: string
  shoes?: string
  accessory?: string
}

export type MiniRoomParticipantAvatarSnapshotSource =
  | "avatar_v2_current_user"
  | "remote_participant_avatar"
  | "partner_preview_fallback"

export interface MiniRoomParticipantAvatarSnapshot {
  userId: string
  displayName: string
  role: SpawnPoint["role"]
  source: MiniRoomParticipantAvatarSnapshotSource
  appearance: AvatarAppearance
}

export interface MiniRoomParticipantAvatarSnapshots {
  local: MiniRoomParticipantAvatarSnapshot
  partner: MiniRoomParticipantAvatarSnapshot
}

export interface AvatarState {
  present?: boolean
  userId: string
  displayName: string
  x: number
  y: number
  targetX?: number
  targetY?: number
  facing: AvatarFacing
  motion: "idle" | "walking" | "speaking" | "emoting" | "sitting"
  appearance: AvatarAppearance
  seatedHotspotId?: string
}

export type SpeechBubbleTone = "chat"

export interface SpeechBubble {
  id: string
  speakerUserId: string
  body: string
  tone: SpeechBubbleTone
  createdAt: number
  expiresAt: number
}

export interface RoomPhrase {
  id: string
  body: string
  tone: SpeechBubbleTone
}

export interface InteractionState {
  selectedHotspotId?: string
  pressedPoint?: RoomPoint
  proximityClose: boolean
}

export interface MiniRoomStore {
  scene: RoomScene
  hotspots: RoomHotspot[]
  /** Committed pose per avatar: changes on segment starts/ends and arrival, never per frame. */
  avatars: Record<string, AvatarState>
  /** Live on-screen position per avatar id, animated on the UI thread. */
  avatarPositions: Readonly<Record<string, MiniRoomAvatarPosition>>
  bubbles: SpeechBubble[]
  interaction: InteractionState
  moveLocalAvatar: (point: RoomPoint) => boolean
  moveLocalAvatarToHotspot: (hotspotId: string) => boolean
  applyRemoteAvatar: (avatar: import("@blumi/contracts").MiniRoomAvatarMotion, snap?: boolean) => void
  setRemotePresence: (userId: string, present: boolean) => void
  addSpeechBubble: (bubble: Omit<SpeechBubble, "id" | "createdAt" | "expiresAt">) => void
  sayPhrase: (userId: string, body: string, tone?: SpeechBubbleTone) => void
  dismissSpeechBubble: (bubbleId: string) => void
}
