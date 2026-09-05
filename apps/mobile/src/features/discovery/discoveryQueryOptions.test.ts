import assert from "node:assert/strict"
import test from "node:test"
import {QueryClient} from "@tanstack/react-query"
import {DiscoveryRefreshLimitError,DiscoveryCursorResetError} from "./discoveryApi"
import {runDiscoveryRefresh} from "./discoveryRefreshModel"
import {getDiscoveryErrorMessageForDisplay} from "./discoveryErrorCopy"
import {
  buildDiscoveryPageQueryKey,
  buildDiscoveryWatchQueryKey,
  createDiscoveryPageQueryOptions,
  createDiscoveryWatchQueryOptions,
  flattenDiscoveryPages
} from "./discoveryQueryOptions"

const FILTERS = {
  ageMin: 23,
  ageMax: 31,
  genders: ["woman", "man"],
  vibes: ["Coffee dates", "Slow burn"]
} as const

test("manual refresh budget failure retains the current infinite deck and shows retry instead of resetting",async()=>{
  const client=new QueryClient()
  try {
    const options=createDiscoveryPageQueryOptions({baseHttpUrl:"https://api.test",userId:"viewer",sessionToken:"token",filters:FILTERS,
      fetcher:(async()=>new Response(JSON.stringify({code:"DISCOVERY_REFRESH_LIMIT",error:"Later",retryAfterSeconds:120}),{status:429})) as typeof fetch})
    const existing={pages:[{profiles:[{userId:"keep-me"}],page:{hasMore:true,nextCursor:"keep-cursor"}}],pageParams:[undefined]}
    client.setQueryData(options.queryKey,existing)
    await assert.rejects(runDiscoveryRefresh(async()=>{await client.fetchInfiniteQuery({...options,staleTime:0})}),
      (error:any)=>error instanceof DiscoveryRefreshLimitError && !(error instanceof DiscoveryCursorResetError))
    assert.deepEqual(client.getQueryData(options.queryKey),existing)
    assert.equal(options.retry(0,new DiscoveryRefreshLimitError(120)),false)
    assert.match(getDiscoveryErrorMessageForDisplay("refresh",new DiscoveryRefreshLimitError(120)),/2 minutes/)
  } finally {client.clear()}
})

test("discovery query keys scope data by user and filters without storing the session token", () => {
  const key = buildDiscoveryPageQueryKey({
    baseHttpUrl: "https://api.blumi.test",
    userId: "user-1",
    filters: FILTERS,
    cursor: undefined,
    sessionToken: "secret-token"
  })

  assert.deepEqual(key, [
    "discovery",
    "page",
    "https://api.blumi.test",
    "user-1",
    23,
    31,
    ["woman", "man"],
    ["Coffee dates", "Slow burn"],
    null
  ])
  assert.equal(JSON.stringify(key).includes("secret-token"), false)
})

test("watch query keys are scoped to the authenticated user", () => {
  assert.deepEqual(
    buildDiscoveryWatchQueryKey({
      baseHttpUrl: "https://api.blumi.test",
      userId: "user-1"
    }),
    ["discovery", "watch", "https://api.blumi.test", "user-1"]
  )
})

test("discovery pages flatten in server order and deduplicate appended profiles", () => {
  const first = {
    profiles: [
      { userId: "one" },
      { userId: "two" }
    ],
    page: { nextCursor: "cursor-2", hasMore: true },
    supply: { state: "healthy" as const, scope: "global" as const },
    quota: { remaining: 8 }
  }
  const second = {
    profiles: [
      { userId: "two" },
      { userId: "three" }
    ],
    page: { nextCursor: null, hasMore: false },
    supply: { state: "low" as const, scope: "global" as const },
    quota: { remaining: 7 }
  }

  assert.deepEqual(flattenDiscoveryPages([first, second]), [
    { userId: "one" },
    { userId: "two" },
    { userId: "three" }
  ])
})

test("page query options forward the cursor and expose only server-owned next pages", async () => {
  const calls: string[] = []
  const options = createDiscoveryPageQueryOptions({
    baseHttpUrl: "https://api.blumi.test",
    userId: "user-1",
    sessionToken: "session-token",
    filters: FILTERS,
    fetcher: (async (url: RequestInfo | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({
        profiles: [],
        page: { nextCursor: "cursor-3", hasMore: true },
        supply: { state: "healthy", scope: "global" },
        quota: {
          limit: 10,
          extensionDecisions: 0,
          used: 1,
          remaining: 9,
          resetsAt: "2026-07-23T00:00:00.000Z",
          rewardedAd: { available: false, extensionDecisions: 10 }
        }
      }), { status: 200 })
    }) as typeof fetch
  })

  const page = await options.queryFn({
    queryKey: options.queryKey,
    pageParam: "cursor-2",
    signal: new AbortController().signal
  } as never)

  assert.equal(calls[0], "https://api.blumi.test/v1/discover?ageMin=23&ageMax=31&gender=woman&gender=man&vibe=Coffee+dates&vibe=Slow+burn&limit=12&cursor=cursor-2")
  assert.equal(options.getNextPageParam(page), "cursor-3")
  assert.equal(options.getNextPageParam({ ...page, page: { nextCursor: null, hasMore: false } }), undefined)
})

test("watch query options use the shared authenticated transport boundary", async () => {
  const calls: string[] = []
  const options = createDiscoveryWatchQueryOptions({
    baseHttpUrl: "https://api.blumi.test",
    userId: "user-1",
    sessionToken: "session-token",
    fetcher: (async (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      calls.push(`${String(url)}:${headers?.authorization ?? ""}`)
      return new Response(JSON.stringify({ watch: null }), { status: 200 })
    }) as typeof fetch
  })

  assert.equal(
    await options.queryFn({ queryKey: options.queryKey, signal: new AbortController().signal } as never),
    null
  )
  assert.deepEqual(calls, ["https://api.blumi.test/v1/discover/watch:Bearer session-token"])
})
