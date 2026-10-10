import assert from "node:assert/strict"
import test from "node:test"
import { normalizePhoneNumber } from "./phone"
import { smsDestinationCountry } from "./firebaseSmsAdmission"

const reservedExample = "+1" + "202" + "5550101"

test("API phone normalization rejects non-presentation characters rather than deleting them", () => {
  for (const suffix of ["x", "\n", "\r", "\t", "\u200b", "\u202e", "\u0000", " ext 9", "😀", "٠"]) {
    assert.equal(normalizePhoneNumber(reservedExample + suffix), null)
    assert.equal(smsDestinationCountry(reservedExample + suffix), null)
  }
  for (const input of [null, undefined, 123, [], {}, " ".repeat(65) + reservedExample, "++" + reservedExample]) {
    assert.equal(normalizePhoneNumber(input), null)
  }
})

test("accepted phone presentations share one canonical API identity", () => {
  const formatted = "+1 (202) 555-0101"
  for (const input of [reservedExample, formatted, formatted.replaceAll(" ", "\u00a0"), formatted.replaceAll(" ", "\u202f")]) {
    assert.deepEqual(normalizePhoneNumber(input), { e164: reservedExample })
    assert.equal(smsDestinationCountry(normalizePhoneNumber(input)!.e164), "US")
  }
})

test("SMS country resolution rejects invalid ranges, landlines and expensive non-mobile types", () => {
  for (const input of ["+1" + "200" + "5550101", "+44" + "20" + "79460000", "+1" + "800" + "5550101",
    "+1" + "900" + "5550101", reservedExample + " ext 1", reservedExample + "\n"]) {
    assert.equal(smsDestinationCountry(input), null)
  }
})
