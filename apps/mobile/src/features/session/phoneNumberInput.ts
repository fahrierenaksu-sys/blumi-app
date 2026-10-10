import { parsePhoneNumberFromString } from "libphonenumber-js/max"

/** Only presentation separators may be removed; never repair arbitrary text. */
export function compactPhoneInput(value: string): string | null {
  if (value.length > 64 || /[^0-9+() \u00a0\u202f-]/u.test(value)) return null
  const compact = value.replace(/[() \u00a0\u202f-]/gu, "")
  if (!/^\+?[0-9]*$/.test(compact)) return null
  return compact
}

/** Number-plan validation is not evidence that a line is active or owned. */
export function normalizeInternationalSmsPhone(value: string): string | null {
  const compact = compactPhoneInput(value)
  if (!compact || !/^\+[1-9]\d{7,14}$/.test(compact)) return null
  const phone = parsePhoneNumberFromString(compact, { extract: false })
  const type = phone?.getType()
  return phone?.number === compact && phone.country && phone.isValid() &&
    (type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE") ? compact : null
}
