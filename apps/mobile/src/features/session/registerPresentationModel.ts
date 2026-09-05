import type { AuthEntryCopy } from "./authEntryCopy"
import type {
  LocalPhoneError,
  PhoneCountryCode
} from "./registerFlowModel"

export function getLocalPhonePlaceholder(
  countryCode: PhoneCountryCode,
  genericPlaceholder: string
): string {
  if (countryCode === "TR") return "5XX XXX XX XX"
  if (countryCode === "US" || countryCode === "CA") return "(202) 555-0123"
  if (countryCode === "GB") return "7400 123456"
  return genericPlaceholder
}

export function getPhoneErrorMessage(
  error: LocalPhoneError | null,
  countryName: string,
  copy: AuthEntryCopy
): string {
  if (error === "tr-leading-zero") {
    return copy.trLeadingZeroError
  }
  if (error === "tr-mobile-prefix") {
    return copy.trStartsWithFiveError
  }
  return copy.invalidPhoneNumber(countryName)
}
