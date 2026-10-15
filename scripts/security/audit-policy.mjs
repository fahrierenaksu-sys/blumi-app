const SUPPORTED_REPORT_VERSION = 2

const advisoryId = (entry) => {
  const match = entry?.url?.match(/GHSA-[A-Za-z0-9-]+/)
  return match?.[0]
}

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const unusable = (detail) => [{ packageName: "(npm audit)", id: "(none)", reason: `audit report unusable: ${detail}` }]

export function evaluateAudit(vulnerabilities, policy, now = new Date()) {
  if (!isPlainObject(vulnerabilities)) return unusable("vulnerabilities is not an object")
  const failures = []
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    for (const via of vulnerability?.via ?? []) {
      // A string names another vulnerable package whose own entry is evaluated.
      if (typeof via === "string") continue
      const id = advisoryId(via)
      if (!id) {
        failures.push({ packageName, id: "(unknown)", reason: "advisory without a GHSA identifier" })
        continue
      }
      const allowed = policy.allowlist.find(
        (entry) => entry.id === id && entry.package === packageName
      )
      if (!allowed || new Date(`${allowed.expiresOn}T23:59:59Z`) < now) {
        failures.push({ packageName, id, reason: allowed ? "expired" : "not allowlisted" })
      }
    }
  }
  return failures
}

function parseReport(stdout) {
  if (typeof stdout !== "string" || stdout.trim() === "") return { error: "empty output" }
  try {
    return { report: JSON.parse(stdout) }
  } catch {
    return { error: "output is not valid JSON" }
  }
}

// Fail closed: npm audit exits 1 both when advisories exist and when the audit
// itself failed (network, registry, DNS), so only a well-formed v2 report with
// a vulnerabilities object may be evaluated against the policy.
export function evaluateAuditRun({ status, signal, stdout, error }, policy, now = new Date()) {
  if (error) return unusable(`npm audit could not run (${error.code ?? error.message})`)
  if (status === null || status === undefined) return unusable(`npm audit did not exit normally (${signal ?? "no status"})`)
  const parsed = parseReport(stdout)
  if (parsed.error) return unusable(parsed.error)
  const { report } = parsed
  if (!isPlainObject(report)) return unusable("output is not a JSON object")
  if (report.error) return unusable(`npm reported an error (${report.error.code ?? "unknown code"})`)
  if (report.auditReportVersion !== SUPPORTED_REPORT_VERSION) return unusable("unsupported auditReportVersion")
  if (!isPlainObject(report.vulnerabilities)) return unusable("vulnerabilities is not an object")
  if (status !== 0 && Object.keys(report.vulnerabilities).length === 0) {
    return unusable(`npm audit exited ${status} without reporting any vulnerability`)
  }
  return evaluateAudit(report.vulnerabilities, policy, now)
}
