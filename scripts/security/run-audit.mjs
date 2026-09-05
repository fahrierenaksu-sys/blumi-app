import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { evaluateAudit } from "./audit-policy.mjs"

const policy = JSON.parse(readFileSync(new URL("./audit-policy.json", import.meta.url), "utf8"))
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
