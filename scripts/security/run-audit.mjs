import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { evaluateAuditRun } from "./audit-policy.mjs"

const policy = JSON.parse(readFileSync(new URL("./audit-policy.json", import.meta.url), "utf8"))
// npm audit cannot see patch-package fixes. Exercise the installed mitigations
// before evaluating the narrowly scoped, expiring advisory policy. A failed
// mitigation test blocks release even if its advisory has an exception.
execFileSync(process.execPath, ["--test",
  fileURLToPath(new URL("./node-forge-mitigation.test.mjs", import.meta.url)),
  fileURLToPath(new URL("./braces-mitigation.test.mjs", import.meta.url))
], {
  stdio: "inherit",
  timeout: 30_000
})
// spawnSync keeps the exit status and stdout together; evaluateAuditRun refuses
// npm error JSON, missing or malformed reports and abnormal exits.
const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: 120_000
})
const failures = evaluateAuditRun(audit, policy)
if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exit(1)
}
console.log("Production dependency audit passed with exact, unexpired exceptions only.")
