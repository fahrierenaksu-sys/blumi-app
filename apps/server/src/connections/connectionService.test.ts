import assert from "node:assert/strict"
import test from "node:test"
import { createEconomyService } from "../economy/economyService"
import type { MiniRoomService } from "../miniRooms/miniRoomService"
import { createSafetyService } from "../safety/safetyService"
import {
  ConnectionDecisionUnavailableError,
  createConnectionService
} from "./connectionService"

const roomA = {
  findMiniRoom: async () => ({ miniRoomId: "room_a", participantUserIds: ["ada", "bora"] })
} as unknown as MiniRoomService

test("a durable room match is returned even if the reward ledger is unavailable", async () => {
  const failedKinds: string[] = []
  const economyService = createEconomyService()
  const service = createConnectionService({
    miniRoomService: {
      findMiniRoom: async () => ({
        miniRoomId: "room_a",
        participantUserIds: ["ada", "bora"]
      })
    } as unknown as MiniRoomService,
    safetyService: createSafetyService(),
    economyService: {
      ...economyService,
      grantEventReward: async () => { throw new Error("ledger unavailable") }
    },
    reportSideEffectFailure: (kind) => { failedKinds.push(kind) }
  })
  await service.decide("ada", { miniRoomId: "room_a", partnerUserId: "bora", status: "saved" })
  const result = await service.decide("bora", { miniRoomId: "room_a", partnerUserId: "ada", status: "saved" })
  assert.equal(result.match?.miniRoomId, "room_a")
  assert.equal((await service.repository.findMatch("room_a"))?.miniRoomId, "room_a")
  assert.deepEqual(failedKinds, ["reward"])
})

test("concurrent conflicting room decisions return the canonical first persisted choice", async () => {
  const service = createConnectionService({
    miniRoomService: roomA,
    safetyService: createSafetyService()
  })
  const [saved, passed] = await Promise.all([
    service.decide("ada", { miniRoomId: "room_a", partnerUserId: "bora", status: "saved" }),
    service.decide("ada", { miniRoomId: "room_a", partnerUserId: "bora", status: "passed" })
  ])
  assert.equal(saved.decision.status, passed.decision.status)
  assert.equal((await service.repository.findDecision("room_a", "ada"))?.status, saved.decision.status)
})

test("a blocked pair cannot record a room decision or complete a room match in either direction", async () => {
  const safetyService = createSafetyService()
  const service = createConnectionService({ miniRoomService: roomA, safetyService })
  const first = await service.decide("ada", { miniRoomId: "room_a", partnerUserId: "bora", status: "saved" })
  assert.equal(first.match, null)
  await safetyService.blockUser("ada", "bora")
  for (const [actor, partner] of [["bora", "ada"], ["ada", "bora"]] as const) {
    await assert.rejects(
      service.decide(actor, { miniRoomId: "room_a", partnerUserId: partner, status: "saved" }),
      ConnectionDecisionUnavailableError
    )
  }
  assert.equal(await service.repository.findDecision("room_a", "bora"), null)
  assert.equal(await service.repository.findMatch("room_a"), null)
})
