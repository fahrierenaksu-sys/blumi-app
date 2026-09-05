import { countries, getEmojiFlag } from "countries-list"
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode
} from "libphonenumber-js"

export type RegisterFlowStage = "phone" | "code"

export type PhoneCountryCode = CountryCode

export interface PhoneCountryOption {
  countryCode: PhoneCountryCode
  name: string
  nativeName: string
  callingCode: string
  flag: string
}

export type LocalPhoneError =
  | "required"
  | "tr-leading-zero"
  | "tr-mobile-prefix"
  | "invalid-number"

export interface LocalPhoneAnalysis {
  formatted: string
  normalizedPhoneNumber: string
  valid: boolean
  error: LocalPhoneError | null
}

export interface RegisterFlowState {
  stage: RegisterFlowStage
  selectedCountry: PhoneCountryCode
  phoneNumber: string
  verificationCode: string
}

export interface RegisterFlowAvailability {
  normalizedPhoneNumber: string
  phoneValid: boolean
  verificationCodeValid: boolean
  canRequestCode: boolean
  canVerify: boolean
}

const PHONE_COUNTRY_OPTIONS = createPhoneCountryOptions()

export function createInitialRegisterFlow(
  selectedCountry: PhoneCountryCode = "TR"
): RegisterFlowState {
  return {
    stage: "phone",
    selectedCountry,
    phoneNumber: "",
    verificationCode: ""
  }
}

export function getPhoneCountryOptions(): readonly PhoneCountryOption[] {
  return PHONE_COUNTRY_OPTIONS
}

export function filterPhoneCountryOptions(
  options: readonly PhoneCountryOption[],
  query: string
): readonly PhoneCountryOption[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return [...options]
  return options.filter((option) => {
    const searchable = [
      option.name,
      option.nativeName,
      option.countryCode,
      option.callingCode
    ].map(normalizeSearchText)
    return searchable.some((value) => value.includes(normalizedQuery))
  })
}

export function updateRegisterCountry(
  state: RegisterFlowState,
  selectedCountry: PhoneCountryCode
): RegisterFlowState {
  if (state.selectedCountry === selectedCountry) return state
  return {
    ...state,
    stage: "phone",
    selectedCountry,
    phoneNumber: "",
    verificationCode: ""
  }
}

export function updateRegisterPhone(
  state: RegisterFlowState,
  phoneNumber: string
): RegisterFlowState {
  return {
    ...state,
    stage: "phone",
    phoneNumber: formatLocalPhoneNumber(phoneNumber, state.selectedCountry),
    verificationCode: ""
  }
}

export function updateRegisterCode(
  state: RegisterFlowState,
  verificationCode: string
): RegisterFlowState {
  return {
    ...state,
    verificationCode: verificationCode.replace(/[^0-9]/g, "").slice(0, 6)
  }
}

export function advanceRegisterFlowToCode(
  state: RegisterFlowState
): RegisterFlowState {
  if (!getRegisterFlowAvailability(state, false).canRequestCode) return state
  return {
    ...state,
    stage: "code",
    verificationCode: ""
  }
}

export function returnRegisterFlowToPhone(
  state: RegisterFlowState
): RegisterFlowState {
  return {
    ...state,
    stage: "phone",
    verificationCode: ""
  }
}

export function getRegisterFlowAvailability(
  state: RegisterFlowState,
  isSubmitting: boolean
): RegisterFlowAvailability {
  const phone = analyzeLocalPhoneNumber(
    state.phoneNumber,
    state.selectedCountry
  )
  const normalizedPhoneNumber = phone.normalizedPhoneNumber
  const phoneValid = phone.valid
  const verificationCodeValid = /^\d{6}$/.test(state.verificationCode)
  return {
    normalizedPhoneNumber,
    phoneValid,
    verificationCodeValid,
    canRequestCode: phoneValid && !isSubmitting,
    canVerify:
      state.stage === "code" &&
      phoneValid &&
      verificationCodeValid &&
      !isSubmitting
  }
}

export function formatLocalPhoneNumber(
  value: string,
  countryCode: PhoneCountryCode
): string {
  const trimmed = value.trim()
  if (trimmed.startsWith("+")) {
    const international = parsePhoneNumberFromString(trimmed)
    if (international?.country === countryCode) {
      const national = international.formatNational()
      return countryCode === "TR" ? national.replace(/^0/, "") : national
    }
  }
  const digits = getLocalDigits(value, countryCode)
  if (!digits) return ""
  return new AsYouType(countryCode).input(digits)
}

export function analyzeLocalPhoneNumber(
  value: string,
  countryCode: PhoneCountryCode
): LocalPhoneAnalysis {
  const rawDigits = value.replace(/[^\d]/g, "")
  const digits = getLocalDigits(value, countryCode)
  const formatted = formatLocalPhoneNumber(value, countryCode)
  if (!digits) {
    return {
      formatted,
      normalizedPhoneNumber: "",
      valid: false,
      error: "required"
    }
  }
  if (countryCode === "TR" && rawDigits.startsWith("0")) {
    return {
      formatted,
      normalizedPhoneNumber: "",
      valid: false,
      error: "tr-leading-zero"
    }
  }
  if (countryCode === "TR" && !digits.startsWith("5")) {
    return {
      formatted,
      normalizedPhoneNumber: "",
      valid: false,
      error: "tr-mobile-prefix"
    }
  }

  const parsed = parsePhoneNumberFromString(digits, countryCode)
  const valid = Boolean(
    parsed?.isValid() &&
    (!parsed.country || parsed.country === countryCode)
  )
  return {
    formatted,
    normalizedPhoneNumber: valid ? parsed?.number ?? "" : "",
    valid,
    error: valid ? null : "invalid-number"
  }
}

export function normalizePhoneNumber(
  value: string,
  countryCode: PhoneCountryCode = "TR"
): string {
  return analyzeLocalPhoneNumber(value, countryCode).normalizedPhoneNumber
}

export function maskPhoneNumber(normalizedPhoneNumber: string): string {
  if (normalizedPhoneNumber.length <= 7) return normalizedPhoneNumber
  const internationalPrefix = normalizedPhoneNumber.startsWith("+") ? "+" : ""
  return `${internationalPrefix}••• •• ${normalizedPhoneNumber.slice(-4)}`
}

function createPhoneCountryOptions(): readonly PhoneCountryOption[] {
  const options = getCountries().map((countryCode) => {
    const country = countries[countryCode]
    const name = countryCode === "TR" ? "Türkiye" : country?.name ?? countryCode
    const nativeName = countryCode === "TR"
      ? "Türkiye"
      : country?.native ?? name
    return {
      countryCode,
      name,
      nativeName,
      callingCode: `+${getCountryCallingCode(countryCode)}`,
      flag: getEmojiFlag(countryCode)
    }
  })
  return options.reduce<PhoneCountryOption[]>((sorted, option) => {
    const insertionIndex = sorted.findIndex(
      (candidate) => comparePhoneCountries(option, candidate) < 0
    )
    return insertionIndex < 0
      ? [...sorted, option]
      : [
          ...sorted.slice(0, insertionIndex),
          option,
          ...sorted.slice(insertionIndex)
        ]
  }, [])
}

function comparePhoneCountries(
  left: PhoneCountryOption,
  right: PhoneCountryOption
): number {
  if (left.countryCode === right.countryCode) return 0
  if (left.countryCode === "TR") return -1
  if (right.countryCode === "TR") return 1
  return left.name.localeCompare(right.name, "en")
}

function getLocalDigits(
  value: string,
  countryCode: PhoneCountryCode
): string {
  const trimmed = value.trim()
  const digits = trimmed.replace(/[^\d]/g, "")
  if (!trimmed.startsWith("+")) return digits
  const callingCode = getCountryCallingCode(countryCode)
  return digits.startsWith(callingCode)
    ? digits.slice(callingCode.length)
    : digits
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en")
}
