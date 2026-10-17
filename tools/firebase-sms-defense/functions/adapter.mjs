import { logSmsRefusal } from "./refusalLog.mjs"

/** The SDK, not a public JSON route, verifies the signed provider invocation. */
export function createBeforeSmsHandler(reserve, log = logSmsRefusal) {
  return async (event) => {
    try {
      const result = await reserve({
        eventId: event.eventId,
        resource: event.resource?.name,
        timestamp: event.timestamp,
        smsType: event.smsType,
        phoneNumber: event.additionalUserInfo?.phoneNumber,
        ipAddress: event.ipAddress,
        recaptchaScore: event.additionalUserInfo?.recaptchaScore
      })
      // Never return ALLOW: it would override Google's fraud assessment.
      if (result?.allowed !== true) {
        log("blumi_sms_send_refused", result?.reason)
        return { recaptchaActionOverride: "BLOCK" }
      }
      return {}
    } catch {
      // Outage, timeout, invalid configuration or missing schema: no SMS.
      // Do not log the event, provider exceptions, phone, IP or credentials.
      log("blumi_sms_send_refused", "unavailable")
      return { recaptchaActionOverride: "BLOCK" }
    }
  }
}
