import { resolveAccountRecoveryLocale } from "../accountRecoveryCopy"
import { getNativeAppLocale } from "../authLocale"
import { getSetupFlowCopy, type SetupFlowCopy } from "./setupFlowCopy"

/** Setup copy in the app language (native locale first, then Intl). */
export function getCurrentSetupFlowCopy(): SetupFlowCopy {
  return getSetupFlowCopy(resolveAccountRecoveryLocale(
    getNativeAppLocale(),
    Intl.DateTimeFormat().resolvedOptions().locale
  ))
}
