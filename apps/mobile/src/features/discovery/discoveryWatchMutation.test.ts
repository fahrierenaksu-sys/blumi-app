import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryWatchRecord } from "@blumi/contracts"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { createDiscoveryWatchQueryOptions } from "./discoveryQueryOptions"
import { runDiscoveryWatchMutation } from "./discoveryWatchMutation"
import { JSON_REQUEST_TIMEOUT_MS } from "../network/apiClient"
import { activateDiscoveryWatch, cancelDiscoveryWatch } from "./discoveryApi"

const SCOPE = { baseHttpUrl: "https://api.test", userId: "viewer", sessionToken: "token" }
const WATCH: DiscoveryWatchRecord = {
  userId: SCOPE.userId,
  status: "active",
  preferences: { ageMin: 18, ageMax: 99, genders: [], vibes: [] },
  updatedAt: "2026-09-28T12:00:00.000Z",
  expiresAt: "2026-10-05T12:00:00.000Z"
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function runMutation(queryClient: QueryClient, action: "activate" | "cancel", fetcher: typeof fetch) {
  return runDiscoveryWatchMutation({ ...SCOPE, queryClient,
    mutation: () => action === "activate"
      ? activateDiscoveryWatch(SCOPE.baseHttpUrl, SCOPE.sessionToken, fetcher)
      : cancelDiscoveryWatch(SCOPE.baseHttpUrl, SCOPE.sessionToken, fetcher).then(() => null)
  })
}

for (const action of ["activate", "cancel"] as const) {
  test(`${action} aborts obsolete GETs before mutation and publication, scoped to one user`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const first = deferred<Response>()
    const during = deferred<Response>()
    const mutation = deferred<Response>()
    const mutationStarted = deferred<void>()
    const signals: (AbortSignal | null | undefined)[] = []
    let mutationCalls = 0
    let reads = 0
    let pending: Promise<void> | undefined
    const fetcher: typeof fetch = async (_url, init) => {
      if (init?.method) {
        mutationCalls += 1
        mutationStarted.resolve()
        return mutation.promise
      }
      signals.push(init?.signal)
      reads += 1
      return reads === 1 ? first.promise : during.promise
    }
    const options = createDiscoveryWatchQueryOptions({ ...SCOPE, fetcher })
    const other = createDiscoveryWatchQueryOptions({ ...SCOPE, userId: "other", fetcher })
    client.setQueryData(options.queryKey, action === "cancel" ? WATCH : null)
    client.setQueryData(other.queryKey, WATCH)
    try {
      const obsolete = client.fetchQuery({ ...options, staleTime: 0 }).catch(() => undefined)
      pending = runMutation(client, action, fetcher)
      await mutationStarted.promise
      assert.equal(signals[0]?.aborted, true, "old GET must be cancelled before the write")
      const overlapping = client.fetchQuery({ ...options, staleTime: 0 }).catch(() => undefined)
      mutation.resolve(action === "activate"
        ? new Response(JSON.stringify({ watch: WATCH }))
        : new Response(null, { status: 204 }))
      await pending
      assert.equal(signals[1]?.aborted, true, "GET started during the write must be cancelled before publication")
      const expected = action === "activate" ? WATCH : null
      assert.deepEqual(client.getQueryData(options.queryKey), expected)
      first.resolve(new Response(JSON.stringify({ watch: action === "activate" ? null : WATCH })))
      during.resolve(new Response(JSON.stringify({ watch: action === "activate" ? null : WATCH })))
      await Promise.all([obsolete, overlapping])
      assert.deepEqual(client.getQueryData(options.queryKey), expected)
      assert.equal(client.getQueryState(options.queryKey)?.isInvalidated, true)
      assert.equal(client.getQueryState(other.queryKey)?.isInvalidated, false)
      assert.deepEqual(client.getQueryData(other.queryKey), WATCH)
      assert.equal(mutationCalls, 1)
      // A later authoritative read can supersede the mutation acknowledgement.
      await client.fetchQuery(createDiscoveryWatchQueryOptions({ ...SCOPE,
        fetcher: async () => new Response(JSON.stringify({ watch: action === "activate" ? null : WATCH }))
      }))
      assert.deepEqual(client.getQueryData(options.queryKey), action === "activate" ? null : WATCH)
    } finally {
      first.resolve(new Response(JSON.stringify({ watch: null })))
      during.resolve(new Response(JSON.stringify({ watch: null })))
      mutation.resolve(action === "activate"
        ? new Response(JSON.stringify({ watch: WATCH }))
        : new Response(null, { status: 204 }))
      await pending?.catch(() => undefined)
      client.clear()
    }
  })
}

test("failed watch mutation preserves cached state, schedules reconciliation, and never retries the write", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const options = createDiscoveryWatchQueryOptions(SCOPE)
  client.setQueryData(options.queryKey, WATCH)
  let calls = 0
  try {
    await assert.rejects(runMutation(client, "cancel", async () => {
      calls += 1
      throw new Error("offline")
    }), /offline/)
    assert.equal(calls, 1)
    assert.deepEqual(client.getQueryData(options.queryKey), WATCH)
    assert.equal(client.getQueryState(options.queryKey)?.isInvalidated, true)
  } finally { client.clear() }
})

test("failed mutation cancels a GET started during the write even without cached watch data", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const started = deferred<void>()
  const mutation = deferred<Response>()
  const read = deferred<Response>()
  let signal: AbortSignal | null | undefined
  const fetcher: typeof fetch = async (_url, init) => {
    if (init?.method) { started.resolve(); return mutation.promise }
    signal = init?.signal
    return read.promise
  }
  const options = createDiscoveryWatchQueryOptions({ ...SCOPE, fetcher })
  const pending = runMutation(client, "activate", fetcher)
  const rejected = assert.rejects(pending, /Unavailable/)
  try {
    await started.promise
    const obsolete = client.fetchQuery(options).catch(() => undefined)
    mutation.resolve(new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }))
    await rejected
    assert.equal(signal?.aborted, true)
    read.resolve(new Response(JSON.stringify({ watch: WATCH })))
    await obsolete
    assert.equal(client.getQueryData(options.queryKey), undefined)
    assert.equal(client.getQueryState(options.queryKey)?.isInvalidated, true)
  } finally { client.clear() }
})

test("an active watch observer reconciles an unknown DELETE outcome through GET without replaying DELETE", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const reconciliation = deferred<Response>()
  const readStarted = deferred<void>()
  const methods: string[] = []
  const fetcher: typeof fetch = async (_url, init) => {
    methods.push(init?.method ?? "GET")
    if (init?.method === "DELETE") return new Promise<Response>(() => {})
    readStarted.resolve()
    return reconciliation.promise
  }
  const options = createDiscoveryWatchQueryOptions({ ...SCOPE, fetcher })
  client.setQueryData(options.queryKey, WATCH)
  const observer = new QueryObserver(client, options)
  const reconciled = deferred<void>()
  const unsubscribe = observer.subscribe((result) => {
    if (result.data === null && result.fetchStatus === "idle") reconciled.resolve()
  })
  try {
    const pending = runMutation(client, "cancel", fetcher)
    const rejected = assert.rejects(pending, { name: "TimeoutError" })
    // Allow exact-query cancellation to finish before advancing the HTTP deadline.
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
    context.mock.timers.tick(JSON_REQUEST_TIMEOUT_MS)
    await rejected
    await readStarted.promise
    assert.deepEqual(client.getQueryData(options.queryKey), WATCH, "unknown write outcome must not clear cache")
    reconciliation.resolve(new Response(JSON.stringify({ watch: null })))
    await reconciled.promise
    assert.equal(client.getQueryData(options.queryKey), null)
    assert.deepEqual(methods, ["DELETE", "GET"])
  } finally { unsubscribe(); client.clear() }
})
