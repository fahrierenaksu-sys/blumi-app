import type {
  RoomPetAvatar,
  RoomPetCell,
  RoomPetMap,
  RoomPetPose,
  RoomPetSpot,
  RoomPetState,
  RoomPetTrick
} from "./roomPet.types"
import {
  findRoomPetPath,
  getRoomPetDistances,
  getRoomPetFacingToward,
  getRoomPetNeighbours,
  isSameRoomPetCell,
  roomPetCellKey
} from "./roomPetGrid"
import { drawRoomPetInteger, drawRoomPetRandom } from "./roomPetRng"
import { ROOM_PET_OWNER_KEY, ROOM_PET_TRICK_UNLOCKS, ROOM_PET_TUNING as T } from "./roomPetTuning"

/**
 * Mode transitions. Every function takes `atMs`, the moment the transition
 * happens (an event's tick, a step's scheduled time or a timer's end), and
 * returns a new state.
 */

export function getRoomPetAvatars(state: RoomPetState): RoomPetAvatar[] {
  return state.owner ? [state.owner, ...state.visitors] : [...state.visitors]
}

export function getRoomPetBlockedKeys(state: RoomPetState): Set<string> {
  return new Set(getRoomPetAvatars(state).map((avatar) => roomPetCellKey(avatar.cell)))
}

export function findRoomPetAvatar(state: RoomPetState, key: string): RoomPetAvatar | null {
  if (key === ROOM_PET_OWNER_KEY) return state.owner
  return state.visitors.find((visitor) => visitor.key === key) ?? null
}

export function getRoomPetUnlockedTricks(bondMs: number): RoomPetTrick[] {
  return ROOM_PET_TRICK_UNLOCKS.filter((unlock) => bondMs >= unlock.bondMs).map((unlock) => unlock.trick)
}

function isOwnerSeated(state: RoomPetState): boolean {
  return Boolean(state.owner && state.owner.seatFurnitureId)
}

function getOccupiedFurnitureIds(state: RoomPetState): Set<string> {
  return new Set(
    getRoomPetAvatars(state)
      .map((avatar) => avatar.seatFurnitureId)
      .filter((id): id is string => Boolean(id))
  )
}

/** Starts walking along `path`; arrival is handled by the engine when the path runs out. */
function walk(state: RoomPetState, path: readonly RoomPetCell[], stepMs: number, atMs: number): RoomPetState {
  return {
    ...state,
    path,
    stepMs,
    nextMoveAtMs: atMs + stepMs,
    pose: path.length > 0 ? (stepMs === T.runStepMs ? "run" : "walk") : state.pose,
    perchSpotId: null,
    modeEndsAtMs: null
  }
}

export function enterRoomPetIdle(state: RoomPetState, atMs: number): RoomPetState {
  const duration = drawRoomPetInteger(state.rngState, T.idleMinMs, T.idleMaxMs)
  const poseDraw = drawRoomPetRandom(duration.rngState)
  const pose: RoomPetPose = poseDraw.value < 0.5 ? "stand" : "sit"
  return {
    ...state,
    rngState: poseDraw.rngState,
    mode: "idle",
    goal: null,
    path: [],
    pose,
    perchSpotId: null,
    modeEndsAtMs: atMs + duration.value
  }
}

/** Where the pet goes when nothing special is happening. */
export function enterRoomPetDefault(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  return isOwnerSeated(state) ? startRoomPetFollowSeat(state, map, atMs) : enterRoomPetIdle(state, atMs)
}

/** Nearest free cell beside `target` (by walking distance from the pet); null when none is reachable. */
function findCellBeside(state: RoomPetState, map: RoomPetMap, target: RoomPetCell): RoomPetCell | null {
  const blocked = getRoomPetBlockedKeys(state)
  const distances = getRoomPetDistances(map, state.cell, blocked)
  const beside = getRoomPetNeighbours(map, target)
    .filter((cell) => !blocked.has(roomPetCellKey(cell)) && distances.has(roomPetCellKey(cell)))
    .sort((a, b) => (distances.get(roomPetCellKey(a)) ?? 0) - (distances.get(roomPetCellKey(b)) ?? 0))
  return beside[0] ?? null
}

function startWalkTo(
  state: RoomPetState,
  map: RoomPetMap,
  target: RoomPetCell,
  stepMs: number,
  atMs: number
): RoomPetState | null {
  const path = findRoomPetPath(map, state.cell, target, getRoomPetBlockedKeys(state))
  return path && path.length > 0 ? walk(state, path, stepMs, atMs) : null
}

export function startRoomPetWander(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const blocked = getRoomPetBlockedKeys(state)
  const distances = getRoomPetDistances(map, state.cell, blocked)
  const candidates = map.cells.filter((cell) => {
    const distance = distances.get(roomPetCellKey(cell))
    return distance !== undefined && distance >= T.wanderMinCells && distance <= T.wanderMaxCells
  })
  if (candidates.length === 0) return enterRoomPetIdle(state, atMs)
  const pick = drawRoomPetInteger(state.rngState, 0, candidates.length - 1)
  const moved = startWalkTo({ ...state, rngState: pick.rngState }, map, candidates[pick.value], T.walkStepMs, atMs)
  if (!moved) return enterRoomPetIdle({ ...state, rngState: pick.rngState }, atMs)
  return { ...moved, mode: "wander", goal: { kind: "wander" } }
}

/** The nearest free rug or bed by walking distance (ties: spot id order); null when none is reachable. */
export function chooseRoomPetSleepSpot(state: RoomPetState, map: RoomPetMap): RoomPetSpot | null {
  const blocked = getRoomPetBlockedKeys(state)
  const occupied = getOccupiedFurnitureIds(state)
  const distances = getRoomPetDistances(map, state.cell, blocked)
  let best: { spot: RoomPetSpot; distance: number } | null = null
  for (const spot of map.spots) {
    if (spot.kind === "sofa" || occupied.has(spot.id)) continue
    const distance = distances.get(roomPetCellKey(spot.cell))
    if (distance === undefined) continue
    if (!best || distance < best.distance) best = { spot, distance }
  }
  return best ? best.spot : null
}

export function startRoomPetSleep(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const spot = chooseRoomPetSleepSpot(state, map)
  const base: RoomPetState = { ...state, mode: "sleep", goal: { kind: "sleep", spotId: spot ? spot.id : null } }
  if (!spot || isSameRoomPetCell(spot.cell, state.cell)) return arriveRoomPetSleep(base, map, atMs)
  const moved = startWalkTo(base, map, spot.cell, T.walkStepMs, atMs)
  return moved ?? arriveRoomPetSleep({ ...base, goal: { kind: "sleep", spotId: null } }, map, atMs)
}

export function arriveRoomPetSleep(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const spotId = state.goal && state.goal.kind === "sleep" ? state.goal.spotId : null
  const spot = map.spots.find((candidate) => candidate.id === spotId)
  return {
    ...state,
    mode: "sleep",
    path: [],
    pose: "sleep",
    perchSpotId: spot && spot.kind !== "rug" ? spot.id : null,
    emote: "zzz",
    emoteUntilMs: Number.POSITIVE_INFINITY,
    modeEndsAtMs: atMs + T.sleepMaxMs
  }
}

/** A bed or sofa that is free and reachable, picked at random; null when none. */
function choosePerchSpot(state: RoomPetState, map: RoomPetMap): { spot: RoomPetSpot | null; rngState: number } {
  const blocked = getRoomPetBlockedKeys(state)
  const occupied = getOccupiedFurnitureIds(state)
  const distances = getRoomPetDistances(map, state.cell, blocked)
  const candidates = map.spots.filter(
    (spot) => spot.kind !== "rug" && !occupied.has(spot.id) && distances.has(roomPetCellKey(spot.cell))
  )
  if (candidates.length === 0) return { spot: null, rngState: state.rngState }
  const pick = drawRoomPetInteger(state.rngState, 0, candidates.length - 1)
  return { spot: candidates[pick.value], rngState: pick.rngState }
}

export function startRoomPetHop(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState | null {
  const choice = choosePerchSpot(state, map)
  if (!choice.spot) return null
  const base: RoomPetState = {
    ...state,
    rngState: choice.rngState,
    mode: "hopOnto",
    goal: { kind: "hop", spotId: choice.spot.id, phase: "approach" },
    cooldowns: { ...state.cooldowns, hopUntilMs: atMs + T.hopCooldownMs }
  }
  if (isSameRoomPetCell(choice.spot.cell, state.cell)) return arriveRoomPetHop(base, atMs)
  return startWalkTo(base, map, choice.spot.cell, T.walkStepMs, atMs)
}

export function arriveRoomPetHop(state: RoomPetState, atMs: number): RoomPetState {
  if (!state.goal || state.goal.kind !== "hop") return state
  return {
    ...state,
    path: [],
    pose: "hop",
    perchSpotId: state.goal.spotId,
    goal: { ...state.goal, phase: "up" },
    modeEndsAtMs: atMs + T.hopPhaseMs
  }
}

/** Hop phases: up -> perch -> down -> default. */
export function advanceRoomPetHop(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  if (!state.goal || state.goal.kind !== "hop") return enterRoomPetDefault(state, map, atMs)
  if (state.goal.phase === "up") {
    const perch = drawRoomPetInteger(state.rngState, T.perchMinMs, T.perchMaxMs)
    return {
      ...state,
      rngState: perch.rngState,
      pose: "perch",
      goal: { ...state.goal, phase: "perch" },
      modeEndsAtMs: atMs + perch.value
    }
  }
  if (state.goal.phase === "perch") {
    return { ...state, pose: "hop", perchSpotId: null, goal: { ...state.goal, phase: "down" }, modeEndsAtMs: atMs + T.hopPhaseMs }
  }
  return enterRoomPetDefault({ ...state, perchSpotId: null }, map, atMs)
}

export function startRoomPetGreet(
  state: RoomPetState,
  map: RoomPetMap,
  avatarKey: string,
  atMs: number
): RoomPetState {
  const avatar = findRoomPetAvatar(state, avatarKey)
  if (!avatar) return state
  if ((state.cooldowns.greetUntilMs[avatarKey] ?? 0) > atMs) return state
  const base: RoomPetState = {
    ...state,
    mode: "greet",
    goal: { kind: "greet", avatarKey, deadlineMs: atMs + T.greetDeadlineMs, greeted: false },
    emote: null,
    emoteUntilMs: 0,
    perchSpotId: null,
    lastInteractionMs: atMs,
    cooldowns: {
      ...state.cooldowns,
      greetUntilMs: { ...state.cooldowns.greetUntilMs, [avatarKey]: atMs + T.greetCooldownMs }
    }
  }
  const besideNow = getRoomPetNeighbours(map, avatar.cell).some((cell) => isSameRoomPetCell(cell, state.cell))
  if (besideNow) return arriveRoomPetGreet(base, atMs)
  const target = findCellBeside(base, map, avatar.cell)
  const moved = target ? startWalkTo(base, map, target, T.runStepMs, atMs) : null
  return moved ?? arriveRoomPetGreet(base, atMs)
}

/** The greeting itself: heart, happy pose, facing the avatar. Also used when the deadline hits mid-run. */
export function arriveRoomPetGreet(state: RoomPetState, atMs: number): RoomPetState {
  if (!state.goal || state.goal.kind !== "greet") return state
  const avatar = findRoomPetAvatar(state, state.goal.avatarKey)
  return {
    ...state,
    path: [],
    pose: "happy",
    facing: avatar ? getRoomPetFacingToward(state.cell, avatar.cell, state.facing) : state.facing,
    emote: "heart",
    emoteUntilMs: atMs + T.emoteMs,
    goal: { ...state.goal, greeted: true },
    modeEndsAtMs: atMs + T.greetHoldMs
  }
}

export function startRoomPetFollowSeat(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const owner = state.owner
  if (!owner) return enterRoomPetIdle(state, atMs)
  const base: RoomPetState = { ...state, mode: "followSeat", goal: { kind: "curl" }, emote: null, emoteUntilMs: 0 }
  const besideNow = getRoomPetNeighbours(map, owner.cell).some((cell) => isSameRoomPetCell(cell, state.cell))
  if (besideNow) return arriveRoomPetFollowSeat(base)
  const target = findCellBeside(base, map, owner.cell)
  const moved = target ? startWalkTo(base, map, target, T.walkStepMs, atMs) : null
  return moved ?? { ...arriveRoomPetFollowSeat(base), pose: "sit" }
}

export function arriveRoomPetFollowSeat(state: RoomPetState): RoomPetState {
  return {
    ...state,
    path: [],
    pose: "curl",
    perchSpotId: null,
    modeEndsAtMs: null,
    facing: state.owner ? getRoomPetFacingToward(state.cell, state.owner.cell, state.facing) : state.facing
  }
}

export function startRoomPetReact(
  state: RoomPetState,
  cause: "tap" | "chatHeart",
  atMs: number
): RoomPetState {
  const wasSleeping = state.mode === "sleep"
  let rngState = state.rngState
  let pose: RoomPetPose = "happy"
  if (cause === "tap" && !wasSleeping) {
    const options = getRoomPetUnlockedTricks(state.bondMs)
    if (options.length > 0) {
      const pick = drawRoomPetInteger(rngState, 0, options.length)
      rngState = pick.rngState
      const trick = options[pick.value]
      if (trick) pose = trick === "roll" ? "trickRoll" : trick === "hop" ? "trickHop" : "trickWave"
    }
  }
  return {
    ...state,
    rngState,
    mode: "react",
    goal: null,
    path: [],
    pose,
    perchSpotId: null,
    facing: state.owner ? getRoomPetFacingToward(state.cell, state.owner.cell, state.facing) : state.facing,
    emote: wasSleeping ? "sparkle" : "heart",
    emoteUntilMs: atMs + T.emoteMs,
    lastInteractionMs: atMs,
    modeEndsAtMs: atMs + T.reactMs
  }
}

/** Idle timer ran out: sleep when it has been quiet, sometimes hop onto furniture, otherwise wander. */
export function decideAfterRoomPetIdle(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  if (isOwnerSeated(state)) return startRoomPetFollowSeat(state, map, atMs)
  if (atMs - state.lastInteractionMs >= T.sleepAfterQuietMs) return startRoomPetSleep(state, map, atMs)
  const hopDraw = drawRoomPetRandom(state.rngState)
  const next: RoomPetState = { ...state, rngState: hopDraw.rngState }
  if (hopDraw.value < T.hopChance && state.cooldowns.hopUntilMs <= atMs) {
    const hopped = startRoomPetHop(next, map, atMs)
    if (hopped) return hopped
  }
  return startRoomPetWander(next, map, atMs)
}
