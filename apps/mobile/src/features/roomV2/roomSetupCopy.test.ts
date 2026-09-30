import assert from "node:assert/strict"
import test from "node:test"
import { getRoomSetupCopy } from "./roomSetupCopy"

test("room setup keeps the approved Turkish onboarding copy", () => {
  const copy = getRoomSetupCopy("tr")

  assert.equal(copy.headerTitle, "İlk odan")
  assert.equal(copy.completionLabel, "Odam hazır")
  assert.equal(copy.summaryTitle, "İlk köşen hazır")
  assert.equal(copy.giftBadge, "HEDİYE")
  assert.equal(copy.bedPlacedSummary, "Pembe Bulut Yatak odanda.")
  assert.equal(copy.bedPendingSummary, "Pembe Bulut Yatağı odana yerleştir.")
  assert.equal(copy.starterItemTitle, "Pembe Bulut Yatak")
  assert.equal(copy.starterItemHint, "Dokun veya odana sürükle")
  assert.equal(
    copy.starterItemAccessibilityLabel,
    "Pembe Bulut Yatak, ücretsiz başlangıç eşyası. Yerleştirmek için dokun veya odaya sürükle."
  )
  assert.equal(copy.bedPlacedCard, "Yatak yerleştirildi")
  assert.equal(copy.rotateBedAccessibilityLabel, "Pembe Bulut Yatağı çevir")
  assert.equal(copy.placement.longPressMove, "Basılı tutup sürükleyerek taşı.")
  assert.equal(copy.placement.dragToFloor, "Yatağı oda zeminine sürükle.")
  assert.equal(copy.placement.tapOrDrag, "Şimdi odada bir noktaya dokun ya da yatağı oraya sürükle.")
  assert.equal(copy.placement.rotated, "Yatak çevrildi. Taşımak için odaya dokun.")
  assert.equal(copy.feedback.mutationRejected, "Oda değişikliği uygulanamadı. Yeniden dene.")
  assert.equal(copy.feedback.persistenceAttention, "Oda kaydıyla ilgili bir sorun var. Güncel düzeni kontrol et.")
})

test("room setup reads fully in English on an English device", () => {
  const copy = getRoomSetupCopy("en")

  assert.equal(copy.headerTitle, "Your first room")
  assert.equal(copy.completionLabel, "My room is ready")
  assert.equal(copy.summaryTitle, "Your first corner is ready")
  assert.equal(copy.giftBadge, "GIFT")
  assert.equal(copy.starterItemTitle, "Pink Cloud Bed")
  assert.equal(copy.starterItemHint, "Tap or drag into your room")
  assert.equal(copy.bedPlacedCard, "Bed placed")
  assert.equal(copy.rotateBedAccessibilityLabel, "Rotate the Pink Cloud Bed")
  assert.equal(copy.placement.longPressMove, "Press and hold, then drag to move.")
  assert.equal(copy.placement.dragToFloor, "Drag the bed onto the room floor.")
  assert.equal(copy.placement.tapOrDrag, "Now tap a spot in the room or drag the bed there.")
  assert.equal(copy.feedback.mutationRejected, "That room change could not be applied. Please try again.")
  assert.equal(copy.feedback.persistenceAttention, "Room saving needs attention. Review the current layout.")
})

test("every room setup string exists in both locales", () => {
  const collect = (value: unknown, path = ""): string[] =>
    typeof value === "string"
      ? [path]
      : Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
          collect(child, path ? `${path}.${key}` : key)
        )
  const turkish = getRoomSetupCopy("tr")
  const english = getRoomSetupCopy("en")

  assert.deepEqual(collect(english), collect(turkish))
  for (const path of collect(english)) {
    const read = (copy: unknown) =>
      path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], copy)
    assert.ok(String(read(turkish)).trim().length > 0, `tr ${path}`)
    assert.ok(String(read(english)).trim().length > 0, `en ${path}`)
  }
})
