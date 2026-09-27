import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { resolve } from "node:path"

const repository = resolve(import.meta.dirname, "../..")
const builder = resolve(repository, "tools/operations-center/build.mjs")
const server = resolve(repository, "tools/operations-center/serve.mjs")
const dashboard = resolve(repository, "tools/operations-center/dist/index.html")
const source = resolve(repository, "docs/release/LAUNCH_CONTROL.md")
const workflow = resolve(repository, "docs/release/RELEASE_CAPTAIN_WORKFLOW.md")

test("Operations Center stays aligned with the launch-control source", () => {
  const output = execFileSync(process.execPath, [builder], {
    cwd: repository,
    encoding: "utf8"
  })
  const html = readFileSync(dashboard, "utf8")
  const markdown = readFileSync(source, "utf8")
  const workflowText = readFileSync(workflow, "utf8")
  const payloadMatch = html.match(/<script type="application\/json" id="ops-data">([\s\S]*?)<\/script>/)

  assert.match(output, /Built Operations Center from \d+ launch areas/)
  assert.ok(payloadMatch, "generated dashboard must contain its embedded data")

  const payload = JSON.parse(payloadMatch[1])
  const table = markdown.split("## At a glance")[1]?.split("## Work in the right order")[0]
  const expectedRows = table?.split(/\r?\n/).filter((line) => /^\|/.test(line.trim())).length - 2
  const expectedWorktree = readExpectedWorktree()

  assert.equal(payload.snapshotDate, markdown.match(/^Snapshot:\s*(\d{4}-\d{2}-\d{2})/m)?.[1])
  assert.match(markdown, /\[reusable release-captain workflow\]\(\.\/RELEASE_CAPTAIN_WORKFLOW\.md\)/)
  assert.match(workflowText, /^## Her oturumda$/m)
  assert.match(workflowText, /^## Öncelik ve yayın kapıları$/m)
  assert.match(workflowText, /^## Durum ve kanıt kaydı$/m)
  assert.match(workflowText, /^## Her tur sonu devir$/m)
  assert.deepEqual(payload.worktree, expectedWorktree)
  assert.ok(Number.isFinite(Date.parse(payload.generatedAt)))
  assert.equal(payload.rows.length, expectedRows)
  assert.ok(payload.rows.length >= 10, "dashboard must cover cross-functional release areas")
  assert.ok(payload.rows.some((row) => row.area === "Apple hesabı / EAS / TestFlight"))
  assert.ok(payload.rows.some((row) => row.area === "Veritabanı / Supabase"))
  assert.ok(payload.rows.some((row) => row.area === "Kesintisiz izleme ve harcama"))
  assert.ok(payload.nextActionTitle)
  assert.ok(payload.nextAction)
})

test("Operations Center remains local, searchable, accessible, and responsive", () => {
  const html = readFileSync(dashboard, "utf8")
  const scripts = [...html.matchAll(/<script(?![^>]*\btype="application\/json")[^>]*>([\s\S]*?)<\/script>/g)]

  assert.match(html, /id="category-filters"/)
  assert.match(html, /id="status-filters"/)
  assert.match(html, /id="search"/)
  assert.match(html, /id="snapshot-branch"/)
  assert.match(html, /id="worktree-breakdown"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /@media \(max-width: 700px\)/)
  assert.match(html, /\.nav-icon \{ display: none; \}/)
  assert.match(html, /prefers-reduced-motion: reduce/)
  assert.match(html, /node\.textContent = text/)
  assert.equal(scripts.length, 1, "dashboard should use one self-contained application script")
  assert.doesNotMatch(scripts[0][1], /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/)
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
      const url = stdout.match(/Blumi Operasyon Merkezi: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1]
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
  const html = await response.text()
  assert.match(html, /Sistemin durumu, tek yerde\./)
  assert.match(html, /Panel oluşturuldu/)

  const unsupportedPath = await fetch(new URL("/.env", previewUrl))
  assert.equal(unsupportedPath.status, 404)
  const unsupportedMethod = await fetch(previewUrl, { method: "POST" })
  assert.equal(unsupportedMethod.status, 405)
  assert.equal(unsupportedMethod.headers.get("allow"), "GET, HEAD")

  assert.match(readFileSync(server, "utf8"), /server\.listen\(initialPort, "127\.0\.0\.1"\)/)
})

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
