import type {
  RoomPetCell,
  RoomPetEvent,
  RoomPetMap,
  RoomPetOutput,
  RoomPetState,
  RoomPetVisitor
} from "./roomPet.types"
import {
  advanceRoomPetHop,
  advanceRoomPetRest,
  arriveRoomPetFollowSeat,
  arriveRoomPetGreet,
  arriveRoomPetHop,
  arriveRoomPetSleep,
  enterRoomPetDefault,
  enterRoomPetIdle,
  findRoomPetAvatar,
  getRoomPetBlockedKeys,
  startRoomPetFollowSeat,
  startRoomPetGreet,
  startRoomPetHop,
  startRoomPetReact,
  startRoomPetSleep,
  startRoomPetWander
} from "./roomPetBehaviour"
import {
  findNearestFreeRoomPetCell,
  findRoomPetPath,
  getRoomPetFacingToward,
  getRoomPetNeighbours,
  isRoomPetCellWalkable,
  roomPetCellKey
} from "./roomPetGrid"
import { createRoomPetRngState, drawRoomPetInteger } from "./roomPetRng"
import { ROOM_PET_OWNER_KEY, ROOM_PET_TUNING as T } from "./roomPetTuning"

export interface CreateRoomPetStateInput {
  readonly map: RoomPetMap
  readonly seed: number
  readonly nowMs: number
  /** Start cell; a seeded walkable cell when unset or not walkable. */
  readonly cell?: RoomPetCell
  /** Restored bond time (tricks already learned). */
  readonly bondMs?: number
}

export interface StepRoomPetInput {
  readonly nowMs: number
  readonly events?: readonly RoomPetEvent[]
}

export function createRoomPetState(input: CreateRoomPetStateInput): RoomPetState {
  if (input.map.cells.length === 0) throw new Error("Room pet needs at least one walkable cell")
  if (!Number.isFinite(input.nowMs)) throw new Error("Room pet clock must be a finite number")
  let rngState = createRoomPetRngState(input.seed)
  let cell = input.cell && isRoomPetCellWalkable(input.map, input.cell) ? input.cell : null
  if (!cell) {
    const pick = drawRoomPetInteger(rngState, 0, input.map.cells.length - 1)
    rngState = pick.rngState
    cell = input.map.cells[pick.value]
  }
  const base: RoomPetState = {
    rngState,
    nowMs: input.nowMs,
    mode: "idle",
    cell,
    path: [],
    stepMs: T.walkStepMs,
    nextMoveAtMs: input.nowMs,
    facing: "south",
    pose: "stand",
    emote: null,
    emoteUntilMs: 0,
    modeEndsAtMs: null,
    perchSpotId: null,
    goal: null,
    lastInteractionMs: input.nowMs,
    bondMs: Math.max(0, input.bondMs ?? 0),
    owner: null,
    visitors: [],
    cooldowns: { tapUntilMs: 0, chatHeartUntilMs: 0, hopUntilMs: 0, greetUntilMs: {} }
  }
  return enterRoomPetIdle(base, input.nowMs)
}

/**
 * Advances the pet to `nowMs`: first the scheduled steps and timers due by
 * then, then the events (all at `nowMs`, in order). Same seed, same map and
 * the same step inputs always give the same states.
 */
export function stepRoomPet(state: RoomPetState, map: RoomPetMap, input: StepRoomPetInput): RoomPetState {
  const nowMs = Number.isFinite(input.nowMs) ? Math.max(state.nowMs, input.nowMs) : state.nowMs
  const bondMs = state.owner ? state.bondMs + (nowMs - state.nowMs) : state.bondMs
  let next = runScheduled({ ...state, bondMs }, map, nowMs)
  next = { ...next, nowMs }
  for (const event of input.events ?? []) {
    next = stepAsideFromAvatars(applyRoomPetEvent(next, map, event, nowMs), map, nowMs)
  }
  next = runScheduled(stepAsideFromAvatars(next, map, nowMs), map, nowMs)
  return next.emote && next.emoteUntilMs <= nowMs ? { ...next, emote: null } : next
}

export function getRoomPetOutput(state: RoomPetState): RoomPetOutput {
  return {
    mode: state.mode,
    cell: state.cell,
    targetCell: state.path.length > 0 ? state.path[state.path.length - 1] : state.cell,
    pose: state.pose,
    facing: state.facing,
    emote: state.emote,
    perchSpotId: state.perchSpotId
  }
}

type ScheduledAction = "deadline" | "move" | "modeEnd"

function nextScheduled(state: RoomPetState): { action: ScheduledAction; atMs: number } | null {
  const candidates: { action: ScheduledAction; atMs: number }[] = []
  if (state.goal && state.goal.kind === "greet" && !state.goal.greeted) {
    candidates.push({ action: "deadline", atMs: state.goal.deadlineMs })
  }
  if (state.path.length > 0) candidates.push({ action: "move", atMs: state.nextMoveAtMs })
  if (state.modeEndsAtMs !== null) candidates.push({ action: "modeEnd", atMs: state.modeEndsAtMs })
  if (candidates.length === 0) return null
  return candidates.reduce((best, candidate) => (candidate.atMs < best.atMs ? candidate : best))
}

function runScheduled(state: RoomPetState, map: RoomPetMap, nowMs: number): RoomPetState {
  let current = state
  for (let count = 0; count < T.maxActionsPerStep; count += 1) {
    const due = nextScheduled(current)
    if (!due || due.atMs > nowMs) break
    const emoteCleared = current.emote && current.emoteUntilMs <= due.atMs ? { ...current, emote: null } : current
    if (due.action === "deadline") current = arriveRoomPetGreet(emoteCleared, due.atMs)
    else if (due.action === "move") current = moveOneCell(emoteCleared, map, due.atMs)
    else current = endMode(emoteCleared, map, due.atMs)
  }
  return current
}

function moveOneCell(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const nextCell = state.path[0]
  if (getRoomPetBlockedKeys(state).has(roomPetCellKey(nextCell))) return reroute(state, map, atMs)
  const rest = state.path.slice(1)
  const moved: RoomPetState = {
    ...state,
    cell: nextCell,
    path: rest,
    facing: getRoomPetFacingToward(state.cell, nextCell, state.facing),
    nextMoveAtMs: atMs + state.stepMs
  }
  return rest.length === 0 ? arrive(moved, map, atMs) : moved
}

function arrive(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const goal = state.goal
  if (!goal || goal.kind === "wander" || goal.kind === "rest") return enterRoomPetIdle(state, atMs)
  if (goal.kind === "greet") return arriveRoomPetGreet(state, atMs)
  if (goal.kind === "sleep") return arriveRoomPetSleep(state, map, atMs)
  if (goal.kind === "hop") return arriveRoomPetHop(state, atMs)
  return arriveRoomPetFollowSeat(state)
}

/** The path is blocked by an avatar: plan again toward the same intent. */
function reroute(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const goal = state.goal
  const stopped: RoomPetState = { ...state, path: [] }
  if (!goal || goal.kind === "wander" || goal.kind === "rest") return startRoomPetWander(stopped, map, atMs)
  if (goal.kind === "sleep") return startRoomPetSleep(stopped, map, atMs)
  if (goal.kind === "hop") return startRoomPetHop(stopped, map, atMs) ?? enterRoomPetDefault(stopped, map, atMs)
  if (goal.kind === "curl") return startRoomPetFollowSeat(stopped, map, atMs)
  const avatar = findRoomPetAvatar(state, goal.avatarKey)
  if (!avatar) return enterRoomPetDefault(stopped, map, atMs)
  const blocked = getRoomPetBlockedKeys(state)
  for (const beside of getRoomPetNeighbours(map, avatar.cell)) {
    if (blocked.has(roomPetCellKey(beside))) continue
    const path = findRoomPetPath(map, state.cell, beside, blocked)
    if (path && path.length > 0) return { ...state, path, nextMoveAtMs: atMs + state.stepMs }
  }
  return arriveRoomPetGreet(stopped, atMs)
}

function endMode(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  if (state.mode === "idle") return advanceRoomPetRest(state, map, atMs)
  if (state.mode === "hopOnto") return advanceRoomPetHop(state, map, atMs)
  if (state.mode === "sleep") {
    const awake: RoomPetState = { ...state, emote: null, emoteUntilMs: 0, perchSpotId: null, lastInteractionMs: atMs }
    return enterRoomPetDefault(awake, map, atMs)
  }
  return enterRoomPetDefault({ ...state, modeEndsAtMs: null }, map, atMs)
}

/** An avatar now stands on the pet's cell: step to the nearest free cell and drop any perch. */
function stepAsideFromAvatars(state: RoomPetState, map: RoomPetMap, atMs: number): RoomPetState {
  const blocked = getRoomPetBlockedKeys(state)
  if (!blocked.has(roomPetCellKey(state.cell))) return state
  const free = findNearestFreeRoomPetCell(map, state.cell, blocked)
  if (!free) return state
  const moved: RoomPetState = {
    ...state,
    cell: free,
    facing: getRoomPetFacingToward(state.cell, free, state.facing),
    perchSpotId: null
  }
  if (moved.mode === "hopOnto") return enterRoomPetDefault(moved, map, atMs)
  return moved.path.length > 0 ? reroute(moved, map, atMs) : moved
}

function upsertVisitor(visitors: readonly RoomPetVisitor[], visitor: RoomPetVisitor): RoomPetVisitor[] {
  return [...visitors.filter((existing) => existing.key !== visitor.key), visitor]
}

function isGreeting(state: RoomPetState): boolean {
  return state.mode === "greet" && Boolean(state.goal && state.goal.kind === "greet" && !state.goal.greeted)
}

function applyRoomPetEvent(state: RoomPetState, map: RoomPetMap, event: RoomPetEvent, atMs: number): RoomPetState {
  switch (event.type) {
    case "ownerArrived":
      return startRoomPetGreet({ ...state, owner: { cell: event.cell, seatFurnitureId: null } }, map, ROOM_PET_OWNER_KEY, atMs)
    case "ownerMoved":
      return state.owner ? { ...state, owner: { ...state.owner, cell: event.cell } } : state
    case "ownerSat": {
      const seated: RoomPetState = {
        ...state,
        owner: { cell: event.cell, seatFurnitureId: event.seatFurnitureId },
        lastInteractionMs: atMs
      }
      return isGreeting(seated) ? seated : startRoomPetFollowSeat(seated, map, atMs)
    }
    case "ownerStood": {
      const standing: RoomPetState = { ...state, owner: { cell: event.cell, seatFurnitureId: null }, lastInteractionMs: atMs }
      return standing.mode === "followSeat" ? enterRoomPetIdle(standing, atMs) : standing
    }
    case "ownerLeft":
      return leave({ ...state, owner: null }, map, ROOM_PET_OWNER_KEY, atMs)
    case "visitorArrived": {
      const joined: RoomPetState = {
        ...state,
        visitors: upsertVisitor(state.visitors, { key: event.key, cell: event.cell, seatFurnitureId: null })
      }
      return isGreeting(joined) || joined.mode === "react" ? joined : startRoomPetGreet(joined, map, event.key, atMs)
    }
    case "visitorMoved":
      return {
        ...state,
        visitors: upsertVisitor(state.visitors, {
          key: event.key,
          cell: event.cell,
          seatFurnitureId: event.seatFurnitureId ?? null
        })
      }
    case "visitorLeft":
      return leave({ ...state, visitors: state.visitors.filter((visitor) => visitor.key !== event.key) }, map, event.key, atMs)
    case "chatHeart":
      if (state.cooldowns.chatHeartUntilMs > atMs || isGreeting(state)) return state
      return startRoomPetReact(
        { ...state, cooldowns: { ...state.cooldowns, chatHeartUntilMs: atMs + T.chatHeartCooldownMs } },
        "chatHeart",
        atMs
      )
    case "tap":
      if (state.cooldowns.tapUntilMs > atMs || isGreeting(state)) return state
      return startRoomPetReact(
        { ...state, cooldowns: { ...state.cooldowns, tapUntilMs: atMs + T.tapCooldownMs } },
        "tap",
        atMs
      )
  }
}

/** Someone left: stop greeting or following them. */
function leave(state: RoomPetState, map: RoomPetMap, key: string, atMs: number): RoomPetState {
  const greetingThem = state.goal && state.goal.kind === "greet" && state.goal.avatarKey === key
  const followingOwner = key === ROOM_PET_OWNER_KEY && state.mode === "followSeat"
  return greetingThem || followingOwner ? enterRoomPetDefault(state, map, atMs) : state
}
