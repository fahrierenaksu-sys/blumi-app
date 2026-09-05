import assert from "node:assert/strict"
import test from "node:test"
import { getSettingsCopy } from "./settingsCopy"

test("settings copy keeps account and accessibility actions in both release languages", () => {
  assert.equal(getSettingsCopy("en").deleteAccount, "Delete my account")
  assert.equal(getSettingsCopy("tr").deleteAccount, "Hesabımı sil")
  assert.match(getSettingsCopy("tr").notificationToggle("Mesaj"), /bildirimleri/)
})
