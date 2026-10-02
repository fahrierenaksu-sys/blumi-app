import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"
import { installProcessLifecycle } from "./processLifecycle"

function harness(shutdown: () => Promise<void> = async () => {}) {
  const target = new EventEmitter()
  const reports: [string, string][] = []
  const exits: number[] = []
  let shutdowns = 0
  let resolveExit!: () => void
  const exited = new Promise<void>((resolve) => { resolveExit = resolve })
  const lifecycle = installProcessLifecycle({
    process: target,
    shutdown: () => { shutdowns += 1; return shutdown() },
    exit: (code) => { exits.push(code); resolveExit() },
    reportError: (message, errorKind) => { reports.push([message, errorKind]) }
  })
  return { target, reports, exits, exited, lifecycle, shutdowns: () => shutdowns }
}

test("SIGTERM drains through the graceful shutdown and exits 0", async () => {
  const { target, exits, exited, shutdowns } = harness()
  target.emit("SIGTERM")
  await exited
  assert.deepEqual(exits, [0])
  assert.equal(shutdowns(), 1)
})

test("an uncaught exception logs only its kind, drains and exits 1", async () => {
  const { target, reports, exits, exited, shutdowns } = harness()
  target.emit("uncaughtException", new TypeError("private body for +15550000000"), "uncaughtException")
  await exited
  assert.deepEqual(exits, [1])
  assert.equal(shutdowns(), 1)
  assert.deepEqual(reports, [["Blumi process fault", "uncaughtException:TypeError"]])
  assert.equal(JSON.stringify(reports).includes("private"), false)
})

test("an unhandled rejection with a provider error never logs its name or fields", async () => {
  const { target, reports, exits, exited } = harness()
  const providerError = Object.assign(new Error("duplicate key (phone)=(+15550000000)"), {
    name: "PostgresProviderError", detail: "user 42"
  })
  target.emit("unhandledRejection", providerError, Promise.resolve())
  target.emit("unhandledRejection", "plain string reason", Promise.resolve())
  await exited
  assert.deepEqual(exits, [1])
  assert.deepEqual(reports, [
    ["Blumi process fault", "unhandledRejection:ServiceError"],
    ["Blumi process fault", "unhandledRejection:NonError"]
  ])
})

test("a fault during a SIGTERM drain shares the drain and turns the exit code into 1", async () => {
  let release!: () => void
  const { target, exits, exited, shutdowns } = harness(() => new Promise((resolve) => { release = resolve }))
  target.emit("SIGTERM")
  target.emit("unhandledRejection", new Error("late"), Promise.resolve())
  // The shutdown starts on the next microtask, so a synchronous throw in it
  // still reaches the logged exit path.
  await new Promise((resolve) => setImmediate(resolve))
  release()
  await exited
  assert.deepEqual(exits, [1])
  assert.equal(shutdowns(), 1)
})

test("a failed shutdown is logged by kind and exits 1", async () => {
  const { target, reports, exits, exited } = harness(async () => {
    throw new AggregateError([new Error("pool")], "Service shutdown failed")
  })
  target.emit("SIGINT")
  await exited
  assert.deepEqual(exits, [1])
  assert.deepEqual(reports, [["Blumi shutdown failed", "AggregateError"]])
})

test("a shutdown that throws synchronously still logs and exits 1", async () => {
  const { target, reports, exits, exited } = harness(() => { throw new RangeError("sync") })
  target.emit("SIGTERM")
  await exited
  assert.deepEqual(exits, [1])
  assert.deepEqual(reports, [["Blumi shutdown failed", "RangeError"]])
})

test("a startup failure drains and exits 1 through the same path", async () => {
  const { reports, exits, exited, lifecycle } = harness()
  lifecycle.fail("startup", new Error("listen EADDRINUSE"))
  await exited
  assert.deepEqual(exits, [1])
  assert.deepEqual(reports, [["Blumi startup failed", "Error"]])
})

test("repeated signals while stopping are ignored: one drain, one exit, listeners stay installed", async () => {
  let release!: () => void
  const { target, exits, exited, shutdowns } = harness(() => new Promise((resolve) => { release = resolve }))
  target.emit("SIGTERM")
  // npm forwards SIGTERM and the platform signals the process group: node
  // sees it twice. The second copy must never reach Node's default handler.
  target.emit("SIGTERM")
  target.emit("SIGINT")
  assert.equal(target.listenerCount("SIGTERM"), 1)
  assert.equal(target.listenerCount("SIGINT"), 1)
  assert.equal(target.listenerCount("uncaughtException"), 1)
  assert.equal(target.listenerCount("unhandledRejection"), 1)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(shutdowns(), 1)
  assert.deepEqual(exits, [])
  release()
  await exited
  assert.deepEqual(exits, [0])
})

test("a shutdown that never settles is ended by the forced-exit backstop", async () => {
  const target = new EventEmitter()
  const exits: number[] = []
  const reports: [string, string][] = []
  let resolveExit!: () => void
  const exited = new Promise<void>((resolve) => { resolveExit = resolve })
  installProcessLifecycle({
    process: target,
    shutdown: () => new Promise(() => {}),
    exit: (code) => { exits.push(code); resolveExit() },
    reportError: (message, kind) => { reports.push([message, kind]) },
    forcedExitAfterMs: 20
  })
  // The backstop timer is unref'd (it never keeps a real process alive).
  const keepAlive = setInterval(() => {}, 1_000)
  try {
    target.emit("SIGTERM")
    target.emit("SIGTERM")
    await exited
  } finally {
    clearInterval(keepAlive)
  }
  assert.deepEqual(exits, [1])
  assert.deepEqual(reports, [["Blumi shutdown failed", "ForcedExitDeadline"]])
})
