import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { evaluateAudit } from "./audit-policy.mjs"

const policy = JSON.parse(readFileSync(new URL("./audit-policy.json", import.meta.url), "utf8"))
// npm audit cannot see patch-package fixes. The temporary forge exception is
// valid only after the installed dependency rejects the malicious structures.
execFileSync(process.execPath, ["--test", fileURLToPath(new URL("./node-forge-mitigation.test.mjs", import.meta.url))], {
  stdio: "inherit",
  timeout: 30_000
})
let report
try {
  report = JSON.parse(execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8" }))
} catch (error) {
  report = JSON.parse(error.stdout)
}
const failures = evaluateAudit(report.vulnerabilities, policy)
if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exit(1)
}
console.log("Production dependency audit passed with exact, unexpired exceptions only.")
