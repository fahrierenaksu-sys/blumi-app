import assert from "node:assert/strict"
import test from "node:test"
import {
  getMatchChatOpenErrorMessageForDisplay,
  getMessageListErrorMessageForDisplay,
  getMessageSendErrorMessageForDisplay,
  getRoomInvitationActionErrorMessageForDisplay,
  getRoomInvitationLoadErrorMessageForDisplay,
  getThreadListErrorMessageForDisplay
} from "./chatErrorCopy"

const technicalError =
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"

test("chat error fallbacks are localized without exposing transport diagnostics", () => {
  assert.equal(
    getThreadListErrorMessageForDisplay(technicalError, "tr"),
    "Sohbetlerini şu anda yükleyemedik. Bağlantını kontrol edip tekrar dene."
  )
  assert.equal(
    getMessageListErrorMessageForDisplay(technicalError, "tr"),
    "Bu sohbeti şu anda yükleyemedik. Bağlantını kontrol edip tekrar dene."
  )
  assert.equal(
    getMatchChatOpenErrorMessageForDisplay(technicalError, "tr"),
    "Bu sohbeti şu anda açamadık. Bağlantını kontrol edip tekrar dene."
  )
  assert.equal(
    getMessageSendErrorMessageForDisplay(technicalError, "tr"),
    "Mesajın gönderilemedi. Bağlantını kontrol edip tekrar dene."
  )
  assert.equal(
    getRoomInvitationLoadErrorMessageForDisplay(technicalError, "tr"),
    "Oda davetlerini şu anda yükleyemedik. Biraz sonra tekrar dene."
  )
  assert.equal(
    getRoomInvitationActionErrorMessageForDisplay(technicalError, "tr"),
    "Bu oda daveti şu anda kullanılamıyor. Tekrar dene."
  )
})

test("room busy errors explain whose room is active without leaking transport details", () => {
  assert.equal(
    getRoomInvitationActionErrorMessageForDisplay("opaque", "tr", "SELF_IN_ROOM"),
    "Önceki ortak odan hâlâ açık. Yeni davet için önce onu kapatmalısın."
  )
  assert.equal(
    getRoomInvitationActionErrorMessageForDisplay("opaque", "en", "PARTICIPANT_BUSY"),
    "The other person is currently in another room. Try again later."
  )
})
