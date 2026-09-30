import assert from "node:assert/strict"
import test from "node:test"
import { JSON_REQUEST_TIMEOUT_MS } from "./apiClient"

/**
 * Test-only contract shared by API modules built on `requestJson`: a stalled
 * transport and a stalled response body must both hit the whole-operation
 * deadline, abort the transport signal, and never retry.
 */
export interface BoundedRequestOperation {
  name: string
  run: (fetcher: typeof fetch) => Promise<unknown>
  timeoutMs?: number
  /** Matcher for the rejection; defaults to `{ name: "TimeoutError" }`. */
  rejection?: RegExp | Record<string, unknown> | ((error: unknown) => boolean)
}

export function registerBoundedRequestTests(
  operations: readonly BoundedRequestOperation[]
): void {
  for (const operation of operations) {
    const timeoutMs = operation.timeoutMs ?? JSON_REQUEST_TIMEOUT_MS
    const rejection = operation.rejection ?? { name: "TimeoutError" }

    test(`${operation.name} times out a stalled transport without retry`, async (context) => {
      context.mock.timers.enable({ apis: ["setTimeout"] })
      let calls = 0
      let transportSignal: AbortSignal | null | undefined
      let entered!: () => void
      const started = new Promise<void>((resolve) => { entered = resolve })
      const request = operation.run(async (_url, init) => {
        calls += 1
        transportSignal = init?.signal
        entered()
        return new Promise<Response>(() => {})
      })
      const rejected = assert.rejects(request, rejection)
      await started
      context.mock.timers.tick(timeoutMs - 1)
      assert.equal(transportSignal?.aborted, false)
      context.mock.timers.tick(1)
      await rejected
      assert.equal(transportSignal?.aborted, true)
      assert.equal(calls, 1)
    })

    test(`${operation.name} times out a stalled body without retry`, async (context) => {
      context.mock.timers.enable({ apis: ["setTimeout"] })
      let calls = 0
      let transportSignal: AbortSignal | null | undefined
      let entered!: () => void
      const started = new Promise<void>((resolve) => { entered = resolve })
      const request = operation.run(async (_url, init) => {
        calls += 1
        transportSignal = init?.signal
        return {
          ok: true,
          status: 200,
          json: () => { entered(); return new Promise<unknown>(() => {}) }
        } as Response
      })
      const rejected = assert.rejects(request, rejection)
      await started
      context.mock.timers.tick(timeoutMs)
      await rejected
      assert.equal(transportSignal?.aborted, true)
      assert.equal(calls, 1)
    })
  }
}
