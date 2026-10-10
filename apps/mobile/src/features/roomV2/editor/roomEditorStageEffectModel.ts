import type { RoomV2FurnitureRenderItem } from "../roomV2.types"

/** One short beat on the editor stage. A new beat replaces the one playing. */
export type RoomEditorStageEffect =
  | {
    key: number
    kind: "sparkle"
    /** The placed piece: the stars pop round its floor cells. */
    item: RoomV2FurnitureRenderItem
  }
  | {
    key: number
    kind: "turn"
    from: RoomV2FurnitureRenderItem
    to: RoomV2FurnitureRenderItem
    /** The turn also moved the piece to a free cell (it glides there). */
    nudged: boolean
    /**
     * "turning": the room hides the piece and the overlay plays. "handoff": the clock ended on the new drawing;
     * the room draws the piece again under it, and the overlay goes once that drawing is on screen.
     */
    phase: "turning" | "handoff"
  }

/** Whether a turn moved the piece's saved spot as well (a nudge), not only its rotation. */
export function isRoomEditorTurnNudge(from: RoomV2FurnitureRenderItem, to: RoomV2FurnitureRenderItem): boolean {
  return from.x !== to.x || from.y !== to.y
}

/** The piece the room must not draw right now: the one turning (its overlay drawings stand in for it). */
export function getRoomEditorTurnHiddenRenderId(effect: RoomEditorStageEffect | undefined): string | undefined {
  return effect?.kind === "turn" && effect.phase === "turning" ? effect.to.renderId : undefined
}
