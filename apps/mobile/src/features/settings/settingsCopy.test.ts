import assert from "node:assert/strict"
import test from "node:test"
import { NOTIFICATION_PREFERENCE_ROWS } from "../notifications/notificationPreferencesModel"
import { getSettingsCopy } from "./settingsCopy"

test("settings copy keeps account and accessibility actions in both release languages", () => {
  assert.equal(getSettingsCopy("en").deleteAccount, "Delete my account")
  assert.equal(getSettingsCopy("tr").deleteAccount, "Hesabımı sil")
  assert.match(getSettingsCopy("tr").notificationToggle("Mesaj"), /bildirimleri/)
})

test("every notification preference row is written in both release languages", () => {
  for (const { key } of NOTIFICATION_PREFERENCE_ROWS) {
    const en = getSettingsCopy("en").notificationRows[key]
    const tr = getSettingsCopy("tr").notificationRows[key]
    assert.ok(en.label && en.description && tr.label && tr.description, key)
    assert.notEqual(tr.label, en.label, `${key} is translated`)
  }
  assert.match(getSettingsCopy("en").notificationRows.messagesEnabled.description, /room invite/i)
  assert.match(getSettingsCopy("tr").notificationRows.messagesEnabled.description, /oda davet/i)
})

test("the read receipts setting is named and explained as mutual in both languages", () => {
  assert.equal(getSettingsCopy("tr").readReceipts, "Okundu bilgisi")
  assert.equal(getSettingsCopy("en").readReceipts, "Read receipts")
  assert.match(getSettingsCopy("tr").readReceiptsNote, /karşılıklı/)
  assert.match(getSettingsCopy("tr").readReceiptsNote, /ikiniz de/)
  assert.match(getSettingsCopy("en").readReceiptsNote, /mutual/)
  assert.match(getSettingsCopy("en").readReceiptsNote, /both/)
})
