import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryFilters } from "@blumi/contracts"
import {
  DEFAULT_DISCOVERY_FILTERS,
  DISCOVERY_MAXIMUM_AGE,
  DISCOVERY_MINIMUM_AGE,
  areDiscoveryFiltersReadyFor,
  clearLocalDiscoveryFiltersFallback,
  createDiscoveryFiltersHydrationGate,
  formatDiscoveryFiltersSummary,
  getLoadedLocalDiscoveryFiltersFallback,
  getLocalDiscoveryFiltersFallbackStorageKey,
  getDiscoveryFiltersStorageKey,
  loadLocalDiscoveryFiltersFallback,
  loadDiscoveryFilters,
  normalizeDiscoveryFilters,
  persistDiscoveryFilters,
  persistLocalDiscoveryFiltersFallback,
  resolveDiscoveryFiltersForFocus
} from "./discoveryFiltersModel"

test("discovery filters default to a broad honest audience", () => {
  assert.equal(DISCOVERY_MINIMUM_AGE, 18)
  assert.equal(DISCOVERY_MAXIMUM_AGE, 99)
  assert.deepEqual(DEFAULT_DISCOVERY_FILTERS, {
    ageMin: 18,
    ageMax: 99,
    genders: [],
    vibes: []
  })
})

test("persisted discovery filters are normalized without trusting stored JSON", () => {
  const normalized = normalizeDiscoveryFilters({
    ageMin: 23.8,
    ageMax: 200,
    genders: ["woman", "unknown", "woman", "non-binary"],
    vibes: [" Coffee dates ", "", "Slow burn", "Coffee dates"],
    intent: "Dating",
    scope: "Global"
  })

  assert.deepEqual(normalized, {
    ageMin: 23,
    ageMax: 99,
    genders: ["woman"],
    vibes: ["Coffee dates", "Slow burn"]
  })
})

test("legacy gender preferences do not reappear in the Woman and Man filter scope", () => {
  assert.deepEqual(
    normalizeDiscoveryFilters({
      ageMin: 24,
      ageMax: 35,
      genders: ["non-binary", "man"]
    }),
    {
      ageMin: 24,
      ageMax: 35,
      genders: ["man"],
      vibes: []
    }
  )
})

test("discovery filter persistence is isolated by user", () => {
  assert.equal(
    getDiscoveryFiltersStorageKey(" user/one "),
    "@blumi/discover_filters/user%2Fone"
  )
})

test("matching preference summary stays compact and product-readable", () => {
  assert.equal(
    formatDiscoveryFiltersSummary(DEFAULT_DISCOVERY_FILTERS, "tr"),
    "Herkes · Yaş 18–99"
  )
  assert.equal(
    formatDiscoveryFiltersSummary(DEFAULT_DISCOVERY_FILTERS),
    "Everyone · Ages 18–99"
  )
  assert.equal(
    formatDiscoveryFiltersSummary({
      ageMin: 24,
      ageMax: 35,
      genders: ["woman", "man"],
      vibes: ["Coffee dates"]
    }),
    "Women + Men · Ages 24–35"
  )
})

test("matching preferences persist account-scoped and load normalized", async () => {
  const values = new Map<string, string>()
  const storage = {
    async getItem(key: string) {
      return values.get(key) ?? null
    },
    async setItem(key: string, value: string) {
      values.set(key, value)
    }
  }

  const saved = await persistDiscoveryFilters(storage, " user/27 ", {
    ageMin: 35,
    ageMax: 24,
    genders: ["woman", "woman"],
    vibes: ["  Coffee   dates "]
  })
  assert.deepEqual(saved, {
    ageMin: 24,
    ageMax: 35,
    genders: ["woman"],
    vibes: ["Coffee dates"]
  })
  assert.deepEqual(await loadDiscoveryFilters(storage, " user/27 "), saved)

  values.set(getDiscoveryFiltersStorageKey("other"), "not-json")
  assert.deepEqual(
    await loadDiscoveryFilters(storage, "other"),
    DEFAULT_DISCOVERY_FILTERS
  )
})

test("a rejected account sync keeps the device-local filters authoritative on refocus", async () => {
  const values = new Map<string, string>()
  const storage = {
    async getItem(key: string) {
      return values.get(key) ?? null
    },
    async setItem(key: string, value: string) {
      values.set(key, value)
    },
    async removeItem(key: string) {
      values.delete(key)
    }
  }
  const accountFilters: DiscoveryFilters = {
    ageMin: 18,
    ageMax: 99,
    genders: [],
    vibes: []
  }
  const localFilters: DiscoveryFilters = {
    ageMin: 27,
    ageMax: 36,
    genders: ["woman"],
    vibes: ["Coffee dates"]
  }

  await persistLocalDiscoveryFiltersFallback(storage, "account-1", localFilters)
  const fallback = await loadLocalDiscoveryFiltersFallback(storage, "account-1")

  assert.deepEqual(
    resolveDiscoveryFiltersForFocus(accountFilters, fallback),
    localFilters
  )
  assert.equal(
    values.has(getLocalDiscoveryFiltersFallbackStorageKey("account-1")),
    true
  )
})

test("a successful account sync clears the device-local fallback", async () => {
  const values = new Map<string, string>()
  const storage = {
    async getItem(key: string) {
      return values.get(key) ?? null
    },
    async setItem(key: string, value: string) {
      values.set(key, value)
    },
    async removeItem(key: string) {
      values.delete(key)
    }
  }
  const localFilters: DiscoveryFilters = {
    ageMin: 24,
    ageMax: 32,
    genders: ["man"],
    vibes: []
  }

  await persistLocalDiscoveryFiltersFallback(storage, "account-1", localFilters)
  await clearLocalDiscoveryFiltersFallback(storage, "account-1")

  assert.equal(
    await loadLocalDiscoveryFiltersFallback(storage, "account-1"),
    null
  )
})

test("a preloaded local filter fallback is immediately available and never crosses accounts", async () => {
  const readers = new Map<string, (value: string | null) => void>()
  const reads: string[] = []
  const storage = {
    getItem(key: string): Promise<string | null> {
      reads.push(key)
      return new Promise((resolve) => readers.set(key, resolve))
    },
    async setItem() {},
    async removeItem() {}
  }
  const first = loadLocalDiscoveryFiltersFallback(storage, "account-1")
  const second = loadLocalDiscoveryFiltersFallback(storage, "account-1")
  assert.equal(reads.length, 1)
  assert.equal(getLoadedLocalDiscoveryFiltersFallback(storage, "account-1"), undefined)
  assert.equal(getLoadedLocalDiscoveryFiltersFallback(storage, "account-2"), undefined)

  readers.get(getLocalDiscoveryFiltersFallbackStorageKey("account-1"))?.(JSON.stringify({
    ageMin: 27,
    ageMax: 35,
    genders: ["woman"],
    vibes: []
  }))
  assert.deepEqual(await first, await second)
  assert.equal(reads.length, 1)
  assert.deepEqual(getLoadedLocalDiscoveryFiltersFallback(storage, "account-1"), {
    ageMin: 27,
    ageMax: 35,
    genders: ["woman"],
    vibes: []
  })
  assert.equal(getLoadedLocalDiscoveryFiltersFallback(storage, "account-2"), undefined)
})

test("local filter writes replace an in-flight read and failed reads can retry", async () => {
  let resolveRead: ((value: string | null) => void) | undefined
  let rejectRead: ((error: Error) => void) | undefined
  let readCount = 0
  const storage = {
    getItem(): Promise<string | null> {
      readCount += 1
      return new Promise((resolve, reject) => {
        resolveRead = resolve
        rejectRead = reject
      })
    },
    async setItem() {},
    async removeItem() {}
  }
  const staleRead = loadLocalDiscoveryFiltersFallback(storage, "account-1")
  const saved = await persistLocalDiscoveryFiltersFallback(storage, "account-1", {
    ageMin: 28,
    ageMax: 34,
    genders: ["man"],
    vibes: []
  })
  resolveRead?.(null)
  await staleRead
  assert.deepEqual(getLoadedLocalDiscoveryFiltersFallback(storage, "account-1"), saved)
  await clearLocalDiscoveryFiltersFallback(storage, "account-1")
  assert.equal(getLoadedLocalDiscoveryFiltersFallback(storage, "account-1"), null)

  const failed = loadLocalDiscoveryFiltersFallback(storage, "account-2")
  rejectRead?.(new Error("temporary storage failure"))
  assert.equal(await failed, null)
  assert.equal(getLoadedLocalDiscoveryFiltersFallback(storage, "account-2"), undefined)
  const retry = loadLocalDiscoveryFiltersFallback(storage, "account-2")
  assert.equal(readCount, 3)
  resolveRead?.(null)
  assert.equal(await retry, null)
})

test("filters are ready only for the account they were hydrated for", () => {
  assert.equal(areDiscoveryFiltersReadyFor(null, "account-1"), false)
  assert.equal(areDiscoveryFiltersReadyFor("account-1", "account-1"), true)
  assert.equal(areDiscoveryFiltersReadyFor("account-1", "account-2"), false)
})

test("a save supersedes loads that started before it", () => {
  const gate = createDiscoveryFiltersHydrationGate()
  const earlyLoad = gate.beginLoad()
  assert.equal(gate.canApply(earlyLoad), true)

  const save = gate.recordSave()
  assert.equal(gate.canApply(earlyLoad), false, "a late load must not overwrite the saved filters")
  assert.equal(gate.isLatestSave(save), true)

  const laterLoad = gate.beginLoad()
  assert.equal(gate.canApply(laterLoad), true)

  const nextSave = gate.recordSave()
  assert.equal(gate.isLatestSave(save), false, "an older save must not clear the newer fallback")
  assert.equal(gate.isLatestSave(nextSave), true)
  assert.equal(gate.canApply(laterLoad), false)
})

test("hydration gates are independent per hook instance", () => {
  const first = createDiscoveryFiltersHydrationGate()
  const second = createDiscoveryFiltersHydrationGate()
  const load = second.beginLoad()
  first.recordSave()
  assert.equal(second.canApply(load), true)
})
