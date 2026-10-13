/** How many hex characters of the git SHA /health shows (a short SHA; never a secret). */
export const DEPLOYED_COMMIT_LENGTH = 12

const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i

/**
 * The commit this server was built from, for checking which release is live. Railway sets
 * RAILWAY_GIT_COMMIT_SHA on GitHub deploys; BLUMI_BUILD_COMMIT_SHA covers other builds. Anything that is not a
 * plain git SHA reads as null, so /health never echoes arbitrary environment text.
 */
export function readDeployedCommit(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const raw = (env.RAILWAY_GIT_COMMIT_SHA || env.BLUMI_BUILD_COMMIT_SHA || "").trim()
  if (!GIT_SHA_PATTERN.test(raw)) return null
  return raw.slice(0, DEPLOYED_COMMIT_LENGTH).toLowerCase()
}
