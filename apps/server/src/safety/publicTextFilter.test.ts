import assert from "node:assert/strict"
import test from "node:test"
import { isPublicTextAllowed } from "./publicTextFilter"

test("allows ordinary Turkish and English social text", () => {
  for (const value of [
    "Merhaba, kahve içelim mi?",
    "I love this room",
    "Kendini iyi hissetmeni istiyorum",
    "Build your skills yourself."
  ]) {
    assert.equal(isPublicTextAllowed(value), true)
  }
})

test("blocks high-confidence threats and sexual-image solicitation before publication", () => {
  for (const value of [
    "kill yourself", "KENDİNİ ÖLDÜR", "I will kill you", "seni öldüreceğim",
    "send nudes", "çıplak foto gönder", "send nude photos"
  ]) {
    assert.equal(isPublicTextAllowed(value), false, value)
  }
})

test("blocks known harmful phrases when users insert punctuation or zero-width characters", () => {
  for (const value of [
    "k.i.l.l yourself",
    "k\u200Bi\u200Bl\u200Bl yourself",
    "s.e.n.d n.u.d.e.s",
    "c.i.p.l.a.k foto gönder"
  ]) {
    assert.equal(isPublicTextAllowed(value), false, value)
  }
})
