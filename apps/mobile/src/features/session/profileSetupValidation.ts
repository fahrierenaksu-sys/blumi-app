export type ProfileSetupFieldError = "name" | "age" | null

export const PROFILE_AGE_DIGITS = 2

/**
 * Field errors appear once a field has been left (blur), never on the first
 * letter or digit (ONB-09). Once shown they follow the value live, so a fix
 * clears the message as soon as it is valid.
 */
export function getProfileSetupFieldError(input: {
  displayName: string
  ageText: string
  nameTouched: boolean
  ageTouched: boolean
}): ProfileSetupFieldError {
  const nameLength = input.displayName.trim().length
  const nameValid = nameLength >= 2 && nameLength <= 30
  const age = Number.parseInt(input.ageText, 10)
  const ageValid = Number.isFinite(age) && age >= 18 && age <= 99
  if (input.nameTouched && input.displayName.length > 0 && !nameValid) return "name"
  if (input.ageTouched && input.ageText.length > 0 && !ageValid) return "age"
  return null
}

/** A complete age closes the number pad, which has no return key. */
export function shouldDismissAgeKeyboard(ageText: string): boolean {
  return ageText.length === PROFILE_AGE_DIGITS
}
