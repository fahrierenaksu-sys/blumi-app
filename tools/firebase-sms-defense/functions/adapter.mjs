/** The SDK, not a public JSON route, verifies the signed provider invocation. */
export function createBeforeSmsHandler(reserve) {
  return async (event) => {
    try {
      const result = await reserve({
        eventId: event.eventId,
        resource: event.resource?.name,
        timestamp: event.timestamp,
        smsType: event.smsType,
        phoneNumber: event.additionalUserInfo?.phoneNumber,
        ipAddress: event.ipAddress
      })
      // Never return ALLOW: it would override Google's fraud assessment.
      if (result.allowed !== true) return { recaptchaActionOverride: "BLOCK" }
      return {}
    } catch {
      // Outage, timeout, invalid configuration or missing schema: no SMS.
      // Do not log the event, provider exceptions, phone, IP or credentials.
      return { recaptchaActionOverride: "BLOCK" }
    }
  }
}
