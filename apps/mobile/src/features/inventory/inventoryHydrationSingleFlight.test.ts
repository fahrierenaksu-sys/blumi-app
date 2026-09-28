import assert from "node:assert/strict"
import test from "node:test"
import { runInventoryHydrationSingleFlight, type InventoryHydrationFlight } from "./inventoryHydrationSingleFlight"

test("concurrent hydration for the same session shares one request", async () => {
  const slot: { current: InventoryHydrationFlight<number> | null } = { current: null }
  let requests = 0
  let resolveRequest: (value: number) => void = () => undefined
  const start = () => {
    requests += 1
    return new Promise<number>((resolve) => { resolveRequest = resolve })
  }

  const first = runInventoryHydrationSingleFlight(slot, "session-a", start)
  const second = runInventoryHydrationSingleFlight(slot, "session-a", start)
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(requests, 1)

  resolveRequest(7)
  assert.deepEqual(await Promise.all([first, second]), [7, 7])
  assert.equal(slot.current, null)
  assert.equal(await runInventoryHydrationSingleFlight(slot, "session-a", async () => 8), 8)
})

test("a previous session completion cannot clear a newer in-flight request", async () => {
  const slot: { current: InventoryHydrationFlight<number> | null } = { current: null }
  let resolveOld: (value: number) => void = () => undefined
  let resolveNew: (value: number) => void = () => undefined
  const old = runInventoryHydrationSingleFlight(slot, "session-old", () =>
    new Promise<number>((resolve) => { resolveOld = resolve }))
  const current = runInventoryHydrationSingleFlight(slot, "session-new", () =>
    new Promise<number>((resolve) => { resolveNew = resolve }))
  await Promise.resolve()

  resolveOld(1)
  assert.equal(await old, 1)
  assert.equal(slot.current?.token, "session-new")
  resolveNew(2)
  assert.equal(await current, 2)
  assert.equal(slot.current, null)
})

test("failed hydration clears the slot so retry remains possible", async () => {
  const slot: { current: InventoryHydrationFlight<number> | null } = { current: null }
  await assert.rejects(runInventoryHydrationSingleFlight(slot, "session-a", async () => {
    throw new Error("offline")
  }))
  assert.equal(slot.current, null)
  assert.equal(await runInventoryHydrationSingleFlight(slot, "session-a", async () => 1), 1)
})
