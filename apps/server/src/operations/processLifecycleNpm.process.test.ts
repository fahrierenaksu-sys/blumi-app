import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

/**
 * Production starts the API as `npm --workspace @blumi/server run start`
 * (Procfile, Railway). npm forwards SIGTERM to the child and the container
 * also signals the whole process group, so node receives SIGTERM more than
 * once. Every deploy logged `npm error signal SIGTERM` because the second
 * copy killed node mid-drain, before the database pool closed.
 */

const serverPackage = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
  scripts: Record<string, string>
}

test("the server start script execs node, so signals reach node and not an extra shell", () => {
  assert.match(serverPackage.scripts.start, /^exec node /)
})

test("npm run start: SIGTERM twice to the process group drains, closes data and exits 0", {
  timeout: 30_000,
  skip: process.platform === "win32" ? "process groups are POSIX" : false
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-npm-sigterm-"))
  const nodeModules = dirname(dirname(require.resolve("tsx/package.json")))
  symlinkSync(nodeModules, join(directory, "node_modules"), "dir")
  const lifecycle = require.resolve("./processLifecycle")
  const service = require.resolve("./serviceLifecycle")
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    name: "blumi-sigterm-fixture",
    private: true,
    // The same shape as apps/server's start script, with the tsx loader so
    // the source modules run without a build.
    scripts: { start: serverPackage.scripts.start.replace(/^exec node dist\/index\.js$/, "exec node --import tsx child.mjs") }
  }))
  writeFileSync(join(directory, "child.mjs"), `
    import { createServer } from "node:http"
    import { installProcessLifecycle } from ${JSON.stringify(lifecycle)}
    import { createGracefulShutdown } from ${JSON.stringify(service)}
    const server = createServer((_request, response) => response.end("ok"))
    const shutdown = createGracefulShutdown({
      markNotReady() { console.log("not-ready") },
      drain: [() => new Promise((done, fail) => server.close((error) => error ? fail(error) : done()))],
      async closeData() {
        // Long enough for the repeated SIGTERM to land mid-drain.
        await new Promise((done) => setTimeout(done, 400))
        console.log("data-closed")
      }
    })
    installProcessLifecycle({
      process,
      shutdown,
      exit: (code) => process.exit(code),
      reportError: (message, kind) => console.error(message, kind)
    })
    server.listen(0, "127.0.0.1", () => console.log("ready"))
  `)
  assert.match(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).scripts.start, /^exec node --import tsx child\.mjs$/)

  const npm = spawn("npm", ["run", "--silent", "start"], {
    cwd: directory,
    detached: true,
    env: { ...process.env, npm_config_update_notifier: "false" },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  npm.stdout.on("data", (chunk) => { stdout += String(chunk) })
  npm.stderr.on("data", (chunk) => { stderr += String(chunk) })
  try {
    await waitFor(() => stdout.includes("ready"), () => `no ready: ${stdout} ${stderr}`)
    process.kill(-npm.pid!, "SIGTERM")
    await waitFor(() => stdout.includes("not-ready"), () => `no drain: ${stdout} ${stderr}`)
    process.kill(-npm.pid!, "SIGTERM")
    const [code, signal] = await once(npm, "exit") as [number | null, NodeJS.Signals | null]
    assert.equal(signal, null, stderr)
    assert.equal(code, 0, stderr)
    assert.match(stdout, /data-closed/)
    assert.doesNotMatch(stderr, /signal SIGTERM/)
    assert.doesNotMatch(stderr, /shutdown failed/)
  } finally {
    if (npm.exitCode === null && npm.signalCode === null) {
      try { process.kill(-npm.pid!, "SIGKILL") } catch { /* already gone */ }
    }
    rmSync(directory, { recursive: true, force: true })
  }
})

async function waitFor(condition: () => boolean, describe: () => string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(describe())
    await new Promise((done) => setTimeout(done, 20))
  }
}
