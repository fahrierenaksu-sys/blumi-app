import assert from "node:assert/strict"
import test from "node:test"
import { getSettingsCopy } from "./settingsCopy"
import {
  formatMyReportDate,
  getMyReportPresentation,
  isSettingsLoadPending,
  isVerificationCodeComplete,
  sanitizeVerificationCode
} from "./settingsPresentationModel"

test("settings panels treat idle and loading as the pending state", () => {
  assert.equal(isSettingsLoadPending("idle"), true)
  assert.equal(isSettingsLoadPending("loading"), true)
  assert.equal(isSettingsLoadPending("ready"), false)
  assert.equal(isSettingsLoadPending("error"), false)
})

test("verification codes keep digits only and complete at six digits", () => {
  assert.equal(sanitizeVerificationCode("12 3-4a56"), "123456")
  assert.equal(sanitizeVerificationCode(""), "")
  assert.equal(isVerificationCodeComplete("12345"), false)
  assert.equal(isVerificationCodeComplete("123456"), true)
  assert.equal(isVerificationCodeComplete("1234567"), false)
})

test("my reports format dates in the release locale", () => {
  const createdAt = "2026-03-04T12:00:00.000Z"
  assert.equal(formatMyReportDate(createdAt, "tr"), new Date(createdAt).toLocaleDateString("tr-TR"))
  assert.equal(formatMyReportDate(createdAt, "en"), new Date(createdAt).toLocaleDateString("en-GB"))
  assert.equal(formatMyReportDate(createdAt, "tr"), "04.03.2026")
  assert.equal(formatMyReportDate(createdAt, "en"), "04/03/2026")
})

test("my reports distinguish pending from reviewed reports in both languages", () => {
  for (const locale of ["en", "tr"] as const) {
    const copy = getSettingsCopy(locale)
    assert.deepEqual(getMyReportPresentation("pending", copy), {
      statusLabel: copy.reportPending,
      response: copy.reportPendingResponse
    })
    for (const status of ["resolved", "dismissed"] as const) {
      assert.deepEqual(getMyReportPresentation(status, copy), {
        statusLabel: copy.reportReviewed,
        response: copy.reportClosedResponse
      })
    }
  }
})
