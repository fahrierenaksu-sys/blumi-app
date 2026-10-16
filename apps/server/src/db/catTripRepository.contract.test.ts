import assert from "node:assert/strict"
import { createInMemoryCatTripRepository, type CatTripRepository, type NewCatTrip } from "../catTrips/catTripRepository"
import { createPostgresCatTripRepository } from "./postgresCatTripRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

type Backend = RepositoryContractBackend<CatTripRepository>

const DAY = "2026-10-16"
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 16, hour, minute)).toISOString()

function trip(backend: Backend, owner: string, host: string, slot: number, overrides: Partial<NewCatTrip> = {}): NewCatTrip {
  return {
    tripId: backend.id(`trip_${owner.slice(0, 5)}_${host.slice(0, 5)}_${slot}`),
    ownerUserId: owner,
    hostUserId: host,
    dayKey: DAY,
    slot,
    startsAt: at(8 + slot * 8),
    endsAt: at(12 + slot * 8),
    kind: "visit",
    seedDigest: "0123456789abcdef",
    candidateCount: 2,
    planVersion: 1,
    createdAt: at(7),
    ...overrides
  }
}

async function plan(backend: Backend, owner: string, trips: NewCatTrip[]) {
  return backend.repository.planDay({ ownerUserId: owner, dayKey: DAY, seedDigest: "0123456789abcdef", plannedAt: at(7), trips })
}

runRepositoryContract<CatTripRepository>({
  name: "cat trip repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryCatTripRepository(),
    postgres: (pool) => createPostgresCatTripRepository(pool)
  },
  cases: {
    "planDay stores a day once and a second plan changes nothing": async (backend) => {
      const [owner, host, other] = [backend.id("owner"), backend.id("host"), backend.id("other")]
      await backend.ensureUsers(owner, host, other)
      const first = trip(backend, owner, host, 0, { returnState: "petals" })
      assert.deepEqual(await plan(backend, owner, [first, trip(backend, owner, other, 1)]), { created: true })
      assert.deepEqual(await plan(backend, owner, [trip(backend, owner, other, 0)]), { created: false })

      const stored = await backend.repository.listOwnerTrips(owner, at(0))
      assert.deepEqual(stored.map((entry) => [entry.slot, entry.hostUserId]), [[0, host], [1, other]])
      assert.equal(stored[0]!.status, "scheduled")
      assert.equal(stored[0]!.returnState, "petals")
      assert.equal(stored[0]!.dayKey, DAY)
      assert.equal(stored[0]!.startsAt, first.startsAt)
      assert.equal(stored[1]!.returnState, undefined)
    },

    "a day with no destination is remembered, so the cat is not planned twice": async (backend) => {
      const owner = backend.id("owner")
      await backend.ensureUsers(owner)
      assert.deepEqual(await plan(backend, owner, []), { created: true })
      assert.deepEqual(await plan(backend, owner, []), { created: false })
      assert.deepEqual(await backend.repository.listOwnerTrips(owner, at(0)), [])
    },

    "listings filter by end time and by role": async (backend) => {
      const [owner, host] = [backend.id("owner"), backend.id("host")]
      await backend.ensureUsers(owner, host)
      await plan(backend, owner, [trip(backend, owner, host, 0), trip(backend, owner, host, 1)])
      assert.equal((await backend.repository.listOwnerTrips(owner, at(13))).length, 1)
      assert.equal((await backend.repository.listOwnerTrips(owner, at(0))).length, 2)
      assert.equal((await backend.repository.listHostTrips(host, at(0))).length, 2)
      assert.equal((await backend.repository.listHostTrips(owner, at(0))).length, 0)
      assert.equal((await backend.repository.listOwnerTrips(host, at(0))).length, 0)
    },

    "endTrip cancels once and keeps the first reason": async (backend) => {
      const [owner, host] = [backend.id("owner"), backend.id("host")]
      await backend.ensureUsers(owner, host)
      const planned = trip(backend, owner, host, 0)
      await plan(backend, owner, [planned])
      const first = await backend.repository.endTrip({ tripId: planned.tripId, endedAt: at(9), reason: "block" })
      assert.equal(first?.status, "cancelled")
      assert.equal(first?.endedAt, at(9))
      const second = await backend.repository.endTrip({ tripId: planned.tripId, endedAt: at(10), reason: "unmatch" })
      assert.equal(second?.endReason, "block")
      assert.equal(second?.endedAt, at(9))
      assert.equal(await backend.repository.endTrip({ tripId: backend.id("missing"), endedAt: at(9), reason: "block" }), null)
    },

    "endTripsBetween ends only that pair's unfinished trips, in either direction": async (backend) => {
      const [a, b, c] = [backend.id("a"), backend.id("b"), backend.id("c")]
      await backend.ensureUsers(a, b, c)
      const ab = trip(backend, a, b, 1)
      const ac = trip(backend, a, c, 0)
      await plan(backend, a, [ab, ac])
      const ba = trip(backend, b, a, 0)
      await plan(backend, b, [ba])
      // `ba` ends 12:00, so at 13:00 only `ab` (16:00-20:00) is unfinished.
      assert.equal(await backend.repository.endTripsBetween({ userAId: b, userBId: a, endedAt: at(13), reason: "unmatch" }), 1)
      assert.equal((await backend.repository.findTrip(ab.tripId))?.endReason, "unmatch")
      assert.equal((await backend.repository.findTrip(ba.tripId))?.status, "scheduled")
      assert.equal(await backend.repository.endTripsBetween({ userAId: a, userBId: b, endedAt: at(9), reason: "block" }), 1)
      assert.equal((await backend.repository.findTrip(ba.tripId))?.endReason, "block")
      assert.equal((await backend.repository.findTrip(ab.tripId))?.endReason, "unmatch", "first reason is kept")
      assert.equal((await backend.repository.findTrip(ac.tripId))?.status, "scheduled")
    },

    "markRevealed records each side once": async (backend) => {
      const [owner, host] = [backend.id("owner"), backend.id("host")]
      await backend.ensureUsers(owner, host)
      const planned = trip(backend, owner, host, 0)
      await plan(backend, owner, [planned])
      await backend.repository.markRevealed({ tripId: planned.tripId, role: "owner", at: at(13) })
      const again = await backend.repository.markRevealed({ tripId: planned.tripId, role: "owner", at: at(14) })
      assert.equal(again?.ownerRevealedAt, at(13))
      assert.equal(again?.hostRevealedAt, undefined)
      const both = await backend.repository.markRevealed({ tripId: planned.tripId, role: "host", at: at(15) })
      assert.equal(both?.hostRevealedAt, at(15))
      assert.equal(await backend.repository.markRevealed({ tripId: backend.id("missing"), role: "owner", at: at(13) }), null)
    },

    "reserveTeaser allows one per side and a per-user daily cap across roles": async (backend) => {
      const [owner, host] = [backend.id("owner"), backend.id("host")]
      await backend.ensureUsers(owner, host)
      const t0 = trip(backend, owner, host, 0)
      const t1 = trip(backend, owner, host, 1)
      await plan(backend, owner, [t0, t1])
      const window = { dayStart: at(0), dayEnd: new Date(Date.UTC(2026, 9, 17)).toISOString(), cap: 2 }
      assert.equal(await backend.repository.reserveTeaser({ tripId: t0.tripId, role: "owner", at: at(12, 10), ...window }), true)
      assert.equal(await backend.repository.reserveTeaser({ tripId: t0.tripId, role: "owner", at: at(12, 20), ...window }), false, "once per trip side")
      assert.equal(await backend.repository.reserveTeaser({ tripId: t1.tripId, role: "owner", at: at(20, 10), ...window }), true)
      // The owner already has two cat pushes today (as owner twice); a third, in any role, is refused.
      const t2 = trip(backend, host, owner, 0)
      await plan(backend, host, [t2])
      assert.equal(await backend.repository.reserveTeaser({ tripId: t2.tripId, role: "host", at: at(9), ...window }), false)
      assert.equal(await backend.repository.reserveTeaser({ tripId: t2.tripId, role: "owner", at: at(9), ...window }), true, "the host has no pushes yet")
      assert.equal(await backend.repository.reserveTeaser({ tripId: backend.id("missing"), role: "owner", at: at(9), ...window }), false)
      const stored = await backend.repository.findTrip(t0.tripId)
      assert.equal(stored?.ownerPushAt, at(12, 10))
    },

    "grantSouvenir is idempotent per trip and lists newest first": async (backend) => {
      const [owner, host] = [backend.id("owner"), backend.id("host")]
      await backend.ensureUsers(owner, host)
      const t0 = trip(backend, owner, host, 0)
      const t1 = trip(backend, owner, host, 1)
      await plan(backend, owner, [t0, t1])
      const first = await backend.repository.grantSouvenir({
        souvenirId: backend.id("sv0"), ownerUserId: owner, tripId: t0.tripId, key: "ribbon", rarity: "common", acquiredAt: at(12)
      })
      const repeat = await backend.repository.grantSouvenir({
        souvenirId: backend.id("sv0b"), ownerUserId: owner, tripId: t0.tripId, key: "bell", rarity: "rare", acquiredAt: at(13)
      })
      assert.deepEqual(repeat, first)
      await backend.repository.grantSouvenir({
        souvenirId: backend.id("sv1"), ownerUserId: owner, tripId: t1.tripId, key: "leaf", rarity: "uncommon", acquiredAt: at(20)
      })
      assert.deepEqual((await backend.repository.listSouvenirs(owner, 10)).map((entry) => entry.key), ["leaf", "ribbon"])
      assert.equal((await backend.repository.listSouvenirs(owner, 1)).length, 1)
      assert.deepEqual(await backend.repository.listSouvenirs(host, 10), [])
    },

    "purgeCreatedBefore removes old trips and their souvenirs": async (backend) => {
      const [owner, host] = [backend.id("owner"), backend.id("host")]
      await backend.ensureUsers(owner, host)
      const old = trip(backend, owner, host, 0, { createdAt: at(1) })
      const fresh = trip(backend, owner, host, 1, { createdAt: at(10) })
      await plan(backend, owner, [old, fresh])
      await backend.repository.grantSouvenir({
        souvenirId: backend.id("sv"), ownerUserId: owner, tripId: old.tripId, key: "ribbon", rarity: "common", acquiredAt: at(12)
      })
      const purged = await backend.repository.purgeCreatedBefore(at(5))
      assert.ok(purged >= 1)
      assert.equal(await backend.repository.findTrip(old.tripId), null)
      assert.ok(await backend.repository.findTrip(fresh.tripId))
      assert.deepEqual(await backend.repository.listSouvenirs(owner, 10), [])
    }
  }
})
