import assert from "node:assert/strict"
import test from "node:test"
import { getMiniRoomCopy } from "./miniRoomCopy"

test("MiniRoom copy keeps the Turkish text chat and optional live-audio journey clear", () => {
  const copy = getMiniRoomCopy("tr")

  // 2026-09-30 user-approved rename: match room / write something
  assert.equal(copy.roomTitle, "Eşleşme odası")
  assert.equal(copy.roomSubtitle("Bora"), "Sen & Bora")
  assert.equal(copy.youLabel, "Sen")
  assert.equal(copy.voiceOff, "Ses kapalı")
  assert.equal(copy.turnOnMicrophone, "Mikrofonu aç")
  assert.equal(copy.retry, "Tekrar dene")
  assert.equal(copy.safety, "Güvenlik")
  assert.equal(copy.roomMessage, "Oda mesajı")
  // 2026-09-30 user-approved rename: match room / write something
  assert.equal(copy.roomMessagePlaceholder, "Bir şey yaz…")
  assert.equal(copy.sendRoomMessage, "Oda mesajını gönder")
  assert.equal(copy.dismissRoomMessage, "Oda mesajını kapat")
  assert.equal(copy.sendReaction("wave"), "El sallama tepkisi gönder")
})

test("MiniRoom copy retains the English text chat and optional live-audio journey", () => {
  const copy = getMiniRoomCopy("en")

  // 2026-09-30 user-approved rename: match room / write something
  assert.equal(copy.roomTitle, "Match room")
  assert.equal(copy.roomSubtitle("Bora"), "You & Bora")
  assert.equal(copy.youLabel, "You")
  assert.equal(copy.voiceOn, "Voice on")
  assert.equal(copy.muteMicrophone, "Mute microphone")
  assert.equal(copy.retry, "Retry")
  assert.equal(copy.safety, "Safety")
  assert.equal(copy.roomMessage, "Room message")
  // 2026-09-30 user-approved rename: match room / write something
  assert.equal(copy.roomMessagePlaceholder, "Write something…")
  assert.equal(copy.dismissRoomMessage, "Dismiss room message")
  assert.equal(copy.sendReaction("heart"), "Send heart reaction")
})

test("MiniRoom chat panel, menu and state copy exist in both languages", () => {
  const tr = getMiniRoomCopy("tr")
  const en = getMiniRoomCopy("en")

  assert.equal(tr.roomOptions, "Oda seçenekleri")
  assert.equal(tr.safetyOptions, "Güvenlik seçenekleri")
  assert.equal(tr.openChatHistory, "Sohbet geçmişini aç")
  assert.equal(tr.hideChatHistory, "Sohbet geçmişini gizle")
  assert.equal(tr.historyEmpty, "Henüz mesaj yok")
  assert.equal(tr.messageNotSent, "Gönderilemedi")
  assert.equal(tr.messageFrom("Bora", "Selam"), "Bora: Selam")
  assert.equal(en.roomOptions, "Room options")
  assert.equal(en.historyEmpty, "No messages yet")
  assert.equal(en.voiceUnavailableHint, "Live voice isn't available in this version")

  // Every key is translated: no language falls back to the other's text.
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.equal(typeof tr[key], typeof en[key], key)
  }
  for (const key of ["connecting", "reconnecting", "connectionFailed", "sendFailedNotice", "historyFailed"] as const) {
    assert.notEqual(tr[key], en[key], key)
  }
})
