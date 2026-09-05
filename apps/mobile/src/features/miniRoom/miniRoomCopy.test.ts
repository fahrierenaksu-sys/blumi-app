import assert from "node:assert/strict"
import test from "node:test"
import { getMiniRoomCopy } from "./miniRoomCopy"

test("MiniRoom copy keeps the Turkish text chat and optional live-audio journey clear", () => {
  const copy = getMiniRoomCopy("tr")

  assert.equal(copy.voiceOff, "Canlı ses kapalı")
  assert.equal(copy.turnOnMicrophone, "Mikrofonu aç")
  assert.equal(copy.retry, "Tekrar dene")
  assert.equal(copy.safety, "Güvenlik")
  assert.equal(copy.roomMessage, "Oda mesajı")
  assert.equal(copy.roomMessagePlaceholder, "Küçük bir kıvılcım gönder...")
  assert.equal(copy.sendRoomMessage, "Oda mesajını gönder")
  assert.equal(copy.dismissRoomMessage, "Oda mesajını kapat")
  assert.equal(copy.sendReaction("wave"), "El sallama tepkisi gönder")
})

test("MiniRoom copy retains the English text chat and optional live-audio journey", () => {
  const copy = getMiniRoomCopy("en")

  assert.equal(copy.voiceOn, "Voice on")
  assert.equal(copy.muteMicrophone, "Mute microphone")
  assert.equal(copy.retry, "Retry")
  assert.equal(copy.safety, "Safety")
  assert.equal(copy.roomMessage, "Room message")
  assert.equal(copy.roomMessagePlaceholder, "Send a little spark...")
  assert.equal(copy.dismissRoomMessage, "Dismiss room message")
  assert.equal(copy.sendReaction("heart"), "Send heart reaction")
})
