/**
 * Native UI tests need a clean session at the beginning of an installed test
 * run, but an app relaunch inside that same test must retain the demo actor so
 * account-scoped room persistence can be verified.
 */
export function shouldResetNativeUiTestSession(
  clearedMarker: string | null
): boolean {
  return clearedMarker !== "true"
}

export function shouldIgnoreNativeUiSessionResetError(
  error: unknown
): boolean {
  if (!error || typeof error !== "object") return false
  return "code" in error && error.code === "secure_session_storage_unavailable"
}
