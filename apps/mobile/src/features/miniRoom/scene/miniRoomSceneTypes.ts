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
  /**
   * Presentation only: the seat whose depth this avatar is drawn at while it
   * sits down onto it or stands up from it (the seat point lies behind the
   * furniture's front edge). Never sent, never authoritative.
   */
  depthSeatHotspotId?: string
  /** Presentation only: changes once per arrival; the avatar fades in when it does. */
  arrivalId?: number
  /** Presentation only: walking in from the door (the walk is the arrival's one hero). */
  enteringFromDoor?: boolean
  /**
   * Presentation only: this arrival was a walk in from the door. It outlasts
   * the walk (a short walk lands inside the join window) so the plain join
   * ring never pops at the landing; cleared when the avatar leaves.
   */
  arrivedByWalk?: boolean
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
  /** Changes whenever the scene is rebuilt with fresh avatars (new participant, scene or appearance). */
  sceneEpoch: number
  applyRemoteAvatar: (avatar: import("@blumi/contracts").MiniRoomAvatarMotion, snap?: boolean) => void
  setRemotePresence: (userId: string, present: boolean) => void
  /**
   * Shows the partner's first arrival: a walk in from the shell's door to the
   * record's authoritative position (`walk`), or a fade in place at it. False
   * when the scene cannot present it (no door or a blocked route): apply the
   * record as usual. Never sends anything.
   */
  presentArrival: (avatar: import("@blumi/contracts").MiniRoomAvatarMotion, options: { walk: boolean }) => boolean
  /**
   * Runs `onLanded` when the avatar's walk in from the door ends (it reached
   * its spot or a newer step took over). False when no walk in is running.
   */
  deferUntilArrivalLands: (userId: string, onLanded: () => void) => boolean
  addSpeechBubble: (bubble: Omit<SpeechBubble, "id" | "createdAt" | "expiresAt">) => void
  sayPhrase: (userId: string, body: string, tone?: SpeechBubbleTone) => void
  dismissSpeechBubble: (bubbleId: string) => void
}
