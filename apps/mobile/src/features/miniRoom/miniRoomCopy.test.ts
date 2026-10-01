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

test("MiniRoom copy carries no text for retired room controls", () => {
  // The room has no reaction buttons and no separate "text room" mode label;
  // their strings were unused leftovers of the retired lobby-era HUD.
  for (const copy of [getMiniRoomCopy("tr"), getMiniRoomCopy("en")]) {
    assert.equal("sendReaction" in copy, false)
    assert.equal("textRoom" in copy, false)
  }
})

test("an unconfirmed room close reads calmly: the person is already out", () => {
  const tr = getMiniRoomCopy("tr")
  const en = getMiniRoomCopy("en")
  assert.equal(tr.leftRoomUnconfirmed,
    "Odadan çıktın. Odanın kapandığı henüz onaylanmadı; bir sonraki davetinde kapatabilirsin.")
  assert.equal(en.leftRoomUnconfirmed,
    "You left the room. Its closing isn't confirmed yet; you can close it with your next invite.")
  // 2026-10-01 owner report: the old banner sounded like a failure and asked
  // for a retry inside a room the person had already chosen to leave.
  for (const text of [tr.leftRoomUnconfirmed, en.leftRoomUnconfirmed]) {
    assert.doesNotMatch(text, /doğrulanamadı|kontrol edip|tekrar dene|could not|check your connection|try again/i)
  }
  assert.equal("leaveNotConfirmed" in tr, false)
})

test("in-room presence, seat and takeover notices exist in Turkish and English", () => {
  const tr = getMiniRoomCopy("tr")
  const en = getMiniRoomCopy("en")
  assert.equal(tr.partnerHere("Bora"), "Bora odada")
  assert.equal(tr.partnerBack("Bora"), "Bora geri döndü")
  assert.equal(tr.partnerAway("Bora"), "Bora odadan uzaklaştı")
  assert.equal(tr.seatTaken, "Bu koltuk dolu")
  assert.equal(tr.continuedOnOtherDevice, "Bu oda diğer cihazında devam ediyor.")
  assert.equal(en.partnerHere("Bora"), "Bora is here")
  assert.equal(en.partnerBack("Bora"), "Bora is back")
  assert.equal(en.partnerAway("Bora"), "Bora stepped away")
  assert.equal(en.seatTaken, "That seat is taken")
  assert.equal(en.continuedOnOtherDevice, "This room continued on your other device.")
})
