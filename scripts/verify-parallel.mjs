#!/usr/bin/env node
// `npm run verify:fast`: the same checks as `npm run verify`, run as a small dependency graph.
//
// The check set is not copied here. It is derived by expanding the root `verify` script and every
// `npm run ...` it calls (also workspace scripts) into leaf commands, exactly like npm would run them
// one after another. `--list` prints both sides and fails if the fast plan is missing any leaf.
//
// What differs from `verify`, and nothing else:
//   * independent leaves run side by side (VERIFY_JOBS, default 3, the heavy.sh slot count);
//   * the package builds (tsc of contracts, domain, realtime-client) run once instead of four times;
//     leaves started afterwards get BLUMI_PACKAGES_PREBUILT=1 so the server and match-room runners
//     do not rebuild (and rm -rf) the dist folders other leaves are reading;
//   * a failed leaf stops new leaves from starting; running ones finish; the exit code is 1.
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_JOBS = 3
const cacheDirectory = join(root, "node_modules/.cache/verify-fast")
const timingsFile = join(cacheDirectory, "timings.json")

// Leaves that never read built packages or the mobile tree, so they may start before the build.
const INDEPENDENT_SCRIPTS = new Set([
  "verify:source-hygiene", "verify:operations-center", "verify:workbench-tools",
  "verify:avatar-rigs", "audit:release", "doctor"
])
// Leaves that write a temporary directory inside apps/mobile (the lint and tsc scans read that tree).
const MOBILE_TREE_WRITERS = new Set(["test:match-room", "test:avatar"])
const MOBILE_TREE_SCANNERS = new Set(["lint", "typecheck"])
const PACKAGE_BUILD_DIRECTORIES = new Set(["packages/contracts", "packages/domain", "packages/realtime-client"])
// First-run ordering hint only (longest first); real timings replace it from the second run on.
const SLOW_FIRST = ["test", "lint", "typecheck", "doctor", "audit:release", "verify:postgres", "test:navigation"]

function readScripts(directory) {
  return JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8")).scripts ?? {}
}
function workspaceDirectories() {
  const patterns = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces
  return patterns.flatMap((pattern) => {
    if (!pattern.endsWith("/*")) return [pattern]
    const base = pattern.slice(0, -2)
    return readdirSync(join(root, base), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${base}/${entry.name}`)
  })
}

function workspaceNameMap() {
  const names = new Map()
  for (const directory of workspaceDirectories()) {
    try {
      names.set(JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8")).name, directory)
    } catch { /* a folder without package.json is not a workspace */ }
  }
  return names
}

/** Expand `script` of `directory` into ordered leaf commands, like a serial `npm run` chain. */
function expand(directory, script, chain, names, out) {
  const body = readScripts(directory)[script]
  if (body === undefined) throw new Error(`Missing script ${script} in ${directory || "."}`)
  for (const segment of body.split("&&").map((part) => part.trim()).filter(Boolean)) {
    const target = parseNpmRun(segment, directory, names)
    if (!target) {
      out.push({ directory, script, command: segment, chain: [...chain, script] })
      continue
    }
    for (const { dir, name } of target) {
      if (Object.hasOwn(readScripts(dir), name)) expand(dir, name, [...chain, script], names, out)
    }
  }
}
function parseNpmRun(segment, directory, names) {
  let match = segment.match(/^npm run ([\w:.-]+)$/)
  if (match) return [{ dir: directory, name: match[1] }]
  match = segment.match(/^npm --workspace (\S+) run ([\w:.-]+)$/)
  if (match) {
    const dir = names.get(match[1])
    if (!dir) throw new Error(`Unknown workspace ${match[1]}`)
    return [{ dir, name: match[2] }]
  }
  match = segment.match(/^npm --workspaces --if-present run ([\w:.-]+)$/)
  if (match) return [...names.values()].map((dir) => ({ dir, name: match[1] }))
  return null
}

export function buildPlan() {
  const names = workspaceNameMap()
  const serial = []
  expand("", "verify", [], names, serial)
  const seenBuilds = new Set()
  const tasks = []
  let afterFirstBuild = false
  for (const leaf of serial) {
    const isPackageBuild = leaf.script === "build" && PACKAGE_BUILD_DIRECTORIES.has(leaf.directory)
    const key = `${leaf.directory}|${leaf.command}`
    if (isPackageBuild) {
      afterFirstBuild = true
      if (seenBuilds.has(key)) continue
      seenBuilds.add(key)
    }
    const independent = leaf.chain.some((name) => INDEPENDENT_SCRIPTS.has(name))
    tasks.push({
      ...leaf,
      key,
      id: `${leaf.directory || "root"}:${leaf.chain.slice(1).join(">")}${isPackageBuild ? "" : `#${tasks.length}`}`,
      isPackageBuild,
      needsBuild: !independent && !isPackageBuild,
      writesMobileTree: leaf.chain.some((name) => MOBILE_TREE_WRITERS.has(name)),
      scansMobileTree: leaf.chain.some((name) => MOBILE_TREE_SCANNERS.has(name)) &&
        (leaf.directory === "apps/mobile" || leaf.chain.includes("lint")),
      afterFirstBuild
    })
  }
  return { serial, tasks }
}

export function comparePlans({ serial, tasks }) {
  const planned = new Set(tasks.map((task) => task.key))
  const missing = serial.filter((leaf) => !planned.has(`${leaf.directory}|${leaf.command}`))
  const skippedRepeats = serial.length - tasks.length
  return { missing, skippedRepeats }
}

function readTimings() {
  try { return JSON.parse(readFileSync(timingsFile, "utf8")) } catch { return {} }
}
function weightOf(task, timings, index) {
  if (typeof timings[task.key] === "number") return timings[task.key]
  const hint = SLOW_FIRST.findIndex((name) => task.chain.includes(name))
  return hint === -1 ? 1000 - index : 100000 - hint * 1000 - index
}

function runTask(task, extraEnvironment) {
  const startedAt = Date.now()
  return new Promise((resolveTask) => {
    const directory = join(root, task.directory)
    const binPath = [join(directory, "node_modules/.bin"), join(root, "node_modules/.bin")]
    const command = process.argv.includes("--dry-run") ? "sleep 0.1" : task.command
    const child = spawn("sh", ["-c", command], {
      cwd: directory,
      env: { ...process.env, ...extraEnvironment, PATH: [...binPath, process.env.PATH].join(":") },
      stdio: ["ignore", "pipe", "pipe"]
    })
    const chunks = []
    child.stdout.on("data", (chunk) => chunks.push(chunk))
    child.stderr.on("data", (chunk) => chunks.push(chunk))
    child.on("error", (error) => {
      chunks.push(Buffer.from(`spawn failed: ${error.message}\n`))
      resolveTask({ task, code: 1, seconds: (Date.now() - startedAt) / 1000, output: Buffer.concat(chunks).toString() })
    })
    child.on("close", (code) => {
      resolveTask({ task, code: code ?? 1, seconds: (Date.now() - startedAt) / 1000, output: Buffer.concat(chunks).toString() })
    })
  })
}

function canStart(task, running, buildDone) {
  if (task.needsBuild && !buildDone) return false
  const active = [...running.keys()]
  if (task.isPackageBuild && active.some((other) => other.isPackageBuild)) return false
  if (task.writesMobileTree && active.some((other) => other.scansMobileTree)) return false
  if (task.scansMobileTree && active.some((other) => other.writesMobileTree)) return false
  return true
}

async function execute(plan, jobs) {
  const timings = readTimings()
  const pending = plan.tasks
    .map((task, index) => ({ task, weight: weightOf(task, timings, index) }))
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.task)
  const buildTasks = plan.tasks.filter((task) => task.isPackageBuild)
  const finished = []
  const running = new Map()
  let failed = false
  let builtCount = 0
  const nextTimings = { ...timings }
  mkdirSync(cacheDirectory, { recursive: true })
  const wallStart = Date.now()

  await new Promise((resolveAll) => {
    const launch = () => {
      while (!failed && running.size < jobs) {
        const index = pending.findIndex((task) => canStart(task, running, builtCount === buildTasks.length))
        if (index === -1) break
        const [task] = pending.splice(index, 1)
        const environment = task.isPackageBuild ? {} : { BLUMI_PACKAGES_PREBUILT: "1" }
        const promise = runTask(task, environment).then((result) => {
          running.delete(task)
          finished.push(result)
          if (result.code === 0) {
            nextTimings[task.key] = result.seconds
            if (task.isPackageBuild) builtCount += 1
            console.log(`ok   ${result.seconds.toFixed(1).padStart(6)}s  ${label(task)}`)
          } else {
            failed = true
            console.log(`FAIL ${result.seconds.toFixed(1).padStart(6)}s  ${label(task)} (exit ${result.code})`)
            console.log(result.output.split("\n").slice(-200).join("\n"))
          }
          if (running.size === 0 && (failed || pending.length === 0)) resolveAll()
          else launch()
        })
        running.set(task, promise)
      }
      if (running.size === 0 && (failed || pending.length === 0)) resolveAll()
    }
    launch()
  })

  writeFileSync(timingsFile, JSON.stringify(nextTimings, null, 1))
  const wall = (Date.now() - wallStart) / 1000
  const cpu = finished.reduce((sum, result) => sum + result.seconds, 0)
  console.log(`\n${finished.length} leaves ${failed ? "run, at least one FAILED" : "passed"}; wall ${wall.toFixed(1)}s, summed ${cpu.toFixed(1)}s, jobs ${jobs}`)
  if (failed) return 1
  if (pending.length > 0) throw new Error(`${pending.length} leaves never started (dependency deadlock)`)
  return 0
}

function label(task) {
  return `${task.directory || "root"} ${task.chain.slice(1).join(" > ")} :: ${task.command.slice(0, 90)}`
}

async function main() {
  const plan = buildPlan()
  const { missing, skippedRepeats } = comparePlans(plan)
  if (missing.length > 0) {
    console.error(`verify:fast is missing ${missing.length} leaves of verify:`)
    for (const leaf of missing) console.error(`  ${leaf.directory || "root"} :: ${leaf.command}`)
    return 1
  }
  if (process.argv.includes("--list")) {
    console.log(`verify (serial) leaves: ${plan.serial.length}`)
    for (const leaf of plan.serial) console.log(`S ${leaf.directory || "root"} :: ${leaf.command}`)
    console.log(`\nverify:fast leaves: ${plan.tasks.length} (${skippedRepeats} repeated package builds run once)`)
    for (const task of plan.tasks) console.log(`F ${task.directory || "root"} :: ${task.command}`)
    return 0
  }
  const jobs = Number(process.env.VERIFY_JOBS ?? DEFAULT_JOBS)
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error("VERIFY_JOBS must be a positive integer")
  console.log(`verify:fast: ${plan.tasks.length} leaves (${skippedRepeats} repeated package builds skipped), ${jobs} at a time`)
  return execute(plan, jobs)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => { console.error(error); process.exit(1) })
}
