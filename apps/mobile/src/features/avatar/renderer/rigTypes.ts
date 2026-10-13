/** Shape of rigs/<body>/rig25.json, written by tools/avatar25d/export_rig.py. */

export interface Rig25Range {
  name: string
  /** Draw order inside the avatar (painter's order, low first). */
  order: number
  start: number
  count: number
  layer?: string
  standOnly?: boolean
  /** Drawn in these poses only (an item part such as a bottom's wave-only hip patch); combined with every other rule (lab40 doll25). */
  poseOnly?: Array<"stand" | "walk" | "sit" | "wave">
  /** The mesh has baked walk weights for this range (lab40 `walkWeights`): the retargeted walk skins it with those. */
  walk?: boolean
  /**
   * A bare-leg drawing owned by this item (lab40 `legVariants`): 'bottom' (a bottom's), 'shoes' (shoes') or the legacy
   * pair 'bottom+shoes' (one item per slot). It replaces the body leg named by `layer` and is drawn as that leg; a
   * bottom worn with shoes draws its 'bottom' drawing gated by the shoes' 'shoes' drawing (avatar25Pose `legPlan`).
   */
  legVariant?: string
}

export interface Rig25Mesh {
  /** Sheet px, y down, two per vertex. */
  pos: number[]
  uv: number[]
  joints: number[]
  weights: number[]
  index: number[]
  /** Texture-array page per vertex. */
  page: number[]
  /** Folded-forearm clip group per vertex while seated: 0 none, 1 near arm, 2 far arm. */
  arm: number[]
  /** Walk skinning per vertex (four each), present when some range has baked walk weights (`walk: true`). */
  walkJoints?: number[]
  walkWeights?: number[]
  ranges: Rig25Range[]
}

export interface Rig25Item {
  slot: "hair" | "top" | "bottom" | "shoes"
  lift: number
  page: number
  /** Painted walk cards for this item (only meaningful when the body has painted walk frames). */
  hasWalk: boolean
  mesh: Rig25Mesh
  /**
   * Mirror cards (optional; export_rig.py writes them for parts with a pre-flipped drawing). The renderer mirrors
   * the whole avatar for the two mirrored directions, which moves a one-sided marker (a hair clip) to her other
   * side. `mirrorUv` is `mesh.uv` with the vertices of the marked parts pointing at their pre-flipped card; it has
   * the same length as `mesh.uv`, and a vertex counts as marked when its pair differs from `mesh.uv`. Mesh,
   * weights and draw order are shared. An item without it is drawn flipped, exactly as before.
   */
  mirrorUv?: number[]
  /** The page holding the cards when they did not fit this item's `page`; absent = `page`. */
  mirrorPage?: number
}

export interface Rig25WalkFrame {
  x: number
  y: number
  w: number
  h: number
  /** Sheet px the waist sits below standing in this frame. */
  drop: number
}

export interface Rig25View {
  ground: [number, number]
  height: number
  /** Boy rig only (passed through by export_rig.py): the body, its height N (world units) and the camera pitch. */
  meta?: { body?: string; N?: number; mPerUnit?: number; pitchDeg?: number }
  /** Boy rig only: the sheet row where his drawn shorts end (passed through; unused by the renderer so far). */
  shortsBottom?: number
  /** `tail` (sheet px) gives each bone's rest axis; the retargeted walk stretches bones along it. */
  bones: { name: string; head: [number, number]; tail?: [number, number]; parent: number }[]
  slots: { root: number; wave: number }
  waist: { y: number; x0: number; x1: number; cx: number }
  walk: {
    frames: Rig25WalkFrame[]
    cell: [number, number]
    /** Cycle fraction at which each frame starts (frame i lasts while the body covers its advance). */
    start: number[]
    /** Sheet px of screen travel per walk cycle (the planted feet's travel). */
    strideLen: number
    forward: number
    legPhase: number
    scale: [number, number]
  }
  sit: {
    seat: [number, number]
    feet: [number, number]
    /** Sides whose standing forearm folds away (clipped under the elbow). */
    fold: string[]
    armTurn: Record<string, number>
    /** Sides whose whole arm the seated drawing brings (the standing arm hides; torso uses torsoCardArms). */
    cardArms: string[]
    hideArms: boolean
  }
  wave: { pivot: [number, number]; out: number }
  /** Texture-array pages (file names), page 0 = body. */
  pages: string[]
  pageSize: [number, number]
  mesh: Rig25Mesh
  items: Record<string, Rig25Item>
  /** The retargeted 3D walk (lab40 motion_A4.json). When present it replaces the painted walk cards. */
  motion?: Rig25WalkMotion
  /** Idle breathing (Workbench life/NATIVE_PLAN.md); absent = the body idles as before. */
  breath?: Rig25Breath
  /** Blinking, front view only (the back view has no eyes); absent = the eyes never close. */
  blink?: Rig25Blink
}

/** The chest and shoulders rise a little with each breath while standing or seated. */
export interface Rig25Breath {
  /** One cycle (s) and the share of it that is the inhale (the exhale is longer). */
  periodS: number
  inhale: number
  /** The poses that breathe; the others fade it out over `fadeS`. */
  poses: string[]
  fadeS: number
  /** Sheet px each named bone's head rises at full inhale, in its parent's space (so it adds up down the chain). */
  risePx: Record<string, number>
}

/**
 * The eyes' half-closed and closed drawings, packed into free space of page 0 by export_rig.py. Drawing a frame
 * REPLACES the eye rect (alpha included) by reading it `frames[name]` px away.
 */
export interface Rig25Blink {
  page: number
  /** The head's eye rect in page-0 px (the units of `pageSize`): x, y, w, h. */
  rect: [number, number, number, number]
  /** Page px around the rect where each frame also holds the head's own pixels: the redirect may grow that far. */
  pad?: number
  /** Page-px offset from the rect to each frame. */
  frames: { half: [number, number]; closed: [number, number] }
  /** One blink: frame name and seconds, in order. */
  seq: [string, number][]
  /** The eyes stay open between these many seconds. */
  gapS: [number, number]
  /** Chance that a quick second blink follows, `doubleGapS` after the first. */
  doubleP?: number
  doubleGapS?: number
  /**
   * Worn head items (hair) that hold their own copy of the open eyes: while any blink frame shows, the item's `rect`
   * (on its page) reads its patch `offset` px away, a copy of the item with the eye pixels cleared, so the head's
   * frame shows through. One patch serves every frame. Absent: no item copies an eye.
   */
  items?: Rig25BlinkItem[]
}

export interface Rig25BlinkItem {
  item: string
  page: number
  /** The eye rect in the item's page px (units of `pageSize`): x, y, w, h. */
  rect: [number, number, number, number]
  pad?: number
  offset: [number, number]
  /** Item px the patch clears (export proof only). */
  cutPx?: number
}

/** One key pose of the retargeted walk. */
export interface Rig25WalkMotionFrame {
  /** Hips offset from rest, sheet px (y down). */
  root: [number, number]
  /** False while the far leg steps nearer the camera: the two leg layers swap depth. */
  nearFront: boolean
  /** Per bone in `bones` order: absolute on-screen turn (rad, sheet px, y down) and stretch along the rest axis. */
  pose: number[]
}

export interface Rig25WalkMotion {
  /** Sheet px a planted foot slides back on screen per walk cycle (y down). */
  stancePx: [number, number]
  frames: Rig25WalkMotionFrame[]
}

/** Size and walk speed shared with the lab (lab39 avatar_motion.json). */
export interface Rig25Motion {
  /** Drawn size relative to the avatarV2 figure. */
  charScale: number
  /** Lab world units per second, and the speed the app's timing was tuned for. */
  walkSpeed: number
  baseWalkSpeed: number
  /** Ramp (acceleration) distance multiplier: gentler starts and stops. */
  rampScale: number
}

export interface Rig25 {
  version: number
  source: string
  motion: Rig25Motion
  views: { front: Rig25View; back: Rig25View }
}

export type Avatar25ViewName = "front" | "back"
export type Avatar25Pose = "stand" | "walk" | "sit" | "wave"
