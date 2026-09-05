import type { OtpPurpose } from "./authStore"

export interface SmsProvider {
  sendVerificationCode(input: {
    phoneNumber: string
    code: string
    expiresAt: string
    purpose?: OtpPurpose
  }): Promise<void> | void
}

export interface TwilioSmsProviderConfig {
  accountSid: string
  authToken: string
  fromPhoneNumber: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export function createDevelopmentSmsProvider(): SmsProvider {
  return {
    sendVerificationCode() {
      // Development provider intentionally does not expose OTP challenges.
      // Local QA sign-in remains controlled by the phone-aware code factory.
    }
  }
}

export function createTwilioSmsProvider(config: TwilioSmsProviderConfig): SmsProvider {
  const fetcher = config.fetcher ?? fetch
  const timeoutMs = config.timeoutMs ?? 10_000
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`
  const authorization = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
    "utf8"
  ).toString("base64")

  return {
    async sendVerificationCode(input) {
      const message = input.purpose === "account_deletion"
        ? "account deletion"
        : input.purpose === "account_data_export"
          ? "account data export"
          : input.purpose === "account_recovery"
            ? "account recovery"
          : input.purpose === "phone_change_current"
            ? "phone-number change"
            : input.purpose === "phone_change_new"
              ? "new phone-number verification"
              : "sign-in"
      const body = new URLSearchParams({
        To: input.phoneNumber,
        From: config.fromPhoneNumber,
        Body: `Your Blumi ${message} code is ${input.code}. It expires in 5 minutes.`
      })

      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          authorization: `Basic ${authorization}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        body,
        signal: AbortSignal.timeout(timeoutMs)
      })

      if (!response.ok) {
        throw new Error("SMS provider could not send the verification code.")
      }
    }
  }
}
