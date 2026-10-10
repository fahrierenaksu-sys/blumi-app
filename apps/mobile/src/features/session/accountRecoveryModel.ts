import { normalizeInternationalSmsPhone } from "./phoneNumberInput"

export interface AccountRecoveryPhoneValidation {
  normalizedOldPhoneNumber: string
  normalizedNewPhoneNumber: string
  errorMessage: string | null
}

export function normalizeRecoveryPhoneNumber(value: string): string {
  return normalizeInternationalSmsPhone(value) ?? ""
}

export function validateAccountRecoveryPhones(
  oldPhoneNumber: string,
  newPhoneNumber: string
): AccountRecoveryPhoneValidation {
  const normalizedOldPhoneNumber = normalizeRecoveryPhoneNumber(oldPhoneNumber)
  if (!normalizedOldPhoneNumber) {
    return {
      normalizedOldPhoneNumber: "",
      normalizedNewPhoneNumber: "",
      errorMessage: "Enter your previous phone number with country code."
    }
  }
  const normalizedNewPhoneNumber = normalizeRecoveryPhoneNumber(newPhoneNumber)
  if (!normalizedNewPhoneNumber) {
    return {
      normalizedOldPhoneNumber,
      normalizedNewPhoneNumber: "",
      errorMessage: "Enter your new phone number with country code."
    }
  }
  if (normalizedOldPhoneNumber === normalizedNewPhoneNumber) {
    return {
      normalizedOldPhoneNumber,
      normalizedNewPhoneNumber,
      errorMessage: "Use a different new phone number."
    }
  }
  return {
    normalizedOldPhoneNumber,
    normalizedNewPhoneNumber,
    errorMessage: null
  }
}
