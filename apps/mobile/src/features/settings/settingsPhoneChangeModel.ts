import type { PhoneCountryCode } from "../session/registerFlowModel"
import type { SettingsCopy } from "./settingsCopy"
import { sanitizeVerificationCode } from "./settingsPresentationModel"

export type PhoneChangeStep = "current_code" | "new_number" | "new_code"

/** Form state for the three-step Settings phone change modal. */
export interface PhoneChangeFormState {
  visible: boolean
  step: PhoneChangeStep
  currentCode: string
  newCountry: PhoneCountryCode
  newNumber: string
  newCode: string
  currentConfirmationToken: string
}

export type PhoneChangeFormAction =
  | { type: "reset" }
  | { type: "opened" }
  | { type: "codeEntered"; value: string }
  | { type: "countrySelected"; country: PhoneCountryCode }
  | { type: "numberChanged"; formattedNumber: string }
  | { type: "currentPhoneVerified"; confirmationToken: string }
  | { type: "newPhoneCodeSent" }

export const INITIAL_PHONE_CHANGE_FORM_STATE: PhoneChangeFormState = {
  visible: false,
  step: "current_code",
  currentCode: "",
  newCountry: "TR",
  newNumber: "",
  newCode: "",
  currentConfirmationToken: ""
}

export function phoneChangeFormReducer(
  state: PhoneChangeFormState,
  action: PhoneChangeFormAction
): PhoneChangeFormState {
  switch (action.type) {
    case "reset":
      return INITIAL_PHONE_CHANGE_FORM_STATE
    case "opened":
      return { ...INITIAL_PHONE_CHANGE_FORM_STATE, visible: true }
    case "codeEntered": {
      const sanitized = sanitizeVerificationCode(action.value)
      return state.step === "current_code"
        ? { ...state, currentCode: sanitized }
        : { ...state, newCode: sanitized }
    }
    case "countrySelected":
      return { ...state, newCountry: action.country, newNumber: "" }
    case "numberChanged":
      return { ...state, newNumber: action.formattedNumber }
    case "currentPhoneVerified":
      return {
        ...state,
        currentConfirmationToken: action.confirmationToken,
        step: "new_number",
        currentCode: ""
      }
    case "newPhoneCodeSent":
      return { ...state, step: "new_code", newCode: "" }
  }
}

type PhoneChangeStepCopy = Pick<
  SettingsCopy,
  | "currentPhoneTitle"
  | "newPhoneTitle"
  | "verifyNewPhoneTitle"
  | "currentPhoneBody"
  | "newPhoneBody"
  | "verifyNewPhoneBody"
  | "currentPhoneCode"
  | "newPhoneCode"
  | "verifyCurrentCode"
  | "sendCodeToNewPhone"
  | "finishPhoneChange"
  | "finishing"
  | "checking"
  | "sendCode"
  | "finish"
  | "continue"
>

export interface PhoneChangeStepPresentation {
  title: string
  body: string
  codeInputAccessibilityLabel: string
  primaryAccessibilityLabel: string
  primaryText: string
}

export function getPhoneChangeStepPresentation(
  step: PhoneChangeStep,
  isChangingPhone: boolean,
  copy: PhoneChangeStepCopy
): PhoneChangeStepPresentation {
  return {
    title: step === "current_code"
      ? copy.currentPhoneTitle
      : step === "new_number"
        ? copy.newPhoneTitle
        : copy.verifyNewPhoneTitle,
    body: step === "current_code"
      ? copy.currentPhoneBody
      : step === "new_number"
        ? copy.newPhoneBody
        : copy.verifyNewPhoneBody,
    codeInputAccessibilityLabel: step === "current_code" ? copy.currentPhoneCode : copy.newPhoneCode,
    primaryAccessibilityLabel: step === "current_code"
      ? copy.verifyCurrentCode
      : step === "new_number"
        ? copy.sendCodeToNewPhone
        : copy.finishPhoneChange,
    primaryText: isChangingPhone
      ? step === "new_code"
        ? copy.finishing
        : copy.checking
      : step === "new_number"
        ? copy.sendCode
        : step === "new_code"
          ? copy.finish
          : copy.continue
  }
}

export function isPhoneChangePrimaryDisabled(input: {
  step: PhoneChangeStep
  isChangingPhone: boolean
  currentCode: string
  newCode: string
  newPhoneValid: boolean
}): boolean {
  return (
    input.isChangingPhone ||
    (input.step === "current_code" && input.currentCode.length !== 6) ||
    (input.step === "new_number" && !input.newPhoneValid) ||
    (input.step === "new_code" && input.newCode.length !== 6)
  )
}
