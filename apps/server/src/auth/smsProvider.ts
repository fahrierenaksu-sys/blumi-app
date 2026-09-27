import type { OtpPurpose } from "./authStore"

/**
 * Legacy test seam for the server-owned OTP repository.
 * Real phone verification is handled by Firebase Phone Auth on the client;
 * this provider intentionally never sends SMS.
 */
export interface SmsProvider {
  sendVerificationCode(input: {
    phoneNumber: string
    code: string
    expiresAt: string
    purpose?: OtpPurpose
  }): Promise<void> | void
}

export function createDevelopmentSmsProvider(): SmsProvider {
  return {
    sendVerificationCode() {
      // Firebase is the only production phone-verification provider.
    }
  }
}
