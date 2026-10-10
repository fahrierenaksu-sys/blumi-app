import { defineSecret } from "firebase-functions/params"
export const smsHmacKey = defineSecret("BLUMI_SMS_DEFENSE_HMAC_KEY")
