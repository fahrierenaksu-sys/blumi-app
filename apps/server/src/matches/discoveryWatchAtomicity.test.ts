import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryMatchRepository, createInMemoryMatchStore, createSeedDiscoverProfiles } from "./matchRepository"
import { createMatchService } from "./matchService"
import { createNotificationService } from "../notifications/notificationService"
import { runDiscoveryWatchCycle } from "./discoveryWatchWorker"

const now = new Date("2026-09-05T10:00:00Z")
const preferences = { ageMin: 18, ageMax: 99, genders: ["woman" as const], vibes: [] }

async function fixture() {
  const seed = createSeedDiscoverProfiles()[0]!
  const match = createMatchService({ repository: createInMemoryMatchRepository(createInMemoryMatchStore([
    { ...seed, userId: "watcher", gender: "woman" }, { ...seed, userId: "candidate", gender: "woman" }
  ])) })
  let sends = 0
  const notifications = createNotificationService({ now: () => now,
    pushProvider: { sendPush: async () => { sends += 1 } } })
  await notifications.registerDevice("watcher", { platform: "ios", pushToken: "watch-device" })
  await match.activateDiscoveryWatch("watcher", preferences, now)
  return { match, notifications, sends: () => sends }
}

test("cancel between candidate scan and policy enqueue prevents any queued notification", async () => {
  const f = await fixture()
  const queued = await runDiscoveryWatchCycle({ matchService: f.match,
    safetyService: { hasBlockBetween: async () => false }, now,
    notificationService: { sendPushToUser: async (...args) => {
      await f.match.cancelDiscoveryWatch("watcher")
      return f.notifications.sendPushToUser(...args)
    } }
  })
  assert.equal(queued, 0)
  assert.equal((await f.notifications.repository.listPendingDeliveries()).length, 0)
})

test("cancel after enqueue invalidates undispatched generation, including an already claimed row", async () => {
  const f = await fixture()
  await runDiscoveryWatchCycle({ matchService: f.match, notificationService: f.notifications,
    safetyService: { hasBlockBetween: async () => false }, now })
  const original = f.notifications.repository.claimDueDeliveries.bind(f.notifications.repository)
  f.notifications.repository.claimDueDeliveries = async (input) => {
    const deliveries = await original(input)
    await f.match.cancelDiscoveryWatch("watcher")
    return deliveries
  }
  await f.notifications.dispatchDue(now)
  assert.equal(f.sends(), 0)
})

test("watch generation and dedupe identity survive worker lease expiry/reclaim", async () => {
  const f = await fixture()
  const first = await f.match.claimNextDiscoveryWatch(now)
  const next = await f.match.claimNextDiscoveryWatch(new Date(now.getTime() + 61_000))
  assert.ok(first && next)
  assert.ok(first.generation)
  assert.equal(first.generation, next.generation)
  assert.notEqual(first.claimToken, next.claimToken)
})

test("committed enqueue survives lost acknowledgement without reactivation or duplicate policy charge", async () => {
  const f = await fixture()
  await assert.rejects(runDiscoveryWatchCycle({ matchService: f.match,
    safetyService: { hasBlockBetween: async () => false }, now,
    notificationService: { sendPushToUser: async (...args) => {
      await f.notifications.sendPushToUser(...args)
      throw new Error("lost acknowledgement")
    } }
  }), /lost acknowledgement/)
  assert.equal(await f.match.claimNextDiscoveryWatch(new Date(now.getTime() + 61_000)), null)
  assert.equal((await f.notifications.repository.listPendingDeliveries()).length, 1)
  assert.equal((await f.notifications.repository.listPolicyAudits()).filter((event) => event.reason === "queued").length, 1)
})

test("changing filters invalidates queued generation and authorizes a fresh request", async () => {
  const f = await fixture()
  await runDiscoveryWatchCycle({ matchService: f.match, notificationService: f.notifications,
    safetyService: { hasBlockBetween: async () => false }, now })
  const [old] = await f.notifications.repository.listPendingDeliveries()
  await f.match.activateDiscoveryWatch("watcher", { ...preferences, ageMin: 20 }, now)
  assert.equal((await f.notifications.repository.listPendingDeliveries()).length, 0)
  const fresh = await f.match.claimNextDiscoveryWatch(now)
  assert.ok(fresh)
  assert.notEqual(fresh.generation, old.discoveryWatch?.generation)
  assert.equal((await f.notifications.sendPushToUser("watcher", {
    title: "Blumi", body: "New candidates", data: { type: "discovery.watch_match" }
  }, fresh)).outcome, "queued")
})

test("memory cancellation and registration changes wait for admitted provider work then invalidate retries", async () => {
  const f = await fixture()
  await runDiscoveryWatchCycle({ matchService: f.match, notificationService: f.notifications,
    safetyService: { hasBlockBetween: async () => false }, now })
  const [delivery] = await f.notifications.repository.claimDueDeliveries({ now, limit: 10, leaseMs: 60_000 })
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  const sending = f.notifications.repository.withAuthorizedDelivery(delivery, now, async () => { entered(); await pending })
  await started
  let cancelled = false
  const cancel = f.match.cancelDiscoveryWatch("watcher").then(() => { cancelled = true })
  let changed = false
  const change = f.notifications.registerDevice("new-account", { platform: "ios", pushToken: "watch-device" }).then(() => { changed = true })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(cancelled, false)
  assert.equal(changed, false)
  release()
  assert.equal((await sending).authorized, true)
  await Promise.all([cancel, change])
  assert.equal((await f.notifications.repository.listPendingDeliveries()).length, 0)
  assert.equal((await f.notifications.repository.withAuthorizedDelivery(delivery, now, async () => assert.fail("stale retry"))).authorized, false)
})
