const advisoryId = (entry) => {
  const match = entry?.url?.match(/GHSA-[A-Za-z0-9-]+/)
  return match?.[0]
}

export function evaluateAudit(vulnerabilities, policy, now = new Date()) {
  const failures = []
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === "string") continue
      const id = advisoryId(via)
      if (!id) continue
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
