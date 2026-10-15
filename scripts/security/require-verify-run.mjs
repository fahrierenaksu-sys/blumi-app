// Release gate: refuse to build unless the GitHub `Verify` workflow (the full
// `npm run verify`, including PostgreSQL, rig and Expo Doctor gates) succeeded
// for the exact commit being built. The EAS checks job cannot run the
// PostgreSQL gate itself (it needs a non-root user and PostgreSQL tools).
//
// Needs GITHUB_VERIFY_TOKEN: a read-only token (Actions: read) stored as an
// EAS environment secret. Without it the gate fails; it never passes silently.
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

export const VERIFY_WORKFLOW_PATH = ".github/workflows/verify.yml"
const DEFAULT_REPOSITORY = "fahrierenaksu-sys/blumi-app"
const SHA_PATTERN = /^[0-9a-f]{40}$/

export function findSuccessfulVerifyRun(runs, sha) {
  if (!Array.isArray(runs)) return null
  return runs.find((run) =>
    run?.head_sha === sha &&
    run?.path === VERIFY_WORKFLOW_PATH &&
    run?.status === "completed" &&
    run?.conclusion === "success"
  ) ?? null
}

export async function requireVerifyRun({ sha, repository, token, fetchImpl = fetch }) {
  if (!SHA_PATTERN.test(sha ?? "")) throw new Error("Release gate: the commit SHA is missing or malformed.")
  if (!token) throw new Error("Release gate: GITHUB_VERIFY_TOKEN is not set; cannot prove the full Verify run for this commit.")
  const url = `https://api.github.com/repos/${repository}/actions/runs?head_sha=${sha}&status=success&per_page=100`
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  })
  if (!response.ok) throw new Error(`Release gate: GitHub answered HTTP ${response.status} while looking up the Verify run.`)
  const body = await response.json()
  const run = findSuccessfulVerifyRun(body?.workflow_runs, sha)
  if (!run) throw new Error(`Release gate: no successful Verify run exists for commit ${sha.slice(0, 8)}. Run Verify on this exact commit first.`)
  return run
}

async function main() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  const run = await requireVerifyRun({
    sha,
    repository: process.env.GITHUB_VERIFY_REPOSITORY || DEFAULT_REPOSITORY,
    token: process.env.GITHUB_VERIFY_TOKEN,
  })
  console.log(`Release gate: Verify run ${run.id} succeeded for commit ${sha.slice(0, 8)}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
