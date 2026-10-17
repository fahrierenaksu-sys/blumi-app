import assert from "node:assert/strict"
import test from "node:test"

import type { RoomPetCell, RoomPetEvent, RoomPetState } from "./roomPet.types"
import { chooseRoomPetSleepSpot } from "./roomPetBehaviour"
import { createRoomPetState, getRoomPetOutput, stepRoomPet } from "./roomPetEngine"
import { isRoomPetEnabled } from "./roomPetFlag"
import { getRoomPetNeighbours, isRoomPetCellWalkable, isSameRoomPetCell, roomPetCellKey } from "./roomPetGrid"
import { drawRoomPetInteger, drawRoomPetRandom } from "./roomPetRng"
import { ROOM_PET_LONGEST_REST_MS, ROOM_PET_TRICK_UNLOCKS, ROOM_PET_TUNING as T } from "./roomPetTuning"
import { createTestRoomPetMap, runTestRoomPet, TEST_TICK_MS } from "./roomPetTestMap"

const MAP = createTestRoomPetMap()

function avatarCells(state: RoomPetState): string[] {
  const avatars = state.owner ? [state.owner, ...state.visitors] : [...state.visitors]
  return avatars.map((avatar) => roomPetCellKey(avatar.cell))
}

function isBeside(a: RoomPetCell, b: RoomPetCell): boolean {
  return Math.abs(a.column - b.column) + Math.abs(a.row - b.row) === 1
}

test("the same seed and inputs give the same pet; another seed gives another", () => {
  const events = (tick: number): RoomPetEvent[] =>
    tick === 50 ? [{ type: "ownerArrived", cell: { column: 0, row: 0 } }] : tick === 400 ? [{ type: "tap" }] : []
  const first = runTestRoomPet({ map: MAP, seed: 42, ticks: 3000, eventsAt: events })
  const second = runTestRoomPet({ map: MAP, seed: 42, ticks: 3000, eventsAt: events })
  const other = runTestRoomPet({ map: MAP, seed: 43, ticks: 3000, eventsAt: events })
  assert.deepEqual(first.outputs, second.outputs)
  assert.notDeepEqual(first.outputs, other.outputs)
})

test("over 10,000 ticks of random room life the pet stays on walkable cells and off every avatar", () => {
  let driver = 7
  const draw = (min: number, max: number): number => {
    const next = drawRoomPetInteger(driver, min, max)
    driver = next.rngState
    return next.value
  }
  const randomCell = (): RoomPetCell => MAP.cells[draw(0, MAP.cells.length - 1)]
  const eventsAt = (_tick: number, state: RoomPetState): RoomPetEvent[] => {
    const roll = draw(0, 99)
    if (roll === 0) return state.owner ? [{ type: "ownerLeft" }] : [{ type: "ownerArrived", cell: randomCell() }]
    if (roll < 6 && state.owner) return [{ type: "ownerMoved", cell: randomCell() }]
    if (roll === 6 && state.owner) return [{ type: "ownerSat", cell: randomCell(), seatFurnitureId: "bed_a" }]
    if (roll === 7 && state.owner) return [{ type: "ownerStood", cell: randomCell() }]
    if (roll === 8) return [{ type: "visitorArrived", key: "v1", cell: randomCell() }]
    if (roll < 12) return [{ type: "visitorMoved", key: "v1", cell: randomCell() }]
    if (roll === 12) return [{ type: "visitorLeft", key: "v1" }]
    if (roll === 13) return [{ type: "tap" }]
    if (roll === 14) return [{ type: "chatHeart" }]
    // an avatar walking straight onto the pet
    if (roll === 15 && state.owner) return [{ type: "ownerMoved", cell: state.cell }]
    return []
  }
  const run = runTestRoomPet({ map: MAP, seed: 99, ticks: 10000, eventsAt, keepStates: true })
  const spotIds = new Set(MAP.spots.filter((spot) => spot.kind !== "rug").map((spot) => spot.id))
  const modes = new Set<string>()
  run.states.forEach((state, index) => {
    const output = run.outputs[index]
    modes.add(output.mode)
    assert.ok(isRoomPetCellWalkable(MAP, output.cell), `tick ${index}: off the walkable area`)
    assert.ok(isRoomPetCellWalkable(MAP, output.targetCell), `tick ${index}: target off the walkable area`)
    assert.ok(state.path.every((cell) => isRoomPetCellWalkable(MAP, cell)), `tick ${index}: path leaves the floor`)
    assert.ok(!avatarCells(state).includes(roomPetCellKey(output.cell)), `tick ${index}: standing on an avatar`)
    if (output.perchSpotId !== null) assert.ok(spotIds.has(output.perchSpotId))
  })
  // the run really exercised the behaviours
  for (const mode of ["idle", "wander", "greet", "react", "followSeat"]) assert.ok(modes.has(mode), `never ${mode}`)
})

test("the pet runs to greet the owner and shows a heart within the greet deadline, once per cooldown", () => {
  const arrivalTick = 20
  const ownerCell = { column: 11, row: 9 }
  const run = runTestRoomPet({
    map: MAP,
    seed: 3,
    start: { column: 0, row: 0 },
    ticks: 1200,
    eventsAt: (tick) =>
      tick === arrivalTick || tick === arrivalTick + 300
        ? [{ type: tick === arrivalTick ? "ownerArrived" : "ownerMoved", cell: ownerCell }]
        : tick === arrivalTick + 400
          ? [{ type: "ownerArrived", cell: ownerCell }]
          : []
  })
  assert.equal(run.outputs[arrivalTick - 1].mode, "greet", "greeting starts on the arrival tick")
  assert.equal(run.outputs[arrivalTick - 1].pose, "run")
  const heartIndex = run.outputs.findIndex((output, index) => index >= arrivalTick - 1 && output.emote === "heart")
  assert.ok(heartIndex >= 0, "a heart is shown")
  assert.ok((heartIndex - (arrivalTick - 1)) * TEST_TICK_MS <= T.greetDeadlineMs, "heart within the deadline")
  // re-arrival inside the cooldown: no second greeting
  const reArrival = run.outputs[arrivalTick + 400 - 1]
  assert.notEqual(reArrival.mode, "greet")
})

test("a near owner is reached and greeted face to face", () => {
  const ownerCell = { column: 4, row: 2 }
  const run = runTestRoomPet({
    map: MAP,
    seed: 11,
    start: { column: 1, row: 2 },
    ticks: 40,
    eventsAt: (tick) => (tick === 1 ? [{ type: "ownerArrived", cell: ownerCell }] : [])
  })
  const greeted = run.outputs.find((output) => output.emote === "heart")
  assert.ok(greeted)
  assert.ok(isBeside(greeted.cell, ownerCell))
  assert.equal(greeted.pose, "happy")
  assert.equal(greeted.facing, "east")
})

test("visitors are greeted with a heart", () => {
  const run = runTestRoomPet({
    map: MAP,
    seed: 5,
    start: { column: 3, row: 3 },
    ticks: 60,
    eventsAt: (tick) => (tick === 2 ? [{ type: "visitorArrived", key: "guest", cell: { column: 8, row: 3 } }] : [])
  })
  assert.equal(run.outputs[1].mode, "greet")
  assert.ok(run.outputs.some((output) => output.emote === "heart"))
})

test("after a quiet spell the pet sleeps on the nearest rug or bed", () => {
  const quietTicks = Math.ceil((T.sleepAfterQuietMs + ROOM_PET_LONGEST_REST_MS * 2) / TEST_TICK_MS)
  const nearRug = runTestRoomPet({ map: MAP, seed: 8, start: { column: 1, row: 8 }, ticks: quietTicks })
  const nearBed = runTestRoomPet({ map: MAP, seed: 8, start: { column: 10, row: 1 }, ticks: quietTicks })
  const lastRug = nearRug.outputs[nearRug.outputs.length - 1]
  const lastBed = nearBed.outputs[nearBed.outputs.length - 1]
  assert.equal(lastRug.mode, "sleep")
  assert.equal(lastRug.emote, "zzz")
  assert.equal(lastRug.pose, "sleep")
  assert.equal(lastBed.mode, "sleep")
  assert.equal(lastBed.perchSpotId, "bed_a")
  assert.deepEqual(lastBed.cell, { column: 9, row: 2 })
})

test("sleep spot choice is the nearest free rug or bed, never the sofa or an occupied bed", () => {
  const base = createRoomPetState({ map: MAP, seed: 1, nowMs: 0, cell: { column: 9, row: 7 } })
  // the sofa (9,8) is one step away but is not a sleep spot; the bed (9,2) is nearer than the rug (2,7)
  assert.equal(chooseRoomPetSleepSpot(base, MAP)?.id, "bed_a")
  const ownerOnBed: RoomPetState = { ...base, owner: { cell: { column: 9, row: 3 }, seatFurnitureId: "bed_a" } }
  assert.equal(chooseRoomPetSleepSpot(ownerOnBed, MAP)?.id, "rug_a")
  const noSpots = createTestRoomPetMap({ withSpots: false })
  assert.equal(chooseRoomPetSleepSpot(createRoomPetState({ map: noSpots, seed: 1, nowMs: 0 }), noSpots), null)
})

test("the pet wakes on a tap and never sleeps forever", () => {
  const quietTicks = Math.ceil((T.sleepAfterQuietMs + ROOM_PET_LONGEST_REST_MS * 2) / TEST_TICK_MS)
  const capTicks = Math.ceil(T.sleepMaxMs / TEST_TICK_MS)
  const tapped = runTestRoomPet({
    map: MAP, seed: 8, start: { column: 1, row: 8 }, ticks: quietTicks + 5,
    eventsAt: (tick) => (tick === quietTicks + 1 ? [{ type: "tap" }] : [])
  })
  const woke = tapped.outputs[quietTicks]
  assert.equal(woke.mode, "react")
  assert.equal(woke.emote, "sparkle")
  const left = runTestRoomPet({ map: MAP, seed: 8, start: { column: 1, row: 8 }, ticks: quietTicks + capTicks + 10 })
  const fellAsleep = left.outputs.findIndex((output) => output.pose === "sleep")
  assert.ok(fellAsleep >= 0 && fellAsleep <= quietTicks)
  assert.ok(left.outputs.slice(fellAsleep, fellAsleep + capTicks + 2).some((output) => output.mode !== "sleep"), "slept past the cap")
})

function countEntries(outputs: readonly { mode: string }[], mode: string): number[] {
  const entries: number[] = []
  outputs.forEach((output, index) => {
    if (output.mode === mode && (index === 0 || outputs[index - 1].mode !== mode)) entries.push(index)
  })
  return entries
}

test("between walks the pet rests like a cat: it sits, lies down and gets up before it walks again", () => {
  const ticks = Math.ceil((20 * 60 * 1000) / TEST_TICK_MS)
  const restingPoses = new Set<string>(["sit", "curl", "sleep"])
  const movingPoses = new Set<string>(["walk", "run"])
  for (const seed of [3, 11, 27]) {
    const run = runTestRoomPet({ map: MAP, seed, ticks })
    const poses = new Set<string>(run.outputs.map((output) => output.pose))
    for (const pose of ["sit", "curl", "walk"]) assert.ok(poses.has(pose), `seed ${seed}: never ${pose}`)
    const movingTicks = run.outputs.filter((output) => movingPoses.has(output.pose)).length
    assert.ok(movingTicks / ticks < 0.2, `seed ${seed}: walks ${Math.round((movingTicks / ticks) * 100)}% of the time`)
    const restingTicks = run.outputs.filter((output) => restingPoses.has(output.pose)).length
    assert.ok(restingTicks / ticks > 0.5, `seed ${seed}: rests only ${Math.round((restingTicks / ticks) * 100)}% of the time`)
    run.outputs.forEach((output, index) => {
      if (index === 0 || !movingPoses.has(output.pose)) return
      const before = run.outputs[index - 1].pose
      assert.ok(!restingPoses.has(before), `seed ${seed}, tick ${index}: walked off straight from ${before}`)
    })
  }
})

test("a rest without interruptions never jumps from lying to sitting and every stage lasts a while", () => {
  const run = runTestRoomPet({ map: MAP, seed: 5, ticks: Math.ceil((10 * 60 * 1000) / TEST_TICK_MS) })
  let stageStart = 0
  run.outputs.forEach((output, index) => {
    if (index === 0) return
    const before = run.outputs[index - 1]
    if (before.pose === output.pose) return
    assert.ok(!(before.pose === "curl" && output.pose === "sit"), `tick ${index}: curl straight to sit`)
    if (before.mode === "idle" && output.mode === "idle") {
      assert.ok((index - stageStart) * TEST_TICK_MS >= T.idleMinMs, `tick ${index}: ${before.pose} lasted too short`)
    }
    stageStart = index
  })
})

test("tap and chat-heart spam is rate limited so the pet is not jittery", () => {
  const tapStarts: number[] = []
  const heartStarts: number[] = []
  let state = createRoomPetState({ map: MAP, seed: 2, nowMs: 0 })
  for (let tick = 1; tick <= 200; tick += 1) {
    const before = state.cooldowns
    state = stepRoomPet(state, MAP, { nowMs: tick * TEST_TICK_MS, events: [{ type: "tap" }, { type: "chatHeart" }] })
    if (state.cooldowns.tapUntilMs !== before.tapUntilMs) tapStarts.push(tick * TEST_TICK_MS)
    if (state.cooldowns.chatHeartUntilMs !== before.chatHeartUntilMs) heartStarts.push(tick * TEST_TICK_MS)
    if (tick === 1) assert.equal(state.mode, "react")
  }
  assert.ok(tapStarts.length > 1 && tapStarts.length <= Math.ceil((200 * TEST_TICK_MS) / T.tapCooldownMs))
  tapStarts.slice(1).forEach((time, index) => assert.ok(time - tapStarts[index] >= T.tapCooldownMs))
  assert.ok(heartStarts.length > 1)
  heartStarts.slice(1).forEach((time, index) => assert.ok(time - heartStarts[index] >= T.chatHeartCooldownMs))
})

test("autonomous decisions are spaced: idle lasts at least the minimum and hops respect their cooldown", () => {
  const ticks = Math.ceil((30 * 60 * 1000) / TEST_TICK_MS)
  const ownerHome = (tick: number): RoomPetEvent[] =>
    tick === 1 ? [{ type: "ownerArrived", cell: { column: 0, row: 9 } }] : tick % 300 === 0 ? [{ type: "tap" }] : []
  const run = runTestRoomPet({ map: MAP, seed: 21, ticks, eventsAt: ownerHome, keepStates: true })
  const idleStarts = countEntries(run.outputs, "idle")
  idleStarts.forEach((start) => {
    const end = run.outputs.findIndex((output, index) => index > start && output.mode !== "idle")
    if (end === -1) return
    const interrupted = run.states.slice(start, end + 1).some((state) => state.lastInteractionMs > start * TEST_TICK_MS)
    if (!interrupted) assert.ok((end - start + 1) * TEST_TICK_MS >= T.idleMinMs, `idle at tick ${start} too short`)
  })
  const hops = countEntries(run.outputs, "hopOnto")
  assert.ok(hops.length > 0, "the pet uses furniture as a playground")
  hops.slice(1).forEach((start, index) => assert.ok((start - hops[index]) * TEST_TICK_MS >= T.hopCooldownMs))
})

test("an avatar stepping onto the pet makes it step aside the same tick, and paths go around avatars", () => {
  let state = createRoomPetState({ map: MAP, seed: 4, nowMs: 0, cell: { column: 2, row: 2 } })
  state = stepRoomPet(state, MAP, { nowMs: 100, events: [{ type: "visitorArrived", key: "v", cell: { column: 2, row: 2 } }] })
  assert.ok(!isSameRoomPetCell(state.cell, { column: 2, row: 2 }))
  assert.ok(isBeside(state.cell, { column: 2, row: 2 }))
  // a wall of visitors across row 1..8 at column 3 except row 9: the pet must route around
  const blockers: RoomPetEvent[] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((row) => ({
    type: "visitorMoved", key: `wall${row}`, cell: { column: 3, row }
  }))
  let walker = createRoomPetState({ map: MAP, seed: 4, nowMs: 0, cell: { column: 1, row: 0 } })
  walker = stepRoomPet(walker, MAP, { nowMs: 100, events: [...blockers, { type: "ownerArrived", cell: { column: 6, row: 0 } }] })
  const wall = new Set(blockers.map((event) => (event.type === "visitorMoved" ? roomPetCellKey(event.cell) : "")))
  for (let tick = 2; tick <= 60; tick += 1) {
    walker = stepRoomPet(walker, MAP, { nowMs: tick * TEST_TICK_MS })
    assert.ok(!wall.has(roomPetCellKey(walker.cell)))
  }
})

test("an avatar stepping onto the planned path makes the pet go around it", () => {
  let state = createRoomPetState({ map: MAP, seed: 4, nowMs: 0, cell: { column: 0, row: 0 } })
  state = stepRoomPet(state, MAP, { nowMs: 100, events: [{ type: "ownerArrived", cell: { column: 11, row: 0 } }] })
  assert.ok(state.path.length > 3)
  const blocker = state.path[2]
  state = stepRoomPet(state, MAP, { nowMs: 200, events: [{ type: "visitorMoved", key: "v", cell: blocker }] })
  for (let tick = 3; tick <= 60; tick += 1) {
    state = stepRoomPet(state, MAP, { nowMs: tick * TEST_TICK_MS })
    assert.ok(!isSameRoomPetCell(state.cell, blocker), `tick ${tick}: walked onto the avatar`)
  }
  assert.ok(isBeside(state.cell, { column: 11, row: 0 }), "still reached the owner")
})

test("the pet curls up beside the seated owner and gets up when the owner stands", () => {
  const seatCell = { column: 9, row: 3 }
  const run = runTestRoomPet({
    map: MAP, seed: 6, start: { column: 1, row: 1 }, ticks: 140,
    eventsAt: (tick) =>
      tick === 1 ? [{ type: "ownerArrived", cell: { column: 8, row: 6 } }]
        : tick === 40 ? [{ type: "ownerSat", cell: seatCell, seatFurnitureId: "bed_a" }]
          : tick === 130 ? [{ type: "ownerStood", cell: seatCell }]
            : []
  })
  const seated = run.outputs[125]
  assert.equal(seated.mode, "followSeat")
  assert.equal(seated.pose, "curl")
  assert.ok(isBeside(seated.cell, seatCell))
  assert.ok(getRoomPetNeighbours(MAP, seatCell).some((cell) => isSameRoomPetCell(cell, seated.cell)))
  assert.equal(run.outputs[130].mode, "idle")
})

test("tricks unlock with time together and a tap only ever makes the pet happy", () => {
  const taps = (tick: number): RoomPetEvent[] =>
    tick === 1 ? [{ type: "ownerArrived", cell: { column: 0, row: 0 } }] : tick % 20 === 0 ? [{ type: "tap" }] : []
  const fresh = runTestRoomPet({ map: MAP, seed: 9, ticks: 2000, eventsAt: taps })
  const bonded = runTestRoomPet({ map: MAP, seed: 9, ticks: 2000, eventsAt: taps, bondMs: ROOM_PET_TRICK_UNLOCKS[2].bondMs })
  const reactPoses = (outputs: readonly { mode: string; pose: string }[]): Set<string> =>
    new Set(outputs.filter((output) => output.mode === "react").map((output) => output.pose))
  assert.deepEqual([...reactPoses(fresh.outputs)], ["happy"])
  const learned = reactPoses(bonded.outputs)
  assert.ok(["trickRoll", "trickHop", "trickWave"].some((pose) => learned.has(pose)))
  for (const pose of learned) assert.ok(["happy", "trickRoll", "trickHop", "trickWave"].includes(pose))
})

test("bond time grows only while the owner is present", () => {
  let state = createRoomPetState({ map: MAP, seed: 1, nowMs: 0 })
  state = stepRoomPet(state, MAP, { nowMs: 1000 })
  assert.equal(state.bondMs, 0)
  state = stepRoomPet(state, MAP, { nowMs: 2000, events: [{ type: "ownerArrived", cell: { column: 0, row: 0 } }] })
  state = stepRoomPet(state, MAP, { nowMs: 5000 })
  assert.equal(state.bondMs, 3000)
  const output = getRoomPetOutput(state)
  assert.ok(isRoomPetCellWalkable(MAP, output.cell))
})

test("the seeded RNG is deterministic and in range", () => {
  let rng = 123
  for (let index = 0; index < 1000; index += 1) {
    const draw = drawRoomPetRandom(rng)
    assert.ok(draw.value >= 0 && draw.value < 1)
    rng = draw.rngState
  }
  assert.deepEqual(drawRoomPetRandom(5), drawRoomPetRandom(5))
})

test("the room pet flag is off unless set to 1", () => {
  assert.equal(isRoomPetEnabled(undefined), false)
  assert.equal(isRoomPetEnabled(""), false)
  assert.equal(isRoomPetEnabled("true"), false)
  assert.equal(isRoomPetEnabled(" 1 "), true)
})
