import assert from "node:assert/strict"
import test from "node:test"
import { createDiscoveryFirstFrameAssetWarmup } from "./discoveryFirstFrameAssetWarmup"

test("first-frame asset warmup shares one in-flight request and keeps a successful cache", async () => {
  let finish: ((result: boolean) => void) | undefined
  const requests: string[][] = []
  const warm = createDiscoveryFirstFrameAssetWarmup(
    ["background", "card"],
    (source) => `asset://${source}`,
    (uris) => {
      requests.push(uris)
      return new Promise<boolean>((resolve) => { finish = resolve })
    }
  )

  const first = warm()
  const second = warm()
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0], ["asset://background", "asset://card"])
  finish?.(true)
  assert.equal(await first, true)
  assert.equal(await second, true)
  assert.equal(await warm(), true)
  assert.equal(requests.length, 1)
})

test("failed or unresolved bundled assets never become a false warm-cache receipt", async () => {
  let requests = 0
  const warm = createDiscoveryFirstFrameAssetWarmup(
    ["background", "card"],
    (source) => `asset://${source}`,
    async () => { requests += 1; return requests > 1 }
  )
  assert.equal(await warm(), false)
  assert.equal(await warm(), true)
  assert.equal(requests, 2)

  const unavailable = createDiscoveryFirstFrameAssetWarmup(
    ["background", "card"],
    (source) => source === "card" ? undefined : `asset://${source}`,
    async () => { throw new Error("should not prefetch an incomplete set") }
  )
  assert.equal(await unavailable(), false)

  const brokenResolver = createDiscoveryFirstFrameAssetWarmup(
    ["background"],
    () => { throw new Error("asset resolution unavailable") },
    async () => { throw new Error("should not prefetch an unresolved asset") }
  )
  assert.equal(await brokenResolver(), false)
})
