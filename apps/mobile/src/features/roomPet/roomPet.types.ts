/**
 * Room pet behaviour engine: shared types.
 *
 * The engine works on the room's placement-cell lattice (column, row). It is
 * pure: no rendering, no timers, no I/O. A renderer feeds it the room map, the
 * avatars' cells and a clock, and draws the output.
 *
 * Facing is in lattice terms: "east" is +column, "west" -column, "south"
 * +row, "north" -row. The renderer maps those to the shell's drawn diagonals.
 */

export interface RoomPetCell {
  readonly column: number
  readonly row: number
}

export type RoomPetFacing = "east" | "west" | "north" | "south"

/** Where a pet can sleep or play: a rug it lies on, or a bed/sofa it hops onto. */
export type RoomPetSpotKind = "rug" | "bed" | "sofa"

export interface RoomPetSpot {
  readonly id: string
  readonly kind: RoomPetSpotKind
  /** The walkable floor cell the pet stands on to use the spot (on the rug, or in front of the bed/sofa). */
  readonly cell: RoomPetCell
  /** Bed and sofa: the stage point the renderer draws a perched pet at. Rug: unset. */
  readonly perchAnchor?: { readonly x: number; readonly y: number }
  /** Bed and sofa: the floor point under `perchAnchor`; a perched pet depth-sorts by it, like a seated avatar. */
  readonly perchFloor?: { readonly x: number; readonly y: number }
}

export interface RoomPetMap {
  /** Walkable cells, sorted by row then column (stable order for seeded picks). */
  readonly cells: readonly RoomPetCell[]
  readonly walkableKeys: ReadonlySet<string>
  /** Spots, sorted by id. Every spot cell is walkable. */
  readonly spots: readonly RoomPetSpot[]
}

export type RoomPetMode =
  | "idle"
  | "wander"
  | "sleep"
  | "greet"
  | "followSeat"
  | "hopOnto"
  | "react"

export type RoomPetPose =
  | "stand"
  | "walk"
  | "run"
  | "sit"
  | "curl"
  | "sleep"
  | "hop"
  | "perch"
  | "happy"
  | "trickRoll"
  | "trickHop"
  | "trickWave"

export type RoomPetTrick = "roll" | "hop" | "wave"

export type RoomPetEmote = "heart" | "zzz" | "sparkle"

/** An avatar in the room, reduced to what the pet needs. */
export interface RoomPetAvatar {
  readonly cell: RoomPetCell
  /** The furniture the avatar sits on (render id), or null when standing. */
  readonly seatFurnitureId: string | null
}

export interface RoomPetVisitor extends RoomPetAvatar {
  /** Opaque, session-local key; never logged. */
  readonly key: string
}

export type RoomPetEvent =
  | { readonly type: "ownerArrived"; readonly cell: RoomPetCell }
  | { readonly type: "ownerMoved"; readonly cell: RoomPetCell }
  | { readonly type: "ownerSat"; readonly cell: RoomPetCell; readonly seatFurnitureId: string }
  | { readonly type: "ownerStood"; readonly cell: RoomPetCell }
  | { readonly type: "ownerLeft" }
  | { readonly type: "visitorArrived"; readonly key: string; readonly cell: RoomPetCell }
  | { readonly type: "visitorMoved"; readonly key: string; readonly cell: RoomPetCell; readonly seatFurnitureId?: string | null }
  | { readonly type: "visitorLeft"; readonly key: string }
  | { readonly type: "chatHeart" }
  | { readonly type: "tap" }

/**
 * Resting between walks, like a real cat: it stops and looks around
 * (settle), sits, sometimes lies down curled, and gets up before it moves on.
 */
export type RoomPetRestStage = "settle" | "sit" | "lie" | "getUp"

/** What the pet is walking toward and what it does on arrival; while idle, which rest stage it is in. */
export type RoomPetGoal =
  | { readonly kind: "wander" }
  | { readonly kind: "rest"; readonly stage: RoomPetRestStage }
  | { readonly kind: "greet"; readonly avatarKey: string; readonly deadlineMs: number; readonly greeted: boolean }
  | { readonly kind: "sleep"; readonly spotId: string | null }
  | { readonly kind: "hop"; readonly spotId: string; readonly phase: "approach" | "up" | "perch" | "down" }
  | { readonly kind: "curl" }

export interface RoomPetCooldowns {
  readonly tapUntilMs: number
  readonly chatHeartUntilMs: number
  readonly hopUntilMs: number
  /** Per avatar key ("owner" or a visitor key): no new greeting before this time. */
  readonly greetUntilMs: Readonly<Record<string, number>>
}

export interface RoomPetState {
  readonly rngState: number
  readonly nowMs: number
  readonly mode: RoomPetMode
  readonly cell: RoomPetCell
  readonly path: readonly RoomPetCell[]
  readonly stepMs: number
  readonly nextMoveAtMs: number
  readonly facing: RoomPetFacing
  readonly pose: RoomPetPose
  readonly emote: RoomPetEmote | null
  readonly emoteUntilMs: number
  /** Timed modes (idle, react, greet hold, hop phases, sleep cap) end here; null = untimed. */
  readonly modeEndsAtMs: number | null
  readonly perchSpotId: string | null
  readonly goal: RoomPetGoal | null
  readonly lastInteractionMs: number
  /** Time spent with the owner present; unlocks tricks. Never decreases. */
  readonly bondMs: number
  readonly owner: RoomPetAvatar | null
  readonly visitors: readonly RoomPetVisitor[]
  readonly cooldowns: RoomPetCooldowns
}

export interface RoomPetOutput {
  readonly mode: RoomPetMode
  readonly cell: RoomPetCell
  readonly targetCell: RoomPetCell
  readonly pose: RoomPetPose
  readonly facing: RoomPetFacing
  readonly emote: RoomPetEmote | null
  readonly perchSpotId: string | null
}
