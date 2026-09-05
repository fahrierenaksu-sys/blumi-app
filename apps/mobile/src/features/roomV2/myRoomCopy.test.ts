import assert from "node:assert/strict"
import test from "node:test"
import { getMyRoomCopy, getMyRoomEditorCopy } from "./myRoomCopy"

test("My Room exposes Turkish and English labels for controls and feedback", () => {
  assert.equal(getMyRoomCopy("en").wardrobe, "Avatar Studio")
  assert.equal(getMyRoomCopy("tr").wardrobe, "Avatar Stüdyosu")
  assert.match(getMyRoomCopy("tr").chooseOpenFloor, /zemin/)
})

test("Room editor copy is localized from the same canonical room copy model", () => {
  const tr = getMyRoomEditorCopy("tr")
  const en = getMyRoomEditorCopy("en")

  assert.equal(tr.title, "Odanı düzenle")
  assert.equal(tr.collectionTitle, "Koleksiyonun")
  assert.equal(tr.save, "Kaydet")
  assert.equal(tr.categoryLabels.seating, "Koltuklar")
  assert.equal(tr.rotationLabels.back, "Arka")
  assert.equal(tr.piecesReady(4), "Yerleştirmeye hazır 4 eşya")
  assert.equal(tr.feedback.blocksAvatarPath, "Bu konum avatarın yolunu kapatıyor.")
  assert.equal(tr.surfaceDrop.tabletop, "Eşyayı masa veya destek yüzeyine sürükle.")
  assert.equal(tr.unsavedDialog.discard, "Değişiklikleri sil")
  assert.equal(tr.readiness.ready, "Avatar yolu açık")
  assert.equal(en.title, "Edit your room")
  assert.equal(en.categoryLabels.lighting, "Lighting")
  assert.equal(en.feedback.releaseToPlace, "Release to place.")
})

test("My Room copy owns showcase labels instead of screen literals", () => {
  const tr = getMyRoomCopy("tr")
  const en = getMyRoomCopy("en")

  assert.equal(tr.showcase, "Oda vitrini")
  assert.equal(tr.showcasePublicShort, "Açık")
  assert.equal(en.showcase, "Room showcase")
})
