import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(directory, "../..")
const sourcePath = resolve(repository, "docs/release/LAUNCH_CONTROL.md")
const templatePath = resolve(directory, "template.html")
const outputDirectory = resolve(directory, "dist")
const markdown = await readFile(sourcePath, "utf8")
const template = await readFile(templatePath, "utf8")
const worktree = readWorktree()

const snapshotDate = markdown.match(/^Snapshot:\s*(\d{4}-\d{2}-\d{2})/m)?.[1]
if (!snapshotDate) throw new Error("Launch-control snapshot date is missing.")

const tableSection = markdown.split("## At a glance")[1]?.split("## Work in the right order")[0]
if (!tableSection) throw new Error("Launch-control status table was not found.")

const tableLines = tableSection.split(/\r?\n/).filter((line) => /^\|/.test(line.trim()))
const headers = parseRow(tableLines[0] ?? "")
const requiredHeaders = ["Category", "Area", "Status", "What that means", "Owner", "Next action", "Evidence"]
if (headers.join("|") !== requiredHeaders.join("|")) {
  throw new Error("Launch-control table columns changed; update the Operations Center parser before building.")
}

const rows = tableLines.slice(2).map((line) => {
  const [category, area, status, meaning, owner, nextAction, evidence] = parseRow(line)
  if (![category, area, status, meaning, owner, nextAction, evidence].every(Boolean)) {
    throw new Error(`Incomplete launch-control row: ${line}`)
  }
  return { category, area, status, meaning, owner, nextAction, evidence }
})
if (rows.length < 10) throw new Error("Operations Center needs the cross-functional status rows from the launch control.")

const immediateAction = markdown.split("## Immediate next action")[1]?.split(/^## /m)[0]?.trim()
const actionText = cleanMarkdown(immediateAction?.split(/\r?\n\s*\r?\n/)[0] ?? "")
const actionTitle = actionText.match(/^([^.;:]+)[.;:]?/)?.[1]?.trim() ?? ""
if (!actionText || !actionTitle) throw new Error("The immediate next user action is missing.")

const payload = {
  snapshotDate,
  generatedAt: new Date().toISOString(),
  worktree,
  nextActionTitle: actionTitle,
  nextAction: actionText,
  rows
}
const safeJson = JSON.stringify(payload).replaceAll("<", "\\u003c")
if (!template.includes("__OPS_DATA__")) throw new Error("Operations Center data placeholder was not found.")

await mkdir(outputDirectory, { recursive: true })
await writeFile(resolve(outputDirectory, "index.html"), template.replace("__OPS_DATA__", safeJson))
process.stdout.write(`Built Operations Center from ${rows.length} launch areas (snapshot ${snapshotDate}; ${worktree.branch}, ${worktree.total} worktree changes).\n`)

function readWorktree() {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: repository,
    encoding: "utf8"
  }).trim() || "detached HEAD"
  const output = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"], {
    cwd: repository,
    encoding: "utf8"
  })
  const entries = output.split("\0").filter(Boolean)
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

function parseRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cleanMarkdown(cell.trim()))
}

function cleanMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim()
}
