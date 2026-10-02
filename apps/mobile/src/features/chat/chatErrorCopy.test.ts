import assert from "node:assert/strict"
import test from "node:test"
import {
  getMatchChatOpenErrorMessageForDisplay,
  getMessageListErrorMessageForDisplay,
  getMessageSendErrorMessageForDisplay,
  getRoomInvitationActionErrorMessageForDisplay,
  getRoomInvitationLoadErrorMessageForDisplay,
  getThreadListErrorMessageForDisplay,
  type ChatErrorLocale
} from "./chatErrorCopy"

const technicalError =
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
const TRANSPORT_DIAGNOSTICS = /fetch failed|Exception|\.swift|ExpoModulesCore/

const getters: Record<string, (error: string, locale: ChatErrorLocale) => string> = {
  threadList: getThreadListErrorMessageForDisplay,
  messageList: getMessageListErrorMessageForDisplay,
  matchOpen: getMatchChatOpenErrorMessageForDisplay,
  messageSend: getMessageSendErrorMessageForDisplay,
  roomInvitationLoad: getRoomInvitationLoadErrorMessageForDisplay,
  roomInvitationAction: getRoomInvitationActionErrorMessageForDisplay
}

function assertSafe(message: string, label: string): void {
  assert.ok(message.trim().length > 0, `${label} is empty`)
  assert.doesNotMatch(message, TRANSPORT_DIAGNOSTICS, `${label} leaks transport diagnostics`)
}

test("chat error fallbacks are localized without exposing transport diagnostics", () => {
  for (const [name, getMessage] of Object.entries(getters)) {
    const turkish = getMessage(technicalError, "tr")
    const english = getMessage(technicalError, "en")
    assertSafe(turkish, `${name} tr`)
    assertSafe(english, `${name} en`)
    assert.notEqual(turkish, english, `${name} has a Turkish fallback`)
  }
})

test("a known safe server message passes through unchanged", () => {
  assert.equal(
    getThreadListErrorMessageForDisplay("Chats need a connection.", "en"),
    "Chats need a connection."
  )
})

test("room busy errors explain whose room is active without leaking transport details", () => {
  for (const locale of ["tr", "en"] as const) {
    const self = getRoomInvitationActionErrorMessageForDisplay(technicalError, locale, "SELF_IN_ROOM")
    const partner = getRoomInvitationActionErrorMessageForDisplay(technicalError, locale, "PARTICIPANT_BUSY")
    const generic = getRoomInvitationActionErrorMessageForDisplay(technicalError, locale)
    for (const [label, message] of [["self", self], ["partner", partner], ["generic", generic]] as const) {
      assertSafe(message, `${label} ${locale}`)
    }
    assert.equal(new Set([self, partner, generic]).size, 3, `three distinct ${locale} messages`)
  }
})
