import type { RoomPetCell, RoomPetEvent, RoomPetMap, RoomPetOutput, RoomPetState } from "./roomPet.types"
import { createRoomPetMap, roomPetCellKey } from "./roomPetGrid"
import { createRoomPetState, getRoomPetOutput, stepRoomPet } from "./roomPetEngine"

/**
 * Test room: 12 x 10 cells with a 2 x 2 table hole in the middle, a rug near
 * the front-left, a bed at the back-right and a sofa at the front-right.
 */
export const TEST_TABLE_CELLS: readonly RoomPetCell[] = [
  { column: 5, row: 4 },
  { column: 6, row: 4 },
  { column: 5, row: 5 },
  { column: 6, row: 5 }
]

export function createTestRoomPetMap(options: { readonly withSpots?: boolean } = {}): RoomPetMap {
  const table = new Set(TEST_TABLE_CELLS.map(roomPetCellKey))
  const cells: RoomPetCell[] = []
  for (let row = 0; row < 10; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      if (!table.has(roomPetCellKey({ column, row }))) cells.push({ column, row })
    }
  }
  const spots = options.withSpots === false
    ? []
    : [
        { id: "rug_a", kind: "rug" as const, cell: { column: 2, row: 7 } },
        { id: "bed_a", kind: "bed" as const, cell: { column: 9, row: 2 }, perchAnchor: { x: 0.7, y: 0.4 } },
        { id: "sofa_a", kind: "sofa" as const, cell: { column: 9, row: 8 }, perchAnchor: { x: 0.7, y: 0.8 } }
      ]
  return createRoomPetMap(cells, spots)
}

export const TEST_TICK_MS = 100

export interface TestRoomPetRun {
  readonly outputs: RoomPetOutput[]
  readonly states: RoomPetState[]
}

/** Runs `ticks` steps of TEST_TICK_MS from t = 0; `eventsAt` supplies each tick's events. */
export function runTestRoomPet(input: {
  readonly map: RoomPetMap
  readonly seed: number
  readonly ticks: number
  readonly start?: RoomPetCell
  readonly bondMs?: number
  readonly eventsAt?: (tick: number, state: RoomPetState) => readonly RoomPetEvent[]
  readonly keepStates?: boolean
}): TestRoomPetRun {
  let state = createRoomPetState({ map: input.map, seed: input.seed, nowMs: 0, cell: input.start, bondMs: input.bondMs })
  const outputs: RoomPetOutput[] = []
  const states: RoomPetState[] = []
  for (let tick = 1; tick <= input.ticks; tick += 1) {
    const events = input.eventsAt ? input.eventsAt(tick, state) : []
    state = stepRoomPet(state, input.map, { nowMs: tick * TEST_TICK_MS, events })
    outputs.push(getRoomPetOutput(state))
    if (input.keepStates) states.push(state)
  }
  return { outputs, states }
}
