import type { SharedValue } from "react-native-reanimated"
import type { RoomFurnitureRotation, RoomV2AvatarMotionState } from "../../roomV2/roomV2.types"
import type { AvatarLiveScope } from "./avatarLiveBudget"

/**
 * Types shared by the 2.5D avatar renderer and the screens that draw it (types only, no code). Ported from the
 * experiment's `roomAvatar25dContract.ts`: the dev module, its stub and the dev setters are not part of the app.
 */

export type AvatarPose = "stand" | "walk" | "sit" | "wave"

/**
 * Which drawn body (rig) the avatar is: picked from the coerced loadout's body (`avatar_v2_body_male_light` → the
 * boy, every other body → the girl). Read only; the profile is never changed by it.
 */
export type AvatarRigId = "female" | "male"

/** What the 2.5D renderer draws for one avatar. Always defined: the resolver is total (resolveAvatarDraw). */
export interface AvatarDrawSpec {
  /** The drawn body: each avatar (a MiniRoom's remote participant too) is drawn with its own. */
  rig: AvatarRigId
  view: "front" | "back"
  mirror: boolean
  pose: AvatarPose
  /** 2.5D rig item ids, in the canonical slot order shoes, bottom, top, hair. */
  itemIds: string[]
}

export interface AvatarDrawInput {
  /** The stored or received loadout as it came (anyone's, never trusted): coerced before it is drawn. */
  loadout: unknown
  /** Body hints for a loadout whose body is missing (the stored preset, the profile's gender). */
  hints?: { presetId?: unknown; gender?: unknown }
  state?: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
}

export interface AvatarLiveProps {
  spec: AvatarDrawSpec
  /**
   * The live-canvas budget this avatar draws from (`avatarLiveBudget.ts`: one per screen, two in the MiniRoom).
   * Without a granted slot no GPU surface is mounted.
   */
  liveScope: AvatarLiveScope
  /** The live stage point (fractions of the stage) while it walks: the cycle follows the distance covered. */
  live?: { x: SharedValue<number>; y: SharedValue<number> }
  stageWidthPx: SharedValue<number>
  stageHeightPx: SharedValue<number>
  /** The renderer around the body already mirrors it (avatarV2 draws "left" flipped): compensate. */
  outerMirrored?: boolean
  reduceMotion: boolean
  /** The avatar box's on-screen height (dp); the 2.5D figure is drawn rig `motion.charScale` × the avatarV2 figure. */
  boxHeightPx: number
  /**
   * My Room only. While its avatar is seated the outer renderer moves the box down by `outerPx` (the seat's
   * height `seatPx` plus a compensation authored for the avatarV2 sitting art). The 2.5D body takes back the
   * avatarV2-only part for its seated drawing, and all of it while the knees bend before that drawing shows.
   */
  seatPlacement?: {
    outerPx: number
    seatPx: number
    /** Seated (2.5D seat path): the approach spot in front of the seat, relative to the seat point (px, y down). */
    approachPx?: { dx: number; dy: number }
    /**
     * A layered seat (room calibration): the seat point is the floor point under the hip and `seatPx` the hip's
     * height above it, so the seated drawing's hip goes exactly there (its soles below it by the drawing's own
     * hip-to-sole drop).
     */
    hip?: {
      /** The drawing she sits in, whatever the walking directions can show. */
      view: "front" | "back"
      mirror: boolean
      /** Back views: nothing of her is drawn this far (px) below the hip point. */
      clipBelowHipPx?: number
      /** The floor where her seated soles stand, this far (px) below the hip point: her shins lengthen to it. */
      soleDropPx?: number
    }
  }
  /**
   * The room calibration's figure height (px) for this stage: one scale everywhere in the room, with her soles on
   * the box's floor point. Unset: the figure is sized from the box (rig `motion.charScale`) on the avatarV2 foot line.
   */
  calibratedFigureHeightPx?: number
  /** Load the GPU surface but draw nothing yet (MiniRoom: until its stage has faded in). */
  holdCanvas?: boolean
  onDrawn?: () => void
}
