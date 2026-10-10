import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { isLocalQaPhoneAuthAllowed } from "./localQaPhoneAuth"

/**
 * The one place that reads the Simulator-QA environment. The values are read only inside the `__DEV__` branch, so a
 * release bundle (where Metro replaces `__DEV__` with false) drops the strings instead of inlining them, even when
 * a shell or `.env.local` carried the variables into a local Release build. `typeof` keeps node tests, which define
 * no `__DEV__`, off the QA path.
 */
const rawQaEnvironment = typeof __DEV__ !== "undefined" && __DEV__
  ? {
      flag: process.env.EXPO_PUBLIC_BLUMI_LOCAL_QA_AUTH,
      phones: process.env.EXPO_PUBLIC_BLUMI_LOCAL_QA_PHONES,
      code: process.env.EXPO_PUBLIC_BLUMI_LOCAL_QA_CODE
    }
  : undefined

/** Dev build + explicit flag + loopback API: the guard every local-QA behaviour (sign-in, editor tray) shares. */
export const IS_LOCAL_QA_ENVIRONMENT = isLocalQaPhoneAuthAllowed({
  isDevBuild: rawQaEnvironment !== undefined,
  flag: rawQaEnvironment?.flag,
  apiBaseUrl: MOBILE_HTTP_BASE_URL
})

export const LOCAL_QA_PHONE_LIST: string | undefined = IS_LOCAL_QA_ENVIRONMENT ? rawQaEnvironment?.phones : undefined
export const LOCAL_QA_CODE: string | undefined = IS_LOCAL_QA_ENVIRONMENT ? rawQaEnvironment?.code : undefined
