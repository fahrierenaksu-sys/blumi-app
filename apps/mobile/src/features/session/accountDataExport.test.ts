import assert from "node:assert/strict"
import test from "node:test"
import { downloadAccountDataExport, shareAccountDataExportFile, type AccountExportSink } from "./accountDataExport"

function fileFixture() {
  const chunks: Uint8Array[] = []
  let closed = false
  let deleted = false
  const sink: AccountExportSink = { uri: "file:///cache/blumi-export.json",
    write: (chunk) => { assert.equal(closed, false); chunks.push(chunk) },
    close: () => { closed = true }, dispose: async () => { deleted = true } }
  return { sink, chunks, closed: () => closed, deleted: () => deleted }
}

test("export streams bytes to a real-file sink and shares attachment MIME before cleanup", async () => {
  const f = fileFixture()
  const json = '{"schemaVersion":"2026-07-21","account":{},"data":{}}\n'
  const file = await downloadAccountDataExport("https://api.test", "token", "confirmation", async (_url, init) => {
    assert.equal(init?.method, "POST")
    return new Response(json, { headers: { "content-type": "application/json", "x-blumi-export-format": "json-v1" } })
  }, undefined, () => f.sink)
  assert.equal(f.closed(), true)
  assert.equal(f.deleted(), false)
  let shared = false
  await shareAccountDataExportFile(file, { available: async () => true,
    share: async (uri, options) => {
      shared = true
      assert.equal(uri, f.sink.uri)
      assert.equal(options.mimeType, "application/json")
      assert.equal(f.deleted(), false)
    } })
  assert.equal(shared, true)
  assert.equal(f.deleted(), true)
})

test("partial download is removed and never returned for sharing", async () => {
  const f = fileFixture()
  await assert.rejects(downloadAccountDataExport("https://api.test", "token", "confirmation", async () =>
    new Response('{"data":{', { headers: { "content-type": "application/json", "x-blumi-export-format": "json-v1" } }),
  undefined, () => f.sink), /incomplete/i)
  assert.equal(f.deleted(), true)
})

test("120 second export budget bounds stalled body despite ignored cancellation", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const f = fileFixture()
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const result = downloadAccountDataExport("https://api.test", "token", "confirmation", async () => ({
    ok: true, headers: new Headers({ "content-type": "application/json", "x-blumi-export-format": "json-v1" }),
    body: { getReader: () => ({ read: () => { entered(); return new Promise(() => {}) }, cancel: async () => {} }) }
  } as unknown as Response), undefined, () => f.sink)
  const rejected = assert.rejects(result, { name: "TimeoutError" })
  await started
  context.mock.timers.tick(120_000)
  await rejected
  assert.equal(f.closed(), true)
  assert.equal(f.deleted(), true)
})

test("unauthorized and unsupported exports create no local file", async () => {
  for (const response of [new Response("denied", { status: 403 }), new Response("{}", { status: 200 })]) {
    await assert.rejects(downloadAccountDataExport("https://api.test", "token", "confirmation", async () => response,
      undefined, () => { assert.fail("unsafe response created a file") }))
  }
})

test("caller abort before and during download rejects and cleans the partial file", async () => {
  const controller = new AbortController()
  const f = fileFixture()
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const downloading = downloadAccountDataExport("https://api.test", "token", "confirmation", async () => ({
    ok: true, headers: new Headers({ "content-type": "application/json", "x-blumi-export-format": "json-v1" }),
    body: { getReader: () => ({ read: () => { entered(); return new Promise(() => {}) }, cancel: async () => {} }) }
  } as unknown as Response), controller.signal, () => f.sink)
  const rejected = assert.rejects(downloading, { name: "AbortError" })
  await started
  controller.abort()
  await rejected
  assert.equal(f.deleted(), true)
  await assert.rejects(downloadAccountDataExport("https://api.test", "token", "confirmation",
    async () => { assert.fail("pre-aborted request fetched") }, controller.signal, () => f.sink), { name: "AbortError" })
})

test("share rejection and unavailable sharing both dispose the completed export", async () => {
  for (const available of [true, false]) {
    const f = fileFixture()
    await assert.rejects(shareAccountDataExportFile(f.sink, {
      available: async () => available, share: async () => { throw new Error("sharing failed") }
    }))
    assert.equal(f.deleted(), true)
  }
})

test("completion delimiter spanning tiny chunks is handled without collecting the export", async () => {
  const f = fileFixture()
  const values = new TextEncoder().encode('{"data":{}}\n')
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset === values.length) controller.close()
    else controller.enqueue(values.slice(offset, ++offset))
  } })
  await downloadAccountDataExport("https://api.test", "token", "confirmation", async () => new Response(stream,
    { headers: { "content-type": "application/json", "x-blumi-export-format": "json-v1" } }), undefined, () => f.sink)
  assert.equal(f.chunks.length, values.length)
})

test("body transport failure after partial bytes deletes the file instead of returning it", async () => {
  const f = fileFixture()
  let first = true
  await assert.rejects(downloadAccountDataExport("https://api.test", "token", "confirmation", async () => ({
    ok: true, headers: new Headers({ "content-type": "application/json", "x-blumi-export-format": "json-v1" }),
    body: { getReader: () => ({ read: async () => {
      if (!first) throw new Error("connection interrupted")
      first = false
      return { done: false, value: new TextEncoder().encode('{"data":{') }
    }, cancel: async () => {} }) }
  } as unknown as Response), undefined, () => f.sink), /connection interrupted/)
  assert.equal(f.chunks.length, 1)
  assert.equal(f.deleted(), true)
})
