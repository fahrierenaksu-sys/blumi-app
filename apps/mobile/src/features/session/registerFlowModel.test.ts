import assert from "node:assert/strict"
import test from "node:test"
import {
  advanceRegisterFlowToCode,
  analyzeLocalPhoneNumber,
  createInitialRegisterFlow,
  filterPhoneCountryOptions,
  getPhoneCountryOptions,
  getRegisterFlowAvailability,
  maskPhoneNumber,
  returnRegisterFlowToPhone,
  updateRegisterCode,
  updateRegisterCountry,
  updateRegisterPhone
} from "./registerFlowModel"

test("registration starts on the phone step with no actionable request", () => {
  const flow = createInitialRegisterFlow()

  assert.deepEqual(flow, {
    stage: "phone",
    selectedCountry: "TR",
    phoneNumber: "",
    verificationCode: ""
  })
  assert.deepEqual(getRegisterFlowAvailability(flow, false), {
    normalizedPhoneNumber: "",
    phoneValid: false,
    verificationCodeValid: false,
    canRequestCode: false,
    canVerify: false
  })
})

test("verification destinations keep only a short, useful phone hint", () => {
  assert.equal(maskPhoneNumber("+905551234567"), "+••• •• 4567")
  assert.equal(maskPhoneNumber("+14155550123"), "+••• •• 0123")
  assert.equal(maskPhoneNumber("+358401234567"), "+••• •• 4567")
  assert.equal(maskPhoneNumber("1234"), "1234")
})

test("country catalog covers global calling codes with Türkiye first", () => {
  const countries = getPhoneCountryOptions()

  assert.deepEqual(countries[0], {
    countryCode: "TR",
    name: "Türkiye",
    nativeName: "Türkiye",
    callingCode: "+90",
    flag: "🇹🇷"
  })
  assert.ok(countries.some((country) =>
    country.countryCode === "US" && country.callingCode === "+1"
  ))
  assert.ok(countries.some((country) =>
    country.countryCode === "GB" && country.callingCode === "+44"
  ))
  assert.ok(countries.length > 200)
})

test("country search understands names, ISO codes, and calling codes", () => {
  const countries = getPhoneCountryOptions()

  assert.equal(filterPhoneCountryOptions(countries, "turkiye")[0]?.countryCode, "TR")
  assert.equal(filterPhoneCountryOptions(countries, "TR")[0]?.countryCode, "TR")
  assert.equal(filterPhoneCountryOptions(countries, "+90")[0]?.countryCode, "TR")
  assert.ok(filterPhoneCountryOptions(countries, "united").length > 1)
})

test("Türkiye accepts mobile numbers without a trunk zero", () => {
  const invalid = updateRegisterPhone(createInitialRegisterFlow(), "0555 123 45 67")
  const valid = updateRegisterPhone(
    createInitialRegisterFlow(),
    "5551234567"
  )

  assert.equal(getRegisterFlowAvailability(invalid, false).canRequestCode, false)
  assert.equal(
    analyzeLocalPhoneNumber(invalid.phoneNumber, "TR").error,
    "tr-leading-zero"
  )
  assert.equal(valid.phoneNumber, "555 123 45 67")
  assert.deepEqual(getRegisterFlowAvailability(valid, false), {
    normalizedPhoneNumber: "+905551234567",
    phoneValid: true,
    verificationCodeValid: false,
    canRequestCode: true,
    canVerify: false
  })
  assert.equal(getRegisterFlowAvailability(valid, true).canRequestCode, false)
})

test("Türkiye rejects landlines and non-mobile prefixes", () => {
  assert.equal(analyzeLocalPhoneNumber("212 555 12 34", "TR").error, "tr-mobile-prefix")
  assert.equal(analyzeLocalPhoneNumber("455 512 34 56", "TR").error, "tr-mobile-prefix")
})

test("other selected countries format and validate their local numbers", () => {
  const usFlow = updateRegisterPhone(
    updateRegisterCountry(createInitialRegisterFlow(), "US"),
    "4155552671"
  )
  const gbFlow = updateRegisterPhone(
    updateRegisterCountry(createInitialRegisterFlow(), "GB"),
    "07400123456"
  )

  assert.equal(usFlow.phoneNumber, "(415) 555-2671")
  assert.equal(
    getRegisterFlowAvailability(usFlow, false).normalizedPhoneNumber,
    "+14155552671"
  )
  assert.equal(gbFlow.phoneNumber, "07400 123456")
  assert.equal(
    getRegisterFlowAvailability(gbFlow, false).normalizedPhoneNumber,
    "+447400123456"
  )
})

test("pasted E.164 numbers matching the selected country become formatted local input", () => {
  const trFlow = updateRegisterPhone(
    createInitialRegisterFlow("TR"),
    "+90 555 123 45 67"
  )
  const usFlow = updateRegisterPhone(
    createInitialRegisterFlow("US"),
    "+1 (415) 555-2671"
  )
  const gbFlow = updateRegisterPhone(
    createInitialRegisterFlow("GB"),
    "+44 7400 123456"
  )

  assert.equal(trFlow.phoneNumber, "555 123 45 67")
  assert.equal(usFlow.phoneNumber, "(415) 555-2671")
  assert.equal(gbFlow.phoneNumber, "07400 123456")
  assert.equal(
    getRegisterFlowAvailability(trFlow, false).normalizedPhoneNumber,
    "+905551234567"
  )
  assert.equal(
    getRegisterFlowAvailability(usFlow, false).normalizedPhoneNumber,
    "+14155552671"
  )
  assert.equal(
    getRegisterFlowAvailability(gbFlow, false).normalizedPhoneNumber,
    "+447400123456"
  )
})

test("a pasted E.164 number never overrides a mismatched selected country", () => {
  const trFlow = updateRegisterPhone(
    createInitialRegisterFlow("TR"),
    "+44 7400 123456"
  )
  const gbFlow = updateRegisterPhone(
    createInitialRegisterFlow("GB"),
    "+90 555 123 45 67"
  )

  assert.equal(getRegisterFlowAvailability(trFlow, false).phoneValid, false)
  assert.equal(getRegisterFlowAvailability(trFlow, false).normalizedPhoneNumber, "")
  assert.equal(getRegisterFlowAvailability(gbFlow, false).phoneValid, false)
  assert.equal(getRegisterFlowAvailability(gbFlow, false).normalizedPhoneNumber, "")
  assert.equal(trFlow.selectedCountry, "TR")
  assert.equal(gbFlow.selectedCountry, "GB")
})

test("shared +1 calling codes do not silently switch between US and Canada", () => {
  const canadaNumberForCanada = updateRegisterPhone(
    createInitialRegisterFlow("CA"),
    "+1 416 555 1234"
  )
  const canadaNumberForUs = updateRegisterPhone(
    createInitialRegisterFlow("US"),
    "+1 416 555 1234"
  )
  const usNumberForCanada = updateRegisterPhone(
    createInitialRegisterFlow("CA"),
    "+1 415 555 2671"
  )

  assert.equal(
    getRegisterFlowAvailability(canadaNumberForCanada, false).normalizedPhoneNumber,
    "+14165551234"
  )
  assert.equal(getRegisterFlowAvailability(canadaNumberForUs, false).phoneValid, false)
  assert.equal(getRegisterFlowAvailability(usNumberForCanada, false).phoneValid, false)
  assert.equal(canadaNumberForUs.selectedCountry, "US")
  assert.equal(usNumberForCanada.selectedCountry, "CA")
})

test("country catalog ordering is stable and ISO entries are unique", () => {
  const firstRead = getPhoneCountryOptions()
  const secondRead = getPhoneCountryOptions()
  const countryCodes = firstRead.map((country) => country.countryCode)

  assert.deepEqual(secondRead, firstRead)
  assert.equal(new Set(countryCodes).size, countryCodes.length)
  assert.equal(countryCodes.filter((countryCode) => countryCode === "TR").length, 1)
  assert.equal(countryCodes[0], "TR")
})

test("changing country clears the old number and verification code immutably", () => {
  const current = updateRegisterCode(
    advanceRegisterFlowToCode(
      updateRegisterPhone(createInitialRegisterFlow(), "5551234567")
    ),
    "123456"
  )
  const next = updateRegisterCountry(current, "GB")

  assert.deepEqual(next, {
    stage: "phone",
    selectedCountry: "GB",
    phoneNumber: "",
    verificationCode: ""
  })
  assert.equal(current.selectedCountry, "TR")
  assert.equal(current.verificationCode, "123456")
})

test("a successful SMS request advances immutably to the code step", () => {
  const phoneFlow = updateRegisterPhone(
    createInitialRegisterFlow(),
    "5551234567"
  )
  const codeFlow = advanceRegisterFlowToCode(phoneFlow)

  assert.notEqual(codeFlow, phoneFlow)
  assert.equal(phoneFlow.stage, "phone")
  assert.equal(codeFlow.stage, "code")
})

test("a newly sent code invalidates the previously entered local code", () => {
  const current = updateRegisterCode(
    advanceRegisterFlowToCode(
      updateRegisterPhone(createInitialRegisterFlow(), "+905551234567")
    ),
    "123456"
  )

  const next = advanceRegisterFlowToCode(current)

  assert.equal(next.stage, "code")
  assert.equal(next.verificationCode, "")
  assert.equal(current.verificationCode, "123456")
})

test("verification requires code step, six digits, and no active submit", () => {
  const phoneFlow = updateRegisterCode(
    updateRegisterPhone(createInitialRegisterFlow(), "+905551234567"),
    "123456"
  )
  const codeFlow = updateRegisterCode(
    advanceRegisterFlowToCode(phoneFlow),
    "123456"
  )

  assert.equal(getRegisterFlowAvailability(phoneFlow, false).canVerify, false)
  assert.equal(getRegisterFlowAvailability(codeFlow, false).canVerify, true)
  assert.equal(getRegisterFlowAvailability(codeFlow, true).canVerify, false)
  assert.equal(
    getRegisterFlowAvailability(updateRegisterCode(codeFlow, "12a34"), false)
      .canVerify,
    false
  )
})

test("changing the phone returns to step one and clears the old code", () => {
  const codeFlow = updateRegisterCode(
    advanceRegisterFlowToCode(
      updateRegisterPhone(createInitialRegisterFlow(), "+905551234567")
    ),
    "123456"
  )
  const next = returnRegisterFlowToPhone(codeFlow)

  assert.deepEqual(next, {
    stage: "phone",
    selectedCountry: "TR",
    phoneNumber: "555 123 45 67",
    verificationCode: ""
  })
  assert.equal(codeFlow.verificationCode, "123456")
})
