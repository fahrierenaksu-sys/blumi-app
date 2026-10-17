import assert from "node:assert/strict"
import test from "node:test"
import type { AuthRepository } from "../auth/authRepository"
import { createInMemoryPersonalRoomDecorRepository, type PersonalRoomDecorRepository } from "../rooms/personalRoomDecorRepository"
import { withStreetDigestSaves, type StreetSaveTransaction } from "./streetDigestSaves"
import { createInMemoryStreetRepository } from "./streetRepository"

const BED = { instanceId: "bed_1", itemId: "room_v3_bed_oyun_gingham", x: 1, y: 1, rotation: "front" as const }
const AT = "2026-10-17T09:00:00.000Z"

function arrange(room: PersonalRoomDecorRepository, isStreetReady = true) {
  const street = createInMemoryStreetRepository()
  let transactions = 0
  const runInTransaction: StreetSaveTransaction = async (work) => {
    transactions += 1
    return work({ authRepository: {} as AuthRepository, roomRepository: room, streetRepository: street })
  }
  const wrapped = withStreetDigestSaves({
    authRepository: {} as AuthRepository,
    roomRepository: room,
    runInTransaction,
    isStreetReady: async () => isStreetReady
  })
  return { street, wrapped, transactionCount: () => transactions }
}

const save = (expectedRevision: number, placedItems: typeof BED[]) =>
  ({ userId: "ece", expectedRevision, updatedAt: AT, decor: { roomShellId: "shell", placedItems } })

test("a room save that adds a bed writes the street record inside the save's transaction", async () => {
  const room = createInMemoryPersonalRoomDecorRepository()
  await room.save(save(0, []))
  const { street, wrapped, transactionCount } = arrange(room)

  const result = await wrapped.roomRepository.save(save(1, [BED]))

  assert.equal(result.kind, "saved")
  assert.equal(transactionCount(), 1)
  const record = (await street.readMany(["ece"])).get("ece")
  assert.equal(record?.roomKind, "bed")
  assert.equal(record?.roomChangedAt?.toISOString(), AT)
})

test("a failed room save writes no street change record", async () => {
  const room = createInMemoryPersonalRoomDecorRepository()
  await room.save(save(0, []))
  const { street, wrapped } = arrange(room)

  const conflict = await wrapped.roomRepository.save(save(7, [BED]))
  const failing = arrange({ ...room, save: async () => { throw new Error("write failed") } })
  await assert.rejects(failing.wrapped.roomRepository.save(save(1, [BED])), /write failed/)

  assert.equal(conflict.kind, "conflict")
  assert.equal((await street.readMany(["ece"])).size, 0)
  assert.equal((await failing.street.readMany(["ece"])).size, 0)
})

test("before migration 080 a room save runs alone, with no transaction and no record", async () => {
  const room = createInMemoryPersonalRoomDecorRepository()
  await room.save(save(0, []))
  const { street, wrapped, transactionCount } = arrange(room, false)

  assert.equal((await wrapped.roomRepository.save(save(1, [BED]))).kind, "saved")

  assert.equal(transactionCount(), 0)
  assert.equal((await street.readMany(["ece"])).size, 0)
})
