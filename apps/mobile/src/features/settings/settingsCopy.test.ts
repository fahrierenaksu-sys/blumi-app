import assert from "node:assert/strict"
import test from "node:test"
import { getSettingsCopy } from "./settingsCopy"

test("settings copy keeps account and accessibility actions in both release languages", () => {
  assert.equal(getSettingsCopy("en").deleteAccount, "Delete my account")
  assert.equal(getSettingsCopy("tr").deleteAccount, "Hesabımı sil")
  assert.match(getSettingsCopy("tr").notificationToggle("Mesaj"), /bildirimleri/)
})

test("the read receipts setting is named and explained as mutual in both languages", () => {
  assert.equal(getSettingsCopy("tr").readReceipts, "Okundu bilgisi")
  assert.equal(getSettingsCopy("en").readReceipts, "Read receipts")
  assert.match(getSettingsCopy("tr").readReceiptsNote, /karşılıklı/)
  assert.match(getSettingsCopy("tr").readReceiptsNote, /ikiniz de/)
  assert.match(getSettingsCopy("en").readReceiptsNote, /mutual/)
  assert.match(getSettingsCopy("en").readReceiptsNote, /both/)
})
