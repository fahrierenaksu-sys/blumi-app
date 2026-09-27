import { z } from "zod"
import {
  normalizePhoneNumber,
  normalizeVerificationCode
} from "../auth/phone"

const normalizedPhoneNumberSchema = z
  .string()
  .transform((value) => normalizePhoneNumber(value)?.e164 ?? null)
  .refine((value): value is string => value !== null)

const normalizedVerificationCodeSchema = z
  .string()
  .transform((value) => normalizeVerificationCode(value))
  .refine((value): value is string => value !== null)

const authPhoneRequestSchema = z.object({
  phoneNumber: normalizedPhoneNumberSchema
})

const authVerificationRequestSchema = authPhoneRequestSchema.extend({
  verificationCode: normalizedVerificationCodeSchema
})

const registerAccountRequestSchema = authVerificationRequestSchema.extend({
  termsAcceptance: z.object({
    version: z.string().trim().min(1),
    locale: z.enum(["en", "tr"])
  })
})

const firebaseAuthRequestSchema = z.object({
  idToken: z.string().trim().min(1).max(12_000),
  authIntent: z.enum(["create", "sign-in"]),
  termsAcceptance: z.object({
    version: z.string().trim().min(1),
    locale: z.enum(["en", "tr"])
  }).optional()
})

export interface AuthPhoneRequest {
  phoneNumber: string
}

export interface AuthVerificationRequest extends AuthPhoneRequest {
  verificationCode: string
}

export interface RegisterAccountRequest extends AuthVerificationRequest {
  termsAcceptance: {
    version: string
    locale: "en" | "tr"
  }
}

export interface FirebaseAuthRequest {
  idToken: string
  authIntent: "create" | "sign-in"
  termsAcceptance?: {
    version: string
    locale: "en" | "tr"
  }
}

export function parseAuthPhoneRequest(
  input: unknown
): AuthPhoneRequest | null {
  const result = authPhoneRequestSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseAuthVerificationRequest(
  input: unknown
): AuthVerificationRequest | null {
  const result = authVerificationRequestSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseRegisterAccountRequest(
  input: unknown
): RegisterAccountRequest | null {
  const result = registerAccountRequestSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseFirebaseAuthRequest(
  input: unknown
): FirebaseAuthRequest | null {
  const result = firebaseAuthRequestSchema.safeParse(input)
  return result.success ? result.data : null
}
