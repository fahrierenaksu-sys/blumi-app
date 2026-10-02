import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { connect } from "node:net"
import { networkInterfaces } from "node:os"
import test from "node:test"
import { resolve } from "node:path"

const repository = resolve(import.meta.dirname, "../..")
const builder = resolve(repository, "tools/operations-center/build.mjs")
const server = resolve(repository, "tools/operations-center/serve.mjs")
const dashboard = resolve(repository, "tools/operations-center/dist/index.html")
const source = resolve(repository, "docs/release/LAUNCH_CONTROL.md")

test("Operations Center stays aligned with the launch-control source", () => {
  const output = execFileSync(process.execPath, [builder], {
    cwd: repository,
    encoding: "utf8"
  })
  const html = readFileSync(dashboard, "utf8")
  const markdown = readFileSync(source, "utf8")
  const payloadMatch = html.match(/<script type="application\/json" id="ops-data">([\s\S]*?)<\/script>/)

  assert.match(output, /Built Operations Center from \d+ launch areas/)
  assert.ok(payloadMatch, "generated dashboard must contain its embedded data")

  const payload = JSON.parse(payloadMatch[1])
  const table = markdown.split("## At a glance")[1]?.split("## Work in the right order")[0]
  const expectedRows = table?.split(/\r?\n/).filter((line) => /^\|/.test(line.trim())).length - 2
  const expectedWorktree = readExpectedWorktree()

  assert.equal(payload.snapshotDate, markdown.match(/^Snapshot:\s*(\d{4}-\d{2}-\d{2})/m)?.[1])
  assert.deepEqual(payload.worktree, expectedWorktree)
  assert.ok(Number.isFinite(Date.parse(payload.generatedAt)))
  assert.equal(payload.rows.length, expectedRows)
  assert.ok(payload.nextActionTitle)
  assert.ok(payload.nextAction)
})

test("Operations Center page stays offline, injection-safe and free of secret files", () => {
  const html = readFileSync(dashboard, "utf8")
  const scripts = [...html.matchAll(/<script(?![^>]*\btype="application\/json")[^>]*>([\s\S]*?)<\/script>/g)]

  assert.ok(scripts.length > 0, "dashboard needs its application script")
  for (const [, code] of scripts) {
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/)
    // Ledger text is untrusted; it must reach the DOM as text, never as HTML.
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/)
  }
  assert.doesNotMatch(html, /GoogleService-Info\.plist|google-services\.json|\.env\.local/)
})

test("Operations Center serves only its local dashboard with read-only security headers", async (t) => {
  execFileSync(process.execPath, [builder], { cwd: repository, stdio: "ignore" })

  const child = spawn(process.execPath, [server], {
    cwd: repository,
    env: { ...process.env, BLUMI_OPS_CENTER_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })

  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise((resolveExit) => child.once("exit", resolveExit))
    child.kill("SIGTERM")
    await exited
  })

  const previewUrl = await new Promise((resolveUrl, rejectUrl) => {
    let stdout = ""
    const timeout = setTimeout(() => rejectUrl(new Error(`Preview server did not start. ${stderr}`)), 5000)
    timeout.unref()
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      const url = stdout.match(/(http:\/\/127\.0\.0\.1:\d+\/)/)?.[1]
      if (!url) return
      clearTimeout(timeout)
      resolveUrl(url)
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      rejectUrl(error)
    })
    child.once("exit", (code) => {
      clearTimeout(timeout)
      rejectUrl(new Error(`Preview server exited with code ${code}. ${stderr}`))
    })
  })

  const response = await fetch(previewUrl)
  assert.equal(response.status, 200)
  assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'none'/)
  assert.equal(response.headers.get("x-content-type-options"), "nosniff")
  assert.match(await response.text(), /id="ops-data"/)

  const unsupportedPath = await fetch(new URL("/.env", previewUrl))
  assert.equal(unsupportedPath.status, 404)
  const unsupportedMethod = await fetch(previewUrl, { method: "POST" })
  assert.equal(unsupportedMethod.status, 405)
  assert.equal(unsupportedMethod.headers.get("allow"), "GET, HEAD")

  // Loopback only: the same port must refuse connections on every
  // non-loopback address of this machine.
  const port = Number(new URL(previewUrl).port)
  const externalHosts = Object.values(networkInterfaces()).flat()
    .filter((entry) => entry && !entry.internal && entry.family === "IPv4")
    .map((entry) => entry.address)
  for (const host of externalHosts) {
    assert.equal(await canConnect(host, port), false, "dashboard must not listen beyond loopback")
  }
})

function canConnect(host, port) {
  return new Promise((resolveConnect) => {
    const socket = connect({ host, port })
    const finish = (result) => { socket.destroy(); resolveConnect(result) }
    socket.setTimeout(1000, () => finish(false))
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
  })
}

function readExpectedWorktree() {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: repository,
    encoding: "utf8"
  }).trim() || "detached HEAD"
  const entries = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"], {
    cwd: repository,
    encoding: "utf8"
  }).split("\0").filter(Boolean)
  const counts = { branch, modified: 0, deleted: 0, untracked: 0 }

  for (let index = 0; index < entries.length; index += 1) {
    const status = entries[index].slice(0, 2)
    if (status === "??") counts.untracked += 1
    else if (status.includes("D")) counts.deleted += 1
    else counts.modified += 1

    if (status.includes("R") || status.includes("C")) index += 1
  }

  return { ...counts, total: counts.modified + counts.deleted + counts.untracked }
}
